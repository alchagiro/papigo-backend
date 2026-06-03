const bcrypt = require("bcryptjs");
const path = require("path");
const sqlite3 = require("sqlite3");

const dbPath = path.join(__dirname, "..", "src", "data", "uber.db");
const db = new sqlite3.Database(dbPath);

const name = process.argv[2] || "Admin";
const email = process.argv[3] || "admin@uber.com";
const password = process.argv[4] || "admin123";

const hashedPassword = bcrypt.hashSync(password, 10);
const id = require("crypto").randomUUID();

db.run(
  "INSERT OR IGNORE INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, 'admin')",
  [id, name, email, hashedPassword],
  function (err) {
    if (err) {
      console.log("El admin ya existe:", email);
    } else {
      console.log("Admin creado:", { name, email, password });
    }
    db.close();
  }
);
