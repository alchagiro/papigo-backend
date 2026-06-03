const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false,
});

const name = process.argv[2] || "Admin";
const email = process.argv[3] || "admin@papigo.com";
const password = process.argv[4] || "admin123";

const hashedPassword = bcrypt.hashSync(password, 10);
const id = require("crypto").randomUUID();

pool.query(
  "INSERT INTO users (id, name, email, password, role) VALUES ($1, $2, $3, $4, 'admin') ON CONFLICT (email) DO NOTHING",
  [id, name, email, hashedPassword],
  (err, result) => {
    if (err) {
      console.error("Error:", err.message);
    } else if (result.rowCount === 0) {
      console.log("El admin ya existe:", email);
    } else {
      console.log("Admin creado:", { name, email, password });
    }
    pool.end();
  }
);
