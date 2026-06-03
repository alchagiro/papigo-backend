const jwt = require("jsonwebtoken");
const { db } = require("../database");

const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

const checkSuspension = async (req, res, next) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: "User not found" });
  }

  try {
    const user = await new Promise((resolve, reject) => {
      db.get("SELECT is_suspended, role, is_active FROM users WHERE id = ?", [req.user.id], (err, user) => {
        if (err) return reject(err);
        resolve(user);
      });
    });

    if (!user) return res.status(401).json({ error: "User not found" });
    
    if (user.is_suspended) {
      return res.status(403).json({ 
        error: "Tu cuenta ha sido suspendida. Contacta al administrador.", 
        suspended: true 
      });
    }
    
    if (user.role === 'driver' && !user.is_active) {
      return res.status(403).json({ 
        error: "Tu cuenta de conductor esta pendiente de aprobacion.", 
        pendingApproval: true 
      });
    }
    
    next();
  } catch (err) {
    console.error("checkSuspension DB error:", err);
    return res.status(500).json({ error: "Database error", details: err.message });
  }
};

const authorizeRole = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
};

module.exports = { authenticate, authorizeRole, checkSuspension };
