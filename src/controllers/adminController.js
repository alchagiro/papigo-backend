const earningsModel = require("../models/earnings");
const userModel = require("../models/user");
const tripModel = require("../models/trip");
const bonusModel = require("../models/bonus");
const { db } = require("../database");

const getAllDriverDebts = async (req, res) => {
  try {
    const debts = await earningsModel.getAllDriverDebts();
    res.json(debts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updatePlatformDebt = async (req, res) => {
  try {
    const { driverId, amount, notes } = req.body;
    const result = await earningsModel.updatePlatformDebt(driverId, amount, notes, req.user.id);
    res.json({ message: "Deuda actualizada", ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const resetPlatformDebt = async (req, res) => {
  try {
    const { driverId, notes } = req.body;
    const result = await earningsModel.updatePlatformDebt(driverId, 0, notes || "Pago recibido - reiniciado por admin", req.user.id);
    res.json({ message: "Deuda reiniciada", ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const { role } = req.query;
    const users = await userModel.getAllUsers(role || null);
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getUserById = async (req, res) => {
  try {
    const user = await userModel.getUserById(req.params.userId);
    res.json(user);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
};

const getUserTrips = async (req, res) => {
  try {
    const trips = await tripModel.getUserTrips(req.params.userId);
    res.json(trips);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const suspendUser = async (req, res) => {
  try {
    const { userId, reason } = req.body;
    await userModel.suspendUser(userId, reason);
    res.json({ message: "Usuario suspendido" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const reactivateUser = async (req, res) => {
  try {
    const { userId } = req.body;
    await userModel.reactivateUser(userId);
    res.json({ message: "Usuario reactivado" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { userId } = req.body;
    await userModel.deleteUser(userId);
    res.json({ message: "Usuario eliminado" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const activateDriverAccount = async (req, res) => {
  try {
    const { userId, vehicleType } = req.body;
    
    // Activar conductor
    await userModel.activateDriver(userId);
    
    // Si se proporciona tipo de vehiculo, actualizar perfil
    if (vehicleType && ['car', 'motorcycle'].includes(vehicleType)) {
      await new Promise((resolve, reject) => {
        db.run(
           `INSERT OR IGNORE INTO driver_profiles (id, user_id, vehicle_type, is_active) 
            VALUES (?, ?, ?, TRUE)`,
          [require("crypto").randomUUID(), userId, vehicleType],
          function (err) {
            if (err) return reject(err);
            // Si ya existía, actualizar
            db.run(
              "UPDATE driver_profiles SET vehicle_type = ?, is_active = TRUE WHERE user_id = ?",
              [vehicleType, userId],
              function (err2) {
                if (err2) return reject(err2);
                resolve();
              }
            );
          }
        );
      });
    }
    
    res.json({ message: "Conductor activado exitosamente" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createBonus = async (req, res) => {
  try {
    const { passengerId, amount, description } = req.body;
    const bonus = await bonusModel.createBonus(passengerId, amount, description, req.user.id);
    res.status(201).json(bonus);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createAdminUser = async (req, res) => {
  try {
    const { name, email, phone, password, role } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email and password are required" });
    }
    
    if (!["passenger", "driver", "admin"].includes(role)) {
      return res.status(400).json({ error: "Role must be passenger, driver or admin" });
    }
    
    // Verificar si el email ya existe
    const existingUser = await new Promise((resolve, reject) => {
      db.get("SELECT id FROM users WHERE email = ?", [email], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
    
    if (existingUser) {
      return res.status(400).json({ error: "Email already registered" });
    }
    
    const hashedPassword = require("bcryptjs").hashSync(password, 10);
    const id = require("crypto").randomUUID();
    const isActive = role !== 'driver';
    
    await new Promise((resolve, reject) => {
      db.run(
        "INSERT INTO users (id, name, email, phone, password, role, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [id, name, email, phone || null, hashedPassword, role, isActive],
        function (err) {
          if (err) return reject(err);
          resolve();
        }
      );
    });
    
    res.status(201).json({ 
      message: "Usuario creado exitosamente",
      user: { id, name, email, phone, role, is_active: isActive }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getPassengerBonuses = async (req, res) => {
  try {
    const bonuses = await bonusModel.getPassengerBonuses(req.params.passengerId);
    res.json(bonuses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getDashboardStats = async (req, res) => {
  try {
    const stats = {};
    
    const totalTrips = await new Promise((resolve, reject) => {
      db.get("SELECT COUNT(*) as count FROM trips", [], (err, row) => {
        if (err) return reject(err);
        resolve(row.count);
      });
    });
    
    const todayTrips = await new Promise((resolve, reject) => {
      db.get("SELECT COUNT(*) as count FROM trips WHERE DATE(created_at) = DATE('now')", [], (err, row) => {
        if (err) return reject(err);
        resolve(row.count);
      });
    });
    
    const totalRevenue = await new Promise((resolve, reject) => {
      db.get("SELECT COALESCE(SUM(fare), 0) as total FROM trips WHERE status = 'completed'", [], (err, row) => {
        if (err) return reject(err);
        resolve(row.total);
      });
    });
    
    const todayRevenue = await new Promise((resolve, reject) => {
      db.get("SELECT COALESCE(SUM(fare), 0) as total FROM trips WHERE status = 'completed' AND DATE(created_at) = DATE('now')", [], (err, row) => {
        if (err) return reject(err);
        resolve(row.total);
      });
    });
    
    const totalDebt = await new Promise((resolve, reject) => {
      db.get("SELECT COALESCE(SUM(amount_owed), 0) as total FROM platform_debts", [], (err, row) => {
        if (err) return reject(err);
        resolve(row.total);
      });
    });
    
    const totalUsers = await new Promise((resolve, reject) => {
      db.get("SELECT COUNT(*) as count FROM users", [], (err, row) => {
        if (err) return reject(err);
        resolve(row.count);
      });
    });
    
    const totalDrivers = await new Promise((resolve, reject) => {
      db.get("SELECT COUNT(*) as count FROM users WHERE role = 'driver'", [], (err, row) => {
        if (err) return reject(err);
        resolve(row.count);
      });
    });
    
    const totalPassengers = await new Promise((resolve, reject) => {
      db.get("SELECT COUNT(*) as count FROM users WHERE role = 'passenger'", [], (err, row) => {
        if (err) return reject(err);
        resolve(row.count);
      });
    });
    
    const weeklyTrips = await new Promise((resolve, reject) => {
      db.all(
        `SELECT DATE(created_at) as date, COUNT(*) as trips, COALESCE(SUM(fare), 0) as revenue
         FROM trips
         WHERE created_at >= DATE('now', '-7 days')
         GROUP BY DATE(created_at)
         ORDER BY date`,
        [],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        }
      );
    });
    
    const topDrivers = await new Promise((resolve, reject) => {
      db.all(
        `SELECT u.name, COUNT(t.id) as trips, COALESCE(SUM(t.fare), 0) as earnings
         FROM trips t
         JOIN users u ON t.driver_id = u.id
         WHERE t.status = 'completed'
         GROUP BY u.name, t.driver_id
         ORDER BY earnings DESC
         LIMIT 5`,
        [],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        }
      );
    });
    
    const topPassengers = await new Promise((resolve, reject) => {
      db.all(
        `SELECT u.name, COUNT(t.id) as trips
         FROM trips t
         JOIN users u ON t.passenger_id = u.id
         WHERE t.status = 'completed'
         GROUP BY u.name, t.passenger_id
         ORDER BY trips DESC
         LIMIT 5`,
        [],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        }
      );
    });
    
    const tripsByStatus = await new Promise((resolve, reject) => {
      db.all(
        `SELECT status, COUNT(*) as count FROM trips GROUP BY status`,
        [],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        }
      );
    });
    
    stats.totalTrips = totalTrips;
    stats.todayTrips = todayTrips;
    stats.totalRevenue = totalRevenue;
    stats.todayRevenue = todayRevenue;
    stats.totalDebt = totalDebt;
    stats.totalUsers = totalUsers;
    stats.totalDrivers = totalDrivers;
    stats.totalPassengers = totalPassengers;
    stats.weeklyTrips = weeklyTrips;
    stats.topDrivers = topDrivers;
    stats.topPassengers = topPassengers;
    stats.tripsByStatus = tripsByStatus;
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getAllDriverDebts,
  updatePlatformDebt,
  resetPlatformDebt,
  getAllUsers,
  getUserById,
  getUserTrips,
  suspendUser,
  reactivateUser,
  deleteUser,
  createBonus,
  getPassengerBonuses,
  activateDriverAccount,
  createAdminUser,
  getDashboardStats,
};
