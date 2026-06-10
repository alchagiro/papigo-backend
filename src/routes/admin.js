const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { authenticate, authorizeRole } = require("../middleware/auth");
const upload = require("../middleware/upload");

router.use(authenticate);
router.use(authorizeRole("admin"));

router.get("/drivers", adminController.getAllUsers);
router.get("/debts", adminController.getAllDriverDebts);
router.post("/debt/update", adminController.updatePlatformDebt);
router.post("/debt/reset", adminController.resetPlatformDebt);

router.get("/users", adminController.getAllUsers);
router.get("/users/:userId", adminController.getUserById);
router.post("/users/suspend", adminController.suspendUser);
router.post("/users/reactivate", adminController.reactivateUser);
router.post("/users/delete", adminController.deleteUser);
router.post("/users/activate-driver", adminController.activateDriverAccount);
router.get("/users/:userId/trips", adminController.getUserTrips);
router.get("/stats/dashboard", adminController.getDashboardStats);

router.post("/drivers/:userId/photo", upload.single("photo"), adminController.uploadDriverPhoto);

router.post("/bonuses", adminController.createBonus);
router.get("/bonuses/:passengerId", adminController.getPassengerBonuses);
router.post("/users/create", adminController.createAdminUser);

module.exports = router;
