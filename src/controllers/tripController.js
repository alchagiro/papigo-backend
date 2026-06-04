const { db } = require("../database");
const tripModel = require("../models/trip");
const earningsModel = require("../models/earnings");
const bonusModel = require("../models/bonus");

const OUTSIDE_CITIES = ["palmira", "yumbo", "jamundi", "candelaria"];
const INTERCITY_SURCHARGE = 20000;

const isOutsideCity = (address) => {
  if (!address) return false;
  return OUTSIDE_CITIES.some(ciudad => address.toLowerCase().includes(ciudad));
};

const applyMinFare = (fare, vehicleType) => {
  const minFare = vehicleType === "motorcycle" ? 5000 : 7000;
  return Math.max(fare, minFare);
};

const requestTrip = async (req, res) => {
  try {
    console.log('Trip request body:', req.body);
    const { pickupLat, pickupLng, pickupAddress, dropoffLat, dropoffLng, dropoffAddress, paymentMethod, fare, bonusId, vehicleType, offeredFare } = req.body;
    console.log('vehicleType:', vehicleType);

    if (!pickupLat || !pickupLng || !dropoffLat || !dropoffLng || !pickupAddress || !dropoffAddress) {
      return res.status(400).json({ error: "Pickup and dropoff locations are required" });
    }

    let finalFare = applyMinFare(fare || 0, vehicleType || "car");
    let finalOfferedFare = offeredFare ? applyMinFare(offeredFare, vehicleType || "car") : null;

    if (isOutsideCity(dropoffAddress) || isOutsideCity(pickupAddress)) {
      finalFare = (finalFare || 0) + INTERCITY_SURCHARGE;
      if (finalOfferedFare) finalOfferedFare += INTERCITY_SURCHARGE;
    }
    let bonusAmount = 0;

    if (bonusId) {
      const bonus = await bonusModel.getBonusById(bonusId);
      if (bonus && bonus.passenger_id === req.user.id && !bonus.is_used) {
        bonusAmount = bonus.amount;
        await bonusModel.useBonus(bonusId, null);
        finalFare = Math.max(0, finalFare - bonusAmount);
      }
    }

    const trip = await tripModel.createTrip(
      req.user.id,
      pickupLat,
      pickupLng,
      pickupAddress,
      dropoffLat,
      dropoffLng,
      dropoffAddress,
      paymentMethod || "cash",
      finalFare,
      finalOfferedFare,
      vehicleType || "car"
    );

    if (bonusAmount > 0) {
      await tripModel.updateTripBonus(trip.id, bonusAmount);
    }

    // Emitir via socket a conductores del tipo de vehículo correcto
    const io = req.app.get("socketio");
    if (io) {
      // Buscar conductores cercanos del tipo de vehículo
      const nearbyDrivers = await tripModel.findNearbyDrivers(
        pickupLat, 
        pickupLng, 
        10, 
        vehicleType || "car"
      );
      
      // Notificar solo a los conductores del tipo correcto
      nearbyDrivers.forEach(driver => {
        io.to(`driver:${driver.driver_id}`).emit("new-trip-request", {
          tripId: trip.id,
          pickupLat,
          pickupLng,
          pickupAddress,
          dropoffLat,
          dropoffLng,
          dropoffAddress,
          fare: finalFare,
          offeredFare: finalOfferedFare,
          vehicleType: vehicleType || "car",
          passengerId: req.user.id,
        });
      });
    }

    res.status(201).json({ ...trip, bonusAmount, originalFare: fare });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const acceptTrip = async (req, res) => {
  try {
    const { tripId } = req.params;
    
    // Verificar si el conductor ya tiene un viaje activo
    const activeTrip = await tripModel.getDriverActiveTrip(req.user.id);
    if (activeTrip) {
      return res.status(400).json({ 
        error: "Ya tienes un viaje activo. Debes completar o cancelar el viaje actual antes de aceptar uno nuevo.",
        activeTripId: activeTrip.id,
        activeTripStatus: activeTrip.status
      });
    }
    
    await tripModel.updateTripStatus(tripId, "accepted", req.user.id);
    res.json({ message: "Trip accepted", id: tripId });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
};

const startTrip = async (req, res) => {
  try {
    const { tripId } = req.params;
    await tripModel.updateTripStatus(tripId, "in_progress");
    res.json({ message: "Trip started" });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
};

const completeTrip = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { distance, duration } = req.body;

    const trip = await tripModel.getTripById(tripId);
    if (!trip) {
      return res.status(404).json({ error: "Trip not found" });
    }

    await tripModel.completeTrip(tripId, distance, duration, trip.fare, trip.bonus_amount || 0);

    if (trip.driver_id) {
      await earningsModel.recordTripEarning(trip.driver_id, trip.fare || 0, distance);
      
      if (trip.bonus_amount && trip.bonus_amount > 0) {
        const currentDebt = await earningsModel.getPlatformDebt(trip.driver_id);
        const newDebt = Math.max(0, (currentDebt.amount_owed || 0) - trip.bonus_amount);
        await earningsModel.updatePlatformDebt(trip.driver_id, newDebt, `Bono aplicado: ${trip.bonus_amount}`, null);
      }
    }

    res.json({ message: "Trip completed", fare: trip.fare, bonusAmount: trip.bonus_amount || 0 });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
};

const cancelTrip = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { reason } = req.body || {};
    
    console.log("Cancel trip request:", { tripId, userId: req.user?.id, reason });
    
    const trip = await tripModel.getTripById(tripId);
    if (!trip) {
      return res.status(404).json({ error: "Trip not found" });
    }
    
    console.log("Trip found:", { tripId: trip.id, driverId: trip.driver_id, status: trip.status });
    
    const isDriver = trip.driver_id === req.user.id;
    const isPassenger = trip.passenger_id === req.user.id;
    
    console.log("User role:", { isDriver, isPassenger, userId: req.user.id });
    
    if (!isDriver && !isPassenger) {
      return res.status(403).json({ error: "Not authorized" });
    }
    
    // If driver cancels during "accepted" status, release trip for another driver
    if (isDriver && trip.status === "accepted") {
      await tripModel.releaseTripForAnotherDriver(tripId);
      
      const io = req.app.get("socketio");
      if (io) {
        io.to(`trip:${tripId}`).emit("driver-cancelled", {
          tripId,
          message: "El conductor canceló. Buscando otro conductor cercano...",
          cancelledBy: 'driver'
        });
        
        const nearbyDrivers = await tripModel.findNearbyDrivers(
          trip.pickup_lat, 
          trip.pickup_lng, 
          10, 
          trip.vehicle_type
        );
        
        nearbyDrivers.forEach(driver => {
          io.to(`driver:${driver.driver_id}`).emit("new-trip-request", {
            tripId: trip.id,
            pickupLat: trip.pickup_lat,
            pickupLng: trip.pickup_lng,
            pickupAddress: trip.pickup_address,
            dropoffLat: trip.dropoff_lat,
            dropoffLng: trip.dropoff_lng,
            dropoffAddress: trip.dropoff_address,
            fare: trip.fare,
            offeredFare: trip.offered_fare,
            vehicleType: trip.vehicle_type,
            passengerId: trip.passenger_id,
          });
        });
      }
      
      return res.json({ 
        message: "Trip released for another driver",
        status: "pending",
        tripId 
      });
    }
    
    // If driver cancels during "in_progress" or passenger cancels, cancel the trip completely
    await tripModel.updateTripStatus(tripId, "cancelled");
    
    const io = req.app.get("socketio");
    if (io) {
      io.to(`trip:${tripId}`).emit("trip-cancelled", {
        tripId,
        message: reason || (isDriver ? "El conductor canceló el viaje" : "El pasajero canceló el viaje"),
        cancelledBy: isDriver ? 'driver' : 'passenger'
      });
    }
    
    res.json({ message: "Trip cancelled", status: "cancelled" });
  } catch (error) {
    console.error("Cancel trip error:", error);
    res.status(500).json({ error: error.message });
  }
};

const getTripDetails = async (req, res) => {
  try {
    const { tripId } = req.params;
    const trip = await tripModel.getTripWithDetails(tripId);
    res.json(trip);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
};

const getDriverEarnings = async (req, res) => {
  try {
    const earnings = await earningsModel.getDriverEarnings(req.user.id);
    res.json(earnings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getTripHistory = async (req, res) => {
  try {
    const trips = await tripModel.getTripHistory(req.user.id, req.user.role);
    res.json(trips);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getPendingTrips = async (req, res) => {
  try {
    // Si es conductor, filtrar por su tipo de vehículo
    let vehicleType = null;
    if (req.user.role === "driver") {
      const driverProfile = await new Promise((resolve, reject) => {
        db.get("SELECT vehicle_type FROM driver_profiles WHERE user_id = ?", [req.user.id], (err, row) => {
          if (err) return reject(err);
          resolve(row);
        });
      });
      vehicleType = driverProfile?.vehicle_type || 'car';
    }
    
    const trips = await tripModel.getPendingTrips(vehicleType);
    res.json(trips);
  } catch (error) {
    console.error('Error in getPendingTrips:', error.message);
    res.status(500).json({ error: error.message });
  }
};

const calculateFare = async (req, res) => {
  try {
    const { pickupLat, pickupLng, dropoffLat, dropoffLng, vehicleType, pickupAddress, dropoffAddress } = req.method === "POST" ? req.body : req.query;
    const R = 6371;
    const dLat = ((dropoffLat - pickupLat) * Math.PI) / 180;
    const dLng = ((dropoffLng - pickupLng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((pickupLat * Math.PI) / 180) *
        Math.cos((dropoffLat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    let perKm;
    
    let minFare;
    if (vehicleType === "motorcycle") {
      perKm = 1500;
      minFare = 5000;
    } else {
      perKm = 2000;
      minFare = 7000;
    }

    const estimatedDuration = (distance / 30) * 60;
    let fare = Math.max(distance * perKm, minFare);

    if (isOutsideCity(dropoffAddress) || isOutsideCity(pickupAddress)) {
      fare += INTERCITY_SURCHARGE;
    }

    res.json({
      distance: parseFloat(distance.toFixed(2)),
      duration: Math.round(estimatedDuration),
      fare: Math.round(fare),
      vehicleType,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getTripBonuses = async (req, res) => {
  try {
    const { tripId } = req.params;
    const trip = await tripModel.getTripById(tripId);
    
    if (!trip) {
      return res.status(404).json({ error: "Trip not found" });
    }
    
    if (req.user.role === "driver" && trip.driver_id !== req.user.id) {
      return res.status(403).json({ error: "Not authorized" });
    }
    
    const bonuses = await bonusModel.getActiveBonuses(trip.passenger_id);
    res.json(bonuses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const applyBonusToTrip = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { bonusId } = req.body;

    const trip = await tripModel.getTripById(tripId);
    if (!trip) {
      return res.status(404).json({ error: "Trip not found" });
    }
    if (trip.status !== "completed") {
      return res.status(400).json({ error: "Trip must be completed to apply bonus" });
    }
    if (trip.passenger_id !== req.user.id) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const bonus = await bonusModel.getBonusById(bonusId);
    if (!bonus || bonus.passenger_id !== req.user.id || bonus.is_used) {
      return res.status(400).json({ error: "Invalid or already used bonus" });
    }

    await bonusModel.useBonus(bonusId, tripId);
    await tripModel.updateTripBonus(tripId, bonus.amount);

    if (trip.driver_id) {
      const currentDebt = await earningsModel.getPlatformDebt(trip.driver_id);
      const newDebt = Math.max(0, (currentDebt.amount_owed || 0) - bonus.amount);
      await earningsModel.updatePlatformDebt(trip.driver_id, newDebt, `Bono aplicado por pasajero: ${bonus.description || bonus.id}`, null);
    }

    res.json({ message: "Bono aplicado correctamente", bonusAmount: bonus.amount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const counterOffer = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { counterFare } = req.body;
    
    if (!counterFare || counterFare <= 0 || isNaN(counterFare)) {
      return res.status(400).json({ error: "Valid counter-offer amount is required" });
    }
    
    const trip = await tripModel.getTripById(tripId);
    if (!trip) {
      return res.status(404).json({ error: "Trip not found" });
    }
    
    const isDriver = trip.driver_id === req.user.id;
    const isPassenger = trip.passenger_id === req.user.id;
    
    if (!isDriver && !isPassenger) {
      return res.status(403).json({ error: "Not authorized" });
    }
    
    if (trip.status !== "accepted") {
      return res.status(400).json({ error: "Can only make counter-offer for accepted trips" });
    }
    
    const finalCounterFare = applyMinFare(counterFare, trip.vehicle_type || "car");

    try {
      if (isDriver) {
        await tripModel.updateTripOfferedFare(tripId, finalCounterFare, 'driver');
      } else {
        await tripModel.updateTripOfferedFare(tripId, finalCounterFare, 'passenger');
      }
    } catch (dbError) {
      console.error("Database error in counterOffer:", dbError);
      return res.status(500).json({ error: "Database error: " + dbError.message });
    }
    
    const io = req.app.get("socketio");
    if (io) {
      io.to(`trip:${tripId}`).emit("negotiation-update", {
        tripId,
        counterFare,
        offeredFare: counterFare,
        madeBy: isDriver ? 'driver' : 'passenger',
        message: `${isDriver ? 'Driver' : 'Passenger'} counter-offered: ${counterFare}`
      });
    }
    
    res.json({ message: "Counter-offer sent", counterFare });
  } catch (error) {
    console.error("CounterOffer error:", error);
    res.status(500).json({ error: error.message });
  }
};

const acceptOffer = async (req, res) => {
  try {
    const { tripId } = req.params;
    
    const trip = await tripModel.getTripById(tripId);
    if (!trip) {
      return res.status(404).json({ error: "Trip not found" });
    }
    
    const isDriver = trip.driver_id === req.user.id;
    const isPassenger = trip.passenger_id === req.user.id;
    
    if (!isDriver && !isPassenger) {
      return res.status(403).json({ error: "Not authorized" });
    }
    
    // Check if there's a negotiated price to accept
    const negotiatedFare = trip.offered_fare || trip.fare;
    if (!negotiatedFare) {
      return res.status(400).json({ error: "No offer to accept" });
    }
    
    // Update the trip fare and mark as negotiated
    await tripModel.acceptOffer(tripId, negotiatedFare);
    
    // Get the updated trip
    const updatedTrip = await tripModel.getTripById(tripId);
    
    // Notify both parties
    const io = req.app.get("socketio");
    if (io) {
      io.to(`trip:${tripId}`).emit("offer-accepted", {
        tripId,
        fare: negotiatedFare,
        message: "Offer accepted! The trip is now confirmed."
      });
    }
    
    res.json({ message: "Offer accepted", trip: updatedTrip });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const rejectOffer = async (req, res) => {
  try {
    const { tripId } = req.params;
    
    const trip = await tripModel.getTripById(tripId);
    if (!trip) {
      return res.status(404).json({ error: "Trip not found" });
    }
    
    const isDriver = trip.driver_id === req.user.id;
    const isPassenger = trip.passenger_id === req.user.id;
    
    if (!isDriver && !isPassenger) {
      return res.status(403).json({ error: "Not authorized" });
    }
    
    // If driver rejects during "accepted" status (negotiation), release for another driver
    if (isDriver && trip.status === "accepted") {
      await tripModel.releaseTripForAnotherDriver(tripId);
      
      const io = req.app.get("socketio");
      if (io) {
        io.to(`trip:${tripId}`).emit("driver-cancelled", {
          tripId,
          message: "El conductor canceló. Buscando otro conductor cercano...",
          cancelledBy: 'driver'
        });
        
        const nearbyDrivers = await tripModel.findNearbyDrivers(
          trip.pickup_lat, 
          trip.pickup_lng, 
          10, 
          trip.vehicle_type
        );
        
        nearbyDrivers.forEach(driver => {
          io.to(`driver:${driver.driver_id}`).emit("new-trip-request", {
            tripId: trip.id,
            pickupLat: trip.pickup_lat,
            pickupLng: trip.pickup_lng,
            pickupAddress: trip.pickup_address,
            dropoffLat: trip.dropoff_lat,
            dropoffLng: trip.dropoff_lng,
            dropoffAddress: trip.dropoff_address,
            fare: trip.fare,
            offeredFare: trip.offered_fare,
            vehicleType: trip.vehicle_type,
            passengerId: trip.passenger_id,
          });
        });
      }
      
      return res.json({ 
        message: "Trip released for another driver", 
        status: "pending",
        tripId 
      });
    }
    
    // Otherwise, cancel the trip completely
    await tripModel.rejectOffer(tripId);
    
    const io = req.app.get("socketio");
    if (io) {
      io.to(`trip:${tripId}`).emit("offer-rejected", {
        tripId,
        message: `${isDriver ? 'Driver' : 'Passenger'} rejected the offer - trip cancelled`
      });
    }
    
    res.json({ message: "Offer rejected - trip cancelled" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get user's active bonuses
const getUserBonuses = async (req, res) => {
  try {
    const bonuses = await bonusModel.getActiveBonuses(req.user.id);
    res.json(bonuses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  requestTrip,
  acceptTrip,
  startTrip,
  completeTrip,
  cancelTrip,
  getTripDetails,
  getTripHistory,
  getPendingTrips,
  getDriverEarnings,
  calculateFare,
  getTripBonuses,
  applyBonusToTrip,
  getUserBonuses,
  counterOffer,
  acceptOffer,
  rejectOffer,
};
