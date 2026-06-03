const express = require("express");
const router = express.Router();
const driverController = require("../controllers/driverController");
const { authenticate, authorizeRole } = require("../middleware/auth");

router.use(authenticate);
router.use(authorizeRole("driver"));

router.patch("/location", driverController.updateLocation);
router.patch("/status", driverController.toggleActive);
router.get("/profile", driverController.getProfile);
router.put("/profile", driverController.updateProfile);
router.get("/rating", driverController.getRating);

module.exports = router;
