const { db } = require("../database");
const { v4: uuidv4 } = require("uuid");

const getTodayKey = () => {
  return new Date().toISOString().split("T")[0];
};

const recordTripEarning = async (driverId, fare, distance) => {
  return new Promise((resolve, reject) => {
    const today = getTodayKey();

    db.get(
      "SELECT * FROM daily_earnings WHERE driver_id = ? AND date = ?",
      [driverId, today],
      (err, row) => {
        if (err) return reject(err);

        if (row) {
          db.run(
            "UPDATE daily_earnings SET total_trips = total_trips + 1, total_earnings = total_earnings + ?, total_distance = total_distance + ? WHERE id = ?",
            [fare, distance, row.id],
            function (err) {
              if (err) return reject(err);
              resolve({ today, fare, distance });
            }
          );
        } else {
          const id = uuidv4();
          db.run(
            "INSERT INTO daily_earnings (id, driver_id, date, total_trips, total_earnings, total_distance) VALUES (?, ?, ?, 1, ?, ?)",
            [id, driverId, today, fare, distance],
            function (err) {
              if (err) return reject(err);
              resolve({ today, fare, distance });
            }
          );
        }
      }
    );

    db.get(
      "SELECT * FROM platform_debts WHERE driver_id = ?",
      [driverId],
      (err, row) => {
        if (err) return;
        const platformFee = fare * 0.20;
        if (row) {
          db.run(
            "UPDATE platform_debts SET amount_owed = amount_owed + ?, updated_at = CURRENT_TIMESTAMP WHERE driver_id = ?",
            [platformFee, driverId]
          );
        } else {
          const id = uuidv4();
          db.run(
            "INSERT INTO platform_debts (id, driver_id, amount_owed, platform_percentage) VALUES (?, ?, ?, 20)",
            [id, driverId, platformFee]
          );
        }
      }
    );
  });
};

const getDailyEarnings = (driverId, filter = "day") => {
  return new Promise((resolve, reject) => {
    let dateCondition = "";
    const today = getTodayKey();

    switch (filter) {
      case "day":
        dateCondition = `date = '${today}'`;
        break;
      case "week":
        dateCondition = `date >= date('${today}', '-6 days') AND date <= '${today}'`;
        break;
      case "month":
        dateCondition = `date >= date('${today}', 'start of month') AND date <= '${today}'`;
        break;
      case "all":
        dateCondition = "1=1";
        break;
      default:
        dateCondition = `date = '${today}'`;
    }

    db.all(
      `SELECT * FROM daily_earnings WHERE driver_id = ? AND ${dateCondition} ORDER BY date DESC`,
      [driverId],
      (err, rows) => {
        if (err) return reject(err);

        const summary = {
          total_earnings: 0,
          total_trips: 0,
          total_distance: 0,
          days: rows,
        };

        rows.forEach((row) => {
          summary.total_earnings += row.total_earnings;
          summary.total_trips += row.total_trips;
          summary.total_distance += row.total_distance;
        });

        summary.platform_commission = summary.total_earnings * 0.25;
        summary.net_earnings = summary.total_earnings - summary.platform_commission;

        resolve(summary);
      }
    );
  });
};

const getPlatformDebt = (driverId) => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT pd.*, u.name as driver_name, u.email as driver_email
       FROM platform_debts pd
       JOIN users u ON pd.driver_id = u.id
       WHERE pd.driver_id = ?`,
      [driverId],
      (err, row) => {
        if (err) return reject(err);
        if (!row) {
          resolve({ driver_id: driverId, amount_owed: 0, platform_percentage: 25 });
        } else {
          resolve(row);
        }
      }
    );
  });
};

const updatePlatformDebt = (driverId, newAmount, notes = "", adminId = null) => {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT * FROM platform_debts WHERE driver_id = ?",
      [driverId],
      (err, row) => {
        if (err) return reject(err);

        if (row) {
          db.run(
            "UPDATE platform_debts SET amount_owed = ?, paid_by = ?, notes = ?, last_payment_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE driver_id = ?",
            [newAmount, adminId, notes, driverId],
            function (err) {
              if (err) return reject(err);
              resolve({ driver_id: driverId, amount_owed: newAmount });
            }
          );
        } else if (newAmount > 0) {
          const id = uuidv4();
          db.run(
            "INSERT INTO platform_debts (id, driver_id, amount_owed, paid_by, notes, last_payment_date) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
            [id, driverId, newAmount, adminId, notes],
            function (err) {
              if (err) return reject(err);
              resolve({ driver_id: driverId, amount_owed: newAmount });
            }
          );
        } else {
          resolve({ driver_id: driverId, amount_owed: 0 });
        }
      }
    );
  });
};

const getAllDriverDebts = () => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT pd.*, u.name as driver_name, u.email as driver_email,
        (SELECT COUNT(*) FROM trips WHERE driver_id = pd.driver_id AND status = 'completed') as total_completed_trips,
        (SELECT COALESCE(SUM(fare), 0) FROM trips WHERE driver_id = pd.driver_id AND status = 'completed') as lifetime_earnings
       FROM platform_debts pd
       JOIN users u ON pd.driver_id = u.id
       ORDER BY pd.amount_owed DESC`,
      [],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
};

const getDriverEarnings = (driverId) => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT 
        COALESCE(SUM(fare), 0) as total_earnings,
        COUNT(*) as total_trips,
        COALESCE(SUM(distance), 0) as total_distance,
        COALESCE(SUM(bonus_amount), 0) as total_bonuses
       FROM trips 
       WHERE driver_id = ? AND status = 'completed'`,
      [driverId],
      (err, tripSummary) => {
        if (err) return reject(err);
        
        const totalEarnings = tripSummary.total_earnings || 0;
        const platformCommission = totalEarnings * 0.20;
        const totalBonuses = tripSummary.total_bonuses || 0;
        const netEarnings = totalEarnings - platformCommission;
        const platformDebt = Math.max(0, platformCommission - totalBonuses);
        
        resolve({
          total_earnings: totalEarnings,
          total_trips: tripSummary.total_trips || 0,
          total_distance: tripSummary.total_distance || 0,
          platform_commission: platformCommission,
          total_bonuses: totalBonuses,
          net_earnings: netEarnings,
          platform_debt: platformDebt
        });
      }
    );
  });
};

module.exports = {
  recordTripEarning,
  getDailyEarnings,
  getPlatformDebt,
  updatePlatformDebt,
  getAllDriverDebts,
  getDriverEarnings,
};
