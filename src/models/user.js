const { db } = require("../database");
const bcrypt = require("bcryptjs");

const register = (name, email, phone, password, role) => {
  return new Promise((resolve, reject) => {
    const hashedPassword = bcrypt.hashSync(password, 10);
    const id = require("crypto").randomUUID();
    
    // Si es conductor, se registra como inactivo (requiere aprobacion)
    const isActive = role !== 'driver';
    
    db.run(
      "INSERT INTO users (id, name, email, phone, password, role, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, name, email, phone, hashedPassword, role, isActive],
      function (err) {
        if (err) return reject(err);
        resolve({ id, name, email, phone, role, is_active: isActive });
      }
    );
  });
};

const login = (email, password) => {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
      if (err) return reject(err);
      if (!user) return reject(new Error("Invalid credentials"));
      
      const isValid = bcrypt.compareSync(password, user.password);
      if (!isValid) return reject(new Error("Invalid credentials"));
      
      // Si es conductor y no esta activo, rechazar login
      if (user.role === 'driver' && !user.is_active) {
        return reject(new Error("Tu cuenta de conductor esta pendiente de aprobacion. Contacta al administrador."));
      }
      
      // Si esta suspendido, rechazar login
      if (user.is_suspended) {
        return reject(new Error("Tu cuenta ha sido suspendida. Contacta al administrador."));
      }
      
      delete user.password;
      resolve(user);
    });
  });
};

const getUserById = (userId) => {
  return new Promise((resolve, reject) => {
    db.get("SELECT id, name, email, phone, role, is_active, is_suspended FROM users WHERE id = ?", [userId], (err, user) => {
      if (err) return reject(err);
      if (!user) return reject(new Error("User not found"));
      resolve(user);
    });
  });
};

const getAllUsers = (role = null) => {
  return new Promise((resolve, reject) => {
    let query = `SELECT u.id, u.name, u.email, u.phone, u.role, u.is_active, u.is_suspended, u.created_at,
      (SELECT COUNT(*) FROM trips WHERE passenger_id = u.id) as total_trips_passenger,
      (SELECT COUNT(*) FROM trips WHERE passenger_id = u.id AND status = 'completed') as completed_trips_passenger,
      CASE WHEN u.role = 'driver' THEN (SELECT COUNT(*) FROM trips WHERE driver_id = u.id) END as total_trips,
      CASE WHEN u.role = 'driver' THEN (SELECT COUNT(*) FROM trips WHERE driver_id = u.id AND status = 'completed') END as completed_trips,
      CASE WHEN u.role = 'driver' THEN (SELECT MAX(updated_at) FROM driver_locations WHERE driver_id = u.id) END as last_active,
      CASE WHEN u.role = 'driver' THEN (SELECT ROUND(AVG(rating), 1)::float8 FROM ratings WHERE rated_id = u.id) END as driver_rating,
      CASE WHEN u.role = 'driver' THEN (SELECT COUNT(*) FROM ratings WHERE rated_id = u.id) END as total_ratings,
      CASE WHEN u.role = 'driver' THEN (SELECT vehicle_type FROM driver_profiles WHERE user_id = u.id) END as vehicle_type,
      CASE WHEN u.role = 'driver' THEN (SELECT photo_url FROM driver_profiles WHERE user_id = u.id) END as photo_url
      FROM users u`;

    if (role) {
      query += ` WHERE u.role = ?`;
    }

    query += ` ORDER BY u.created_at DESC`;

    const params = role ? [role] : [];
    db.all(query, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
};

const getUserWithTrips = (userId) => {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM users WHERE id = ?", [userId], (err, user) => {
      if (err) return reject(err);
      if (!user) return reject(new Error("User not found"));

      db.all(
        `SELECT t.*, 
          p.name as passenger_name,
          d.name as driver_name
         FROM trips t
         JOIN users p ON t.passenger_id = p.id
         LEFT JOIN users d ON t.driver_id = d.id
         WHERE t.passenger_id = ? OR t.driver_id = ?
         ORDER BY t.created_at DESC`,
        [userId, userId],
        (err, trips) => {
          if (err) return reject(err);
          resolve({ ...user, trips });
        }
      );
    });
  });
};

const suspendUser = (userId, reason = "") => {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE users SET is_suspended = TRUE WHERE id = ?",
      [userId],
      function (err) {
        if (err) return reject(err);
        resolve({ id: userId, is_suspended: true });
      }
    );
  });
};

const reactivateUser = (userId) => {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE users SET is_suspended = FALSE, is_active = TRUE WHERE id = ?",
      [userId],
      function (err) {
        if (err) return reject(err);
        resolve({ id: userId, is_suspended: false, is_active: true });
      }
    );
  });
};

const activateDriver = (userId) => {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE users SET is_active = TRUE WHERE id = ? AND role = 'driver'",
      [userId],
      function (err) {
        if (err) return reject(err);
        resolve({ id: userId, is_active: true });
      }
    );
  });
};

const deleteUser = (userId) => {
  return new Promise((resolve, reject) => {
    db.run("DELETE FROM driver_profiles WHERE user_id = ?", [userId], function (err) {
      if (err) return reject(err);
      db.run("DELETE FROM driver_locations WHERE driver_id = ?", [userId], function (err) {
        if (err) return reject(err);
        db.run("DELETE FROM daily_earnings WHERE driver_id = ?", [userId], function (err) {
          if (err) return reject(err);
          db.run("DELETE FROM platform_debts WHERE driver_id = ?", [userId], function (err) {
            if (err) return reject(err);
            db.run("DELETE FROM ratings WHERE rater_id = ? OR rated_id = ?", [userId, userId], function (err) {
              if (err) return reject(err);
              db.run("DELETE FROM bonuses WHERE passenger_id = ?", [userId], function (err) {
                if (err) return reject(err);
                db.run("DELETE FROM trips WHERE passenger_id = ? OR driver_id = ?", [userId, userId], function (err) {
                  if (err) return reject(err);
                  db.run("DELETE FROM users WHERE id = ?", [userId], function (err) {
                    if (err) return reject(err);
                    resolve({ id: userId, deleted: true });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
};

const isUserSuspended = (userId) => {
  return new Promise((resolve, reject) => {
    db.get("SELECT is_suspended, role FROM users WHERE id = ?", [userId], (err, user) => {
      if (err) return reject(err);
      resolve(user ? user.is_suspended : true);
    });
  });
};

const logoutUser = (userId) => {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE users SET is_active = FALSE WHERE id = ?",
      [userId],
      function (err) {
        if (err) return reject(err);
        resolve({ id: userId });
      }
    );
  });
};

module.exports = {
  register,
  login,
  getUserById,
  getAllUsers,
  getUserWithTrips,
  suspendUser,
  reactivateUser,
  deleteUser,
  isUserSuspended,
  activateDriver,
};
