const { db } = require("../database");
const { v4: uuidv4 } = require("uuid");

const createTrip = async (
  passengerId,
  pickupLat,
  pickupLng,
  pickupAddress,
  dropoffLat,
  dropoffLng,
  dropoffAddress,
  paymentMethod,
  fare = null,
  offeredFare = null,
  vehicleType = "car"
) => {
  return new Promise((resolve, reject) => {
    const id = uuidv4();
    
    db.run(
      "INSERT INTO trips (id, passenger_id, pickup_lat, pickup_lng, pickup_address, dropoff_lat, dropoff_lng, dropoff_address, status, payment_method, fare, offered_fare, vehicle_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)",
      [id, passengerId, pickupLat, pickupLng, pickupAddress, dropoffLat, dropoffLng, dropoffAddress, paymentMethod, fare, offeredFare, vehicleType],
      function (err) {
        if (err) return reject(err);
        db.get("SELECT * FROM trips WHERE id = ?", [id], (err, trip) => {
          if (err) return reject(err);
          resolve(trip);
        });
      }
    );
  });
};

const findNearbyDrivers = (lat, lng, radius = 10, vehicleType = null) => {
  return new Promise((resolve, reject) => {
    let query = `
      SELECT dl.driver_id, u.name, dp.vehicle_type, dp.vehicle_model, dp.vehicle_plate, dp.rating,
        (6371 * ACOS(
          COS(RADIANS(?)) * COS(RADIANS(dl.lat)) * 
          COS(RADIANS(dl.lng) - RADIANS(?)) + 
          SIN(RADIANS(?)) * SIN(RADIANS(dl.lat))
        )) as distance
      FROM driver_locations dl
      JOIN users u ON dl.driver_id = u.id
      JOIN driver_profiles dp ON u.id = dp.user_id
      WHERE dp.is_active = 1
    `;
    
    const params = [lat, lng, lat];
    
    // Add vehicle type filter if specified
    if (vehicleType) {
      if (vehicleType === 'car') {
        // If car, also show drivers with NULL vehicle_type (default car)
        query += ` AND (dp.vehicle_type = ? OR dp.vehicle_type IS NULL)`;
      } else {
        // If motorcycle, only show motorcycle
        query += ` AND dp.vehicle_type = ?`;
      }
      params.push(vehicleType);
    }
    
    query += ` ORDER BY distance ASC`;
    
    db.all(query, params, (err, drivers) => {
      if (err) return reject(err);
      resolve(drivers);
    });
  });
};

const getPendingTrips = (vehicleType = null) => {
  return new Promise((resolve, reject) => {
    let query = `
      SELECT t.*, u.name as passenger_name, t.vehicle_type 
      FROM trips t 
      JOIN users u ON t.passenger_id = u.id 
      WHERE t.status = 'pending'
    `;
    
    // Filtrar por tipo de vehículo si se especifica
    if (vehicleType) {
      if (vehicleType === 'car') {
        query += ` AND (t.vehicle_type = 'car' OR t.vehicle_type IS NULL)`;
      } else {
        query += ` AND t.vehicle_type = 'motorcycle'`;
      }
    }
    
    query += ` ORDER BY t.created_at DESC`;
    
    db.all(query, [], (err, trips) => {
      if (err) {
        console.error('Error in getPendingTrips:', err.message);
        return reject(err);
      }
      resolve(trips);
    });
  });
};

const getTripById = (id) => {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM trips WHERE id = ?", [id], (err, trip) => {
      if (err) return reject(err);
      if (!trip) return reject(new Error("Trip not found"));
      resolve(trip);
    });
  });
};

const updateTripStatus = (id, status, driverId = null, fare = null) => {
  return new Promise((resolve, reject) => {
    let query = "UPDATE trips SET status = ?, updated_at = CURRENT_TIMESTAMP";
    let params = [status, id];

    if (driverId) {
      query += ", driver_id = ?";
      params = [status, driverId, id];
    }
    if (fare) {
      query += ", fare = ?";
      params.splice(params.length - 1, 0, fare);
    }

    query += " WHERE id = ?";

    db.run(query, params, function (err) {
      if (err) return reject(err);
      resolve({ id, status });
    });
  });
};

const getTripHistory = (userId, role) => {
  return new Promise((resolve, reject) => {
    const column = role === "passenger" ? "passenger_id" : "driver_id";
    const joinColumn = role === "passenger" ? "driver_id" : "passenger_id";
    db.all(
      "SELECT t.*, u.name as other_name FROM trips t LEFT JOIN users u ON t." + joinColumn + " = u.id WHERE t." + column + " = ? ORDER BY t.created_at DESC",
      [userId],
      (err, trips) => {
        if (err) return reject(err);
        resolve(trips);
      }
    );
  });
};

