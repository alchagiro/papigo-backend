const multer = require("multer");
const path = require("path");
const fs = require("fs");

const driverDir = path.join(__dirname, "..", "..", "uploads", "drivers");
if (!fs.existsSync(driverDir)) {
  fs.mkdirSync(driverDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, driverDir);
  },
  filename: (req, file, cb) => {
    const userId = req.params.userId || "unknown";
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `${userId}-${Date.now()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Only image files (jpg, jpeg, png, gif, webp) are allowed"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

module.exports = upload;
