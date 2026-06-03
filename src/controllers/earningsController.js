const earningsModel = require("../models/earnings");
const tripModel = require("../models/trip");

const getEarnings = async (req, res) => {
  try {
    const filter = req.query.filter || "day";
    const earnings = await earningsModel.getDailyEarnings(req.user.id, filter);
    res.json(earnings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getPlatformDebt = async (req, res) => {
  try {
    const debt = await earningsModel.getPlatformDebt(req.user.id);
    res.json(debt);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getCompletedTrips = async (req, res) => {
  try {
    const filter = req.query.filter || "day";
    const trips = await tripModel.getTripHistory(req.user.id, "driver");
    const completedTrips = trips.filter((t) => t.status === "completed");

    let filteredTrips = completedTrips;
    const today = new Date().toISOString().split("T")[0];

    switch (filter) {
      case "day":
        filteredTrips = completedTrips.filter((t) => t.created_at.startsWith(today));
        break;
      case "week":
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        filteredTrips = completedTrips.filter((t) => new Date(t.created_at) >= weekAgo);
        break;
      case "month":
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        filteredTrips = completedTrips.filter((t) => new Date(t.created_at) >= monthAgo);
        break;
    }

    res.json(filteredTrips);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { getEarnings, getPlatformDebt, getCompletedTrips };
