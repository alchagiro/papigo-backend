const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "uber.db");
const db = new sqlite3.Database(dbPath);

const initDb = () => {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('passenger', 'driver', 'admin')),
        is_active BOOLEAN DEFAULT 1,
        is_suspended BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS driver_profiles (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL,
        license_number TEXT,
        vehicle_type TEXT,
        vehicle_model TEXT,
        vehicle_plate TEXT,
        photo_url TEXT,
        rating REAL DEFAULT 5.0,
        total_ratings INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT 1,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    db.run("ALTER TABLE driver_profiles ADD COLUMN photo_url TEXT", (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Error adding photo_url column:", err.message);
      }
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS trips (
        id TEXT PRIMARY KEY,
        passenger_id TEXT NOT NULL,
        driver_id TEXT,
        pickup_lat REAL NOT NULL,
        pickup_lng REAL NOT NULL,
        pickup_address TEXT NOT NULL,
        dropoff_lat REAL NOT NULL,
        dropoff_lng REAL NOT NULL,
        dropoff_address TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'in_progress', 'completed', 'cancelled')),
        fare REAL,
        offered_fare REAL,
        counter_fare REAL,
        last_offer_by TEXT CHECK(last_offer_by IN ('passenger', 'driver')),
        distance REAL,
        duration REAL,
        bonus_amount REAL DEFAULT 0,
        payment_method TEXT CHECK(payment_method IN ('cash', 'card')),
        payment_status TEXT DEFAULT 'pending' CHECK(payment_status IN ('pending', 'paid', 'refunded')),
        vehicle_type TEXT DEFAULT 'car',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (passenger_id) REFERENCES users(id),
        FOREIGN KEY (driver_id) REFERENCES users(id)
)
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS ratings (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL UNIQUE,
        rater_id TEXT NOT NULL,
        rated_id TEXT NOT NULL,
        rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
        comment TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (trip_id) REFERENCES trips(id),
        FOREIGN KEY (rater_id) REFERENCES users(id),
        FOREIGN KEY (rated_id) REFERENCES users(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS driver_locations (
        id TEXT PRIMARY KEY,
        driver_id TEXT UNIQUE NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (driver_id) REFERENCES users(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS daily_earnings (
        id TEXT PRIMARY KEY,
        driver_id TEXT NOT NULL,
        date TEXT NOT NULL,
        total_trips INTEGER DEFAULT 0,
        total_earnings REAL DEFAULT 0,
        total_distance REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (driver_id) REFERENCES users(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS platform_debts (
        id TEXT PRIMARY KEY,
        driver_id TEXT UNIQUE NOT NULL,
        amount_owed REAL DEFAULT 0,
        platform_percentage REAL DEFAULT 25,
        last_payment_date DATETIME,
        paid_by TEXT,
        notes TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (driver_id) REFERENCES users(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS bonuses (
        id TEXT PRIMARY KEY,
        passenger_id TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        is_used BOOLEAN DEFAULT 0,
        used_trip_id TEXT,
        used_at DATETIME,
        expires_at DATETIME,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (passenger_id) REFERENCES users(id),
        FOREIGN KEY (used_trip_id) REFERENCES trips(id)
      )
    `);

    console.log("Database initialized successfully");
  });
};

module.exports = { db, initDb };
