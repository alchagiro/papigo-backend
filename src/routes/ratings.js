const express = require("express");
const router = express.Router();
const ratingModel = require("../models/rating");
const { authenticate } = require("../middleware/auth");

router.use(authenticate);

router.post("/", async (req, res) => {
  try {
    const { tripId, ratedId, rating, comment } = req.body;
    const newRating = await ratingModel.createRating(tripId, req.user.id, ratedId, rating, comment);
    res.status(201).json(newRating);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get("/trip/:tripId", async (req, res) => {
  try {
    const rating = await ratingModel.getRating(req.params.tripId);
    res.json(rating);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

router.get("/average/:userId", async (req, res) => {
  try {
    const average = await ratingModel.getAverageRating(req.params.userId);
    res.json(average);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
