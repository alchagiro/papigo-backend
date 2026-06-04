const { db } = require("../database");
const { v4: uuidv4 } = require("uuid");

const createBonus = (passengerId, amount, description, adminId) => {
  return new Promise((resolve, reject) => {
    const id = uuidv4();
    db.run(
      "INSERT INTO bonuses (id, passenger_id, amount, description, created_by) VALUES (?, ?, ?, ?, ?)",
      [id, passengerId, amount, description, adminId],
      function (err) {
        if (err) return reject(err);
        resolve({ id, passengerId, amount, description });
      }
    );
  });
};

const getPassengerBonuses = (passengerId) => {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT * FROM bonuses WHERE passenger_id = ? ORDER BY created_at DESC",
      [passengerId],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
};

const getActiveBonuses = (passengerId) => {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT * FROM bonuses WHERE passenger_id = ? AND is_used = FALSE ORDER BY amount DESC",
      [passengerId],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
};

const useBonus = (bonusId, tripId) => {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE bonuses SET is_used = TRUE, used_trip_id = ?, used_at = CURRENT_TIMESTAMP WHERE id = ?",
      [tripId, bonusId],
      function (err) {
        if (err) return reject(err);
        resolve({ bonusId, tripId });
      }
    );
  });
};

const getBonusById = (bonusId) => {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM bonuses WHERE id = ?", [bonusId], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
};

module.exports = {
  createBonus,
  getPassengerBonuses,
  getActiveBonuses,
  useBonus,
  getBonusById,
};
