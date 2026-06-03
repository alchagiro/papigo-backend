const { db } = require("../database");
const { v4: uuidv4 } = require("uuid");
const driverModel = require("./driver");

const createRating = async (tripId, raterId, ratedId, rating, comment) => {
  return new Promise((resolve, reject) => {
    const id = uuidv4();

    db.run(
      "INSERT INTO ratings (id, trip_id, rater_id, rated_id, rating, comment) VALUES (?, ?, ?, ?, ?, ?)",
      [id, tripId, raterId, ratedId, rating, comment],
      function (err) {
        if (err) return reject(err);

        db.get("SELECT role FROM users WHERE id = ?", [ratedId], (err2, targetUser) => {
          if (!err2 && targetUser?.role === "driver") {
            driverModel.updateDriverRating(ratedId, rating);
          }
        });

        resolve({ id, tripId, raterId, ratedId, rating, comment });
      }
    );
  });
};

const getRating = (tripId) => {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM ratings WHERE trip_id = ?", [tripId], (err, rating) => {
      if (err) return reject(err);
      resolve(rating);
    });
  });
};

const getAverageRating = (userId) => {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT AVG(rating) as average, COUNT(*) as count FROM ratings WHERE rated_id = ?",
      [userId],
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
  });
};

module.exports = { createRating, getRating, getAverageRating };
