const express = require("express");
const router = express.Router();
const tripController = require("../controllers/tripController");
const { authenticate, authorizeRole, checkSuspension } = require("../middleware/auth");

router.use(authenticate);
router.use(checkSuspension);

// Routes with specific paths MUST come before parameterized routes
router.post("/request", authorizeRole("passenger"), tripController.requestTrip);
router.post("/accept/:tripId", authorizeRole("driver"), tripController.acceptTrip);
router.post("/start/:tripId", authorizeRole("driver"), tripController.startTrip);
router.post("/complete/:tripId", authorizeRole("driver"), tripController.completeTrip);
router.post("/cancel/:tripId", tripController.cancelTrip);
router.get("/pending", authorizeRole("driver"), tripController.getPendingTrips);
router.get("/earnings", authorizeRole("driver"), tripController.getDriverEarnings);
router.get("/history", tripController.getTripHistory);
router.get("/calculate-fare", tripController.calculateFare);
router.post("/calculate-fare", tripController.calculateFare);
router.get("/user/bonuses", authorizeRole("passenger"), tripController.getUserBonuses);
router.get("/:tripId/bonuses", tripController.getTripBonuses);
router.post("/:tripId/apply-bonus", authorizeRole("passenger"), tripController.applyBonusToTrip);

// Negotiation endpoints - DISABLED (price is now fixed by the app)
// router.post("/:tripId/counter-offer", tripController.counterOffer);
// router.post("/:tripId/accept-offer", tripController.acceptOffer);
// router.post("/:tripId/reject-offer", tripController.rejectOffer);

// Generic trip details route MUST be last
router.get("/:tripId", tripController.getTripDetails);

module.exports = router;
