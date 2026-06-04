const { db } = require("../database");
const { v4: uuidv4 } = require("uuid");

const updateDriverLocation = (driverId, lat, lng) => {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO driver_locations (id, driver_id, lat, lng, updated_at) 
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(driver_id) DO UPDATE SET lat = ?, lng = ?, updated_at = CURRENT_TIMESTAMP`,
      [uuidv4(), driverId, lat, lng, lat, lng],
      function (err) {
        if (err) return reject(err);
        resolve({ driverId, lat, lng });
      }
    );
  });
};

const setDriverActive = (userId, isActive) => {
  return new Promise((resolve, reject) => {
    db.get("SELECT user_id FROM driver_profiles WHERE user_id = ?", [userId], (err, row) => {
      if (err) return reject(err);
      if (!row) {
        // Si no existe, crear perfil
        db.run(
          "INSERT INTO driver_profiles (id, user_id, is_active) VALUES (?, ?, ?)",
          [uuidv4(), userId, !!isActive],
          function (err) {
            if (err) return reject(err);
            resolve({ userId, isActive });
          }
        );
      } else {
        db.run(
          "UPDATE driver_profiles SET is_active = ? WHERE user_id = ?",
          [!!isActive, userId],
          function (err) {
            if (err) return reject(err);
            resolve({ userId, isActive });
          }
        );
      }
    });
  });
};

const getDriverProfile = (userId) => {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT dp.*, u.name, u.email, u.phone FROM driver_profiles dp JOIN users u ON dp.user_id = u.id WHERE dp.user_id = ?",
      [userId],
      (err, profile) => {
        if (err) return reject(err);
        if (!profile) {
          db.get("SELECT name, email, phone FROM users WHERE id = ?", [userId], (err, user) => {
            if (err) return reject(err);
            resolve({
              user_id: userId,
              name: user?.name,
              email: user?.email,
              phone: user?.phone,
              rating: 5.0,
              total_ratings: 0,
              is_active: false,
              license_number: null,
              vehicle_type: null,
              vehicle_model: null,
              vehicle_plate: null,
            });
          });
        } else {
          resolve(profile);
        }
      }
    );
  });
};

const updateDriverProfile = (userId, data) => {
  return new Promise((resolve, reject) => {
    const { licenseNumber, vehicleType, vehicleModel, vehiclePlate } = data;
    db.run(
      "UPDATE driver_profiles SET license_number = ?, vehicle_type = ?, vehicle_model = ?, vehicle_plate = ? WHERE user_id = ?",
      [licenseNumber, vehicleType, vehicleModel, vehiclePlate, userId],
      function (err) {
        if (err) return reject(err);
        resolve({ userId });
      }
    );
  });
};

const updateDriverRating = (driverId, rating) => {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE driver_profiles SET rating = ((rating * total_ratings) + ?) / (total_ratings + 1), total_ratings = total_ratings + 1 WHERE user_id = ?",
      [rating, driverId],
      function (err) {
        if (err) return reject(err);
        resolve({ driverId });
      }
    );
  });
};

const getAverageRating = (userId) => {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT AVG(rating) as average, COUNT(*) as count FROM ratings WHERE rated_id = ?",
      [userId],
      (err, result) => {
        if (err) return reject(err);
        resolve(result || { average: 0, count: 0 });
      }
    );
  });
};

module.exports = {
  updateDriverLocation,
  setDriverActive,
  getDriverProfile,
  updateDriverProfile,
  updateDriverRating,
  getAverageRating,
};
