const driverModel = require("../models/driver");
const tripModel = require("../models/trip");

const updateLocation = async (req, res) => {
  try {
    const { lat, lng } = req.body;
    await driverModel.updateDriverLocation(req.user.id, lat, lng);
    res.json({ message: "Location updated" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const toggleActive = async (req, res) => {
  try {
    const { isActive } = req.body;
    
    // Si intenta desconectarse, verificar que no tenga viaje activo
    if (!isActive) {
      const activeTrip = await tripModel.getDriverActiveTrip(req.user.id);
      if (activeTrip) {
        return res.status(400).json({ 
          error: "No puedes desconectarte mientras tienes un viaje activo. Completa o cancela el viaje primero.",
          activeTripId: activeTrip.id,
          activeTripStatus: activeTrip.status
        });
      }
    }
    
    await driverModel.setDriverActive(req.user.id, isActive);
    res.json({ message: isActive ? "Driver activated" : "Driver deactivated" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getProfile = async (req, res) => {
  try {
    const profile = await driverModel.getDriverProfile(req.user.id);
    res.json(profile);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    await driverModel.updateDriverProfile(req.user.id, req.body);
    res.json({ message: "Profile updated" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getRating = async (req, res) => {
  try {
    const ratingInfo = await driverModel.getAverageRating(req.user.id);
    res.json(ratingInfo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  updateLocation,
  toggleActive,
  getProfile,
  updateProfile,
  getRating,
};
