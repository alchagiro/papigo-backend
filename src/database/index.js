let dbModule;

if (process.env.DATABASE_URL) {
  dbModule = require("./pg");
  console.log("Using PostgreSQL database");
} else {
  dbModule = require("./sqlite");
  console.log("Using SQLite database");
}

module.exports = {
  db: dbModule.db,
  initDb: dbModule.initDb,
};
