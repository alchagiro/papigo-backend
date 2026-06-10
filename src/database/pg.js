const { Pool, types } = require("pg");

// pg returns int8 (bigint) and numeric as strings by default; parse to JS numbers
types.setTypeParser(20, parseInt);    // int8 → number
types.setTypeParser(1700, parseFloat); // numeric → number

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false,
});

const convertPlaceholders = (sql) => {
  let idx = 0;
  return sql.replace(/\?/g, () => `$${++idx}`);
};

const convertInsertIgnore = (sql) => {
  return sql.replace(/INSERT\s+OR\s+IGNORE\s+(INTO\s+\w+\s*\([^)]*\)\s*VALUES\s*\([^)]*\))/gi, "INSERT $1 ON CONFLICT DO NOTHING");
};

const convertSqliteDateFunctions = (sql) => {
  let result = sql
    .replace(/date\('now'\s*,\s*'([^']+)'\s*\)/gi, (match, modifier) => {
      if (modifier.startsWith("-")) {
        const parts = modifier.split(" ");
        const value = parts[0].replace(/^-/, "");
        return `CURRENT_DATE - INTERVAL '${value} ${parts[1]}'`;
      }
      if (modifier.startsWith("+")) {
        const parts = modifier.split(" ");
        const value = parts[0].replace(/^\+/, "");
        return `CURRENT_DATE + INTERVAL '${value} ${parts[1]}'`;
      }
      if (modifier === "start of month") {
        return "DATE_TRUNC('month', CURRENT_DATE)::date";
      }
      return match;
    })
    .replace(/date\('([^']+)'\s*,\s*'([^']+)'\s*\)/gi, (match, dateLiteral, modifier) => {
      if (modifier.startsWith("-")) {
        const parts = modifier.split(" ");
        const value = parts[0].replace(/^-/, "");
        return `'${dateLiteral}'::date - INTERVAL '${value} ${parts[1]}'`;
      }
      if (modifier.startsWith("+")) {
        const parts = modifier.split(" ");
        const value = parts[0].replace(/^\+/, "");
        return `'${dateLiteral}'::date + INTERVAL '${value} ${parts[1]}'`;
      }
      if (modifier === "start of month") {
        return `DATE_TRUNC('month', '${dateLiteral}'::date)::date`;
      }
      return match;
    })
    .replace(/DATE\('now'\)/gi, "CURRENT_DATE")
    .replace(/date\('now'\)/gi, "CURRENT_DATE")
    .replace(/DATE\((\w+)\)/gi, "$1::date");
  return result;
};

const handleResult = (result, method) => {
  if (method === "run") return { changes: result.rowCount, lastID: null };
  if (method === "get") return result.rows[0] || null;
  if (method === "all") return result.rows;
};

const exec = (method, sql, params, callback) => {
  const convertedSql = convertInsertIgnore(convertSqliteDateFunctions(convertPlaceholders(sql)));
  pool.query(convertedSql, params)
    .then((result) => {
      if (callback) callback(null, handleResult(result, method));
    })
    .catch((err) => {
      if (callback) callback(err);
    });
};

const db = {
  run: (sql, params, callback) => exec("run", sql, params, callback),
  get: (sql, params, callback) => exec("get", sql, params, callback),
  all: (sql, params, callback) => exec("all", sql, params, callback),
  prepare: () => ({ get: () => ({}), run: () => {} }),
};

const initDb = async () => {
  const schema = `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      phone TEXT, password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('passenger', 'driver', 'admin')),
      is_active BOOLEAN DEFAULT TRUE, is_suspended BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS driver_profiles (
      id TEXT PRIMARY KEY, user_id TEXT UNIQUE NOT NULL,
      license_number TEXT, vehicle_type TEXT, vehicle_model TEXT, vehicle_plate TEXT,
      photo_url TEXT,
      rating DOUBLE PRECISION DEFAULT 5.0, total_ratings INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS photo_url TEXT;
    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY, passenger_id TEXT NOT NULL, driver_id TEXT,
      pickup_lat DOUBLE PRECISION NOT NULL, pickup_lng DOUBLE PRECISION NOT NULL,
      pickup_address TEXT NOT NULL, dropoff_lat DOUBLE PRECISION NOT NULL,
      dropoff_lng DOUBLE PRECISION NOT NULL, dropoff_address TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','accepted','in_progress','completed','cancelled')),
      fare DOUBLE PRECISION, offered_fare DOUBLE PRECISION, counter_fare DOUBLE PRECISION,
      last_offer_by TEXT CHECK(last_offer_by IN ('passenger','driver')),
      distance DOUBLE PRECISION, duration DOUBLE PRECISION, bonus_amount DOUBLE PRECISION DEFAULT 0,
      payment_method TEXT CHECK(payment_method IN ('cash','card')),
      payment_status TEXT DEFAULT 'pending' CHECK(payment_status IN ('pending','paid','refunded')),
      vehicle_type TEXT DEFAULT 'car',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (passenger_id) REFERENCES users(id),
      FOREIGN KEY (driver_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS ratings (
      id TEXT PRIMARY KEY, trip_id TEXT UNIQUE NOT NULL,
      rater_id TEXT NOT NULL, rated_id TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5), comment TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (trip_id) REFERENCES trips(id),
      FOREIGN KEY (rater_id) REFERENCES users(id), FOREIGN KEY (rated_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS driver_locations (
      id TEXT PRIMARY KEY, driver_id TEXT UNIQUE NOT NULL,
      lat DOUBLE PRECISION NOT NULL, lng DOUBLE PRECISION NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (driver_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS daily_earnings (
      id TEXT PRIMARY KEY, driver_id TEXT NOT NULL, date TEXT NOT NULL,
      total_trips INTEGER DEFAULT 0, total_earnings DOUBLE PRECISION DEFAULT 0,
      total_distance DOUBLE PRECISION DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (driver_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS platform_debts (
      id TEXT PRIMARY KEY, driver_id TEXT UNIQUE NOT NULL,
      amount_owed DOUBLE PRECISION DEFAULT 0, platform_percentage DOUBLE PRECISION DEFAULT 25,
      last_payment_date TIMESTAMP, paid_by TEXT, notes TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (driver_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS bonuses (
      id TEXT PRIMARY KEY, passenger_id TEXT NOT NULL, amount DOUBLE PRECISION NOT NULL,
      description TEXT, is_used BOOLEAN DEFAULT FALSE, used_trip_id TEXT,
      used_at TIMESTAMP, expires_at TIMESTAMP, created_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (passenger_id) REFERENCES users(id),
      FOREIGN KEY (used_trip_id) REFERENCES trips(id)
    );
  `;

  try {
    await pool.query(schema);
    console.log("PostgreSQL database initialized successfully");
  } catch (err) {
    console.error("Error initializing PostgreSQL:", err.message);
    throw err;
  }
};

module.exports = { db, initDb };
