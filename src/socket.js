const socketHandler = (io) => {
  io.on("connection", (socket) => {
    console.log("New client connected:", socket.id);

    socket.on("join-trip", (tripId) => {
      socket.join(`trip:${tripId}`);
      console.log(`Socket ${socket.id} joined trip:${tripId}`);
    });

    socket.on("leave-trip", (tripId) => {
      socket.leave(`trip:${tripId}`);
      console.log(`Socket ${socket.id} left trip:${tripId}`);
    });

    socket.on("join-drivers", (data) => {
      const driverId = typeof data === "object" ? data?.driverId : data;
      if (driverId) {
        socket.join(`driver:${driverId}`);
        console.log(`Socket ${socket.id} joined driver:${driverId}`);
      }
    });

    socket.on("driver-location", (data) => {
      const { tripId, lat, lng } = data;
      if (tripId) {
        socket.to(`trip:${tripId}`).emit("driver-position", { tripId, lat, lng });
      }
    });

    socket.on("counter-offer", (data) => {
      const { tripId, offeredFare, offeredBy } = data;
      if (tripId) {
        io.to(`trip:${tripId}`).emit("negotiation-update", {
          tripId,
          offeredFare,
          last_offer_by: offeredBy,
        });
      }
    });

    socket.on("offer-response", (data) => {
      const { tripId, accepted, respondedBy } = data;
      if (tripId) {
        io.to(`trip:${tripId}`).emit("negotiation-update", {
          tripId,
          accepted,
          responded_by: respondedBy,
        });
      }
    });

    socket.on("trip-status-update", (data) => {
      const { tripId, status } = data;
      if (tripId) {
        io.to(`trip:${tripId}`).emit("status-updated", { tripId, status });
      }
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });
};

module.exports = socketHandler;
