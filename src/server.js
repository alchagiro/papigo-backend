const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const cors = require("cors");
require("dotenv").config();

const { initDb } = require("./database");
const socketHandler = require("./socket");
const authRoutes = require("./routes/auth");
const tripRoutes = require("./routes/trips");
const driverRoutes = require("./routes/drivers");
const ratingRoutes = require("./routes/ratings");
const earningsRoutes = require("./routes/earnings");
const adminRoutes = require("./routes/admin");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

// Hacer io disponible en toda la aplicacion
app.set("socketio", io);

app.use(cors());
app.use(express.json());

app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.use("/api/auth", authRoutes);
app.use("/api/trips", tripRoutes);
app.use("/api/drivers", driverRoutes);
app.use("/api/ratings", ratingRoutes);
app.use("/api/earnings", earningsRoutes);
app.use("/api/admin", adminRoutes);

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

initDb();
socketHandler(io);

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});
