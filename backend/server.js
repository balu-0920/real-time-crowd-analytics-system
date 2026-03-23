

const express = require("express");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const CrowdStat = require("./models/CrowdStat");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ─── MongoDB ─────────────────────────────────────────────────────────────────
mongoose
  .connect("mongodb://127.0.0.1:27017/crowd")
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// ─── Threshold persistence ────────────────────────────────────────────────────
let thresholds = { LOW: 0.4, MEDIUM: 0.7 };

const ThresholdSchema = new mongoose.Schema({
  key:   { type: String, unique: true },
  value: Number,
});
const Threshold = mongoose.model("Threshold", ThresholdSchema);

async function loadThresholds() {
  try {
    const docs = await Threshold.find();
    docs.forEach((d) => (thresholds[d.key] = d.value));
    if (docs.length) console.log("Thresholds loaded:", thresholds);
  } catch (err) {
    console.error("Failed to load thresholds:", err);
  }
}
loadThresholds();

// ─── Threshold routes ─────────────────────────────────────────────────────────
app.get("/api/thresholds", (_req, res) => res.json(thresholds));

app.post("/api/thresholds", async (req, res) => {
  try {
    const { LOW, MEDIUM } = req.body;
    if (LOW === undefined || MEDIUM === undefined)
      return res.status(400).json({ error: "LOW and MEDIUM are required" });

    const low = parseFloat(LOW);
    const medium = parseFloat(MEDIUM);
    if (isNaN(low) || isNaN(medium) || low <= 0 || medium <= low || medium >= 1)
      return res.status(400).json({ error: "LOW must be >0, MEDIUM must be >LOW and <1" });

    thresholds = { LOW: low, MEDIUM: medium };
    await Threshold.findOneAndUpdate({ key: "LOW" },    { value: low },    { upsert: true });
    await Threshold.findOneAndUpdate({ key: "MEDIUM" }, { value: medium }, { upsert: true });

    io.emit("thresholds", thresholds);
    res.json(thresholds);
  } catch (err) {
    console.error("POST /api/thresholds:", err);
    res.status(500).json({ error: "Failed to save thresholds" });
  }
});

// ─── Live stats ───────────────────────────────────────────────────────────────
app.post("/api/live-stats", async (req, res) => {
  try {
    const { camera = "default", people, capacity, density, densityRatio } = req.body;

    if (
      people   === undefined ||
      capacity === undefined ||
      !density ||
      !["LOW", "MEDIUM", "HIGH"].includes(density)
    ) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const stat = await CrowdStat.create({
      camera,
      people:       Number(people),
      capacity:     Number(capacity),
      density,
      densityRatio: Number(densityRatio) || 0,
      timestamp:    new Date(),
    });

    // Emit to everyone, and also to a camera-specific room
    io.emit("live", stat);
    io.to(`cam:${camera}`).emit(`live:${camera}`, stat);

    if (density === "HIGH") {
      io.emit("alert", { camera, message: `🚨 HIGH density on ${camera}!` });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("POST /api/live-stats:", err);
    res.status(500).json({ error: "Failed to save stat" });
  }
});

// ─── List all known cameras ───────────────────────────────────────────────────
app.get("/api/cameras", async (req, res) => {
  try {
    const cameras = await CrowdStat.distinct("camera");
    res.json(cameras);
  } catch (err) {
    console.error("GET /api/cameras:", err);
    res.status(500).json({ error: "Failed to fetch cameras" });
  }
});

// ─── Daily raw data (per camera, paginated) ───────────────────────────────────
app.get("/api/daily", async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit)  || 100, 1000);
    const skip   = parseInt(req.query.skip)  || 0;
    const filter = req.query.camera ? { camera: req.query.camera } : {};
    const data   = await CrowdStat.find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);
    res.json(data);
  } catch (err) {
    console.error("GET /api/daily:", err);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

// ─── Daily summary (aggregation, optionally per camera) ───────────────────────
app.get("/api/daily-summary", async (req, res) => {
  try {
    const matchStage = req.query.camera
      ? [{ $match: { camera: req.query.camera } }]
      : [];

    const summary = await CrowdStat.aggregate([
      ...matchStage,
      {
        $group: {
          _id: {
            date:   { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
            camera: "$camera",
          },
          maxPeople:    { $max: "$people" },
          avgPeople:    { $avg: "$people" },
          alerts:       { $sum: { $cond: [{ $eq: ["$density", "HIGH"] }, 1, 0] } },
          totalRecords: { $sum: 1 },
        },
      },
      { $sort: { "_id.date": -1 } },
      { $limit: 90 },
      {
        $project: {
          _id:          0,
          date:         "$_id.date",
          camera:       "$_id.camera",
          maxPeople:    1,
          avgPeople:    { $round: ["$avgPeople", 1] },
          alerts:       1,
          totalRecords: 1,
        },
      },
    ]);
    res.json(summary);
  } catch (err) {
    console.error("GET /api/daily-summary:", err);
    res.status(500).json({ error: "Failed to fetch summary" });
  }
});

// ─── Socket: join camera room ─────────────────────────────────────────────────
io.on("connection", (socket) => {
  socket.on("subscribe", (camId) => {
    socket.join(`cam:${camId}`);
  });
  socket.on("unsubscribe", (camId) => {
    socket.leave(`cam:${camId}`);
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(5000, () =>
  console.log("Backend running on http://localhost:5000")
);