const getDriverEarnings = (driverId) => {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT COUNT(*) as total_trips, COALESCE(SUM(fare) + SUM(bonus_amount), 0) as total_earnings, COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN fare + bonus_amount ELSE 0 END), 0) as collected, COALESCE(SUM(distance), 0) as total_distance FROM trips WHERE driver_id = ? AND status = 'completed'",
      [driverId],
      (err, result) => {
        if (err) return reject(err);
        resolve(result[0]);
      }
    );
  });
};

const getTripWithDetails = (id) => {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT t.*, p.name as passenger_name, p.email as passenger_email, d.name as driver_name, d.email as driver_email FROM trips t JOIN users p ON t.passenger_id = p.id LEFT JOIN users d ON t.driver_id = d.id WHERE t.id = ?",
      [id],
      (err, trip) => {
        if (err) return reject(err);
        if (!trip) return reject(new Error("Trip not found"));
        resolve(trip);
      }
    );
  });
};

const completeTrip = (id, distance, duration, fare, bonusAmount = 0) => {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE trips SET status = 'completed', distance = ?, duration = ?, fare = ?, bonus_amount = ?, payment_status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [distance, duration, fare, bonusAmount, id],
      function (err) {
        if (err) return reject(err);
        resolve({ id, status: "completed", fare, bonusAmount });
      }
    );
  });
};

const updateTripBonus = (id, bonusAmount) => {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE trips SET bonus_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [bonusAmount, id],
      function (err) {
        if (err) return reject(err);
        resolve({ id, bonusAmount });
      }
    );
  });
};

const getUserTrips = (userId) => {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT t.*, p.name as passenger_name, d.name as driver_name FROM trips t LEFT JOIN users p ON t.passenger_id = p.id LEFT JOIN users d ON t.driver_id = d.id WHERE t.passenger_id = ? OR t.driver_id = ? ORDER BY t.created_at DESC",
      [userId, userId],
      (err, trips) => {
        if (err) return reject(err);
        resolve(trips);
      }
    );
  });
};

const getDriverActiveTrip = (driverId) => {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT * FROM trips WHERE driver_id = ? AND status IN ('accepted', 'in_progress') ORDER BY created_at DESC LIMIT 1",
      [driverId],
      (err, trip) => {
        if (err) return reject(err);
        resolve(trip || null);
      }
    );
  });
};

const updateTripCounterOffer = (id, counterFare) => {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE trips SET counter_fare = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [counterFare, id],
      function (err) {
        if (err) return reject(err);
        resolve({ id, counterFare });
      }
    );
  });
};

const updateTripOfferedFare = (id, offeredFare, lastOfferBy) => {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE trips SET offered_fare = ?, counter_fare = NULL, last_offer_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [offeredFare, lastOfferBy, id],
      function (err) {
        if (err) return reject(err);
        resolve({ id, offeredFare, lastOfferBy });
      }
    );
  });
};

const clearTripCounterOffer = (id) => {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE trips SET counter_fare = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [id],
      function (err) {
        if (err) return reject(err);
        resolve({ id });
      }
    );
  });
};

const acceptOffer = (id, fare) => {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE trips SET status = 'accepted', fare = ?, offered_fare = ?, counter_fare = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [fare, fare, id],
      function (err) {
        if (err) return reject(err);
        resolve({ id, status: 'accepted', fare });
      }
    );
  });
};

const rejectOffer = (id) => {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE trips SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [id],
      function (err) {
        if (err) return reject(err);
        resolve({ id, status: 'cancelled' });
      }
    );
  });
};

const releaseTripForAnotherDriver = (id) => {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE trips SET status = 'pending', driver_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [id],
      function (err) {
        if (err) return reject(err);
        resolve({ id, status: 'pending' });
      }
    );
  });
};

module.exports = {
  createTrip,
  findNearbyDrivers,
  getPendingTrips,
  getTripById,
  getTripWithDetails,
  updateTripStatus,
  getTripHistory,
  getDriverEarnings,
  completeTrip,
  updateTripBonus,
  getUserTrips,
  getDriverActiveTrip,
  updateTripCounterOffer,
  updateTripOfferedFare,
  clearTripCounterOffer,
  acceptOffer,
  rejectOffer,
  releaseTripForAnotherDriver,
};
