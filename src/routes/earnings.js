const express = require("express");
const router = express.Router();
const earningsController = require("../controllers/earningsController");
const { authenticate, authorizeRole } = require("../middleware/auth");

router.use(authenticate);
router.use(authorizeRole("driver"));

router.get("/earnings", earningsController.getEarnings);
router.get("/debt", earningsController.getPlatformDebt);
router.get("/trips/completed", earningsController.getCompletedTrips);

module.exports = router;
