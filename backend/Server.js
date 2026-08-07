const express  = require("express");
const mongoose = require("mongoose");
const http     = require("http");
const { Server } = require("socket.io");
const cors     = require("cors");

const bcrypt = require("bcrypt");
const jwt    = require("jsonwebtoken");
const multer = require("multer");
const axios  = require("axios");
const FormData = require("form-data");

const CrowdStat = require("./models/CrowdStat");
const { CAMPUS_LOCATIONS } = require("./models/CrowdStat");
const User = require("./models/User");
const analyticsRouter = require("./routes/analytics");
const { initCronJobs } = require("./services/cronScheduler");

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json({ limit: "2mb" }));

//─── MongoDB ─────────────────────────────────────────────
// mongoose
//   .connect("mongodb://127.0.0.1:27017/crowd")
//   .then(() => {
//     console.log("✅ MongoDB connected");
//     initCronJobs();
//   })
//   .catch((err) => console.error("❌ MongoDB error:", err));


require("dotenv").config();

mongoose
  .connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/crowd")
  .then(() => {
    console.log("✅ MongoDB connected");
    initCronJobs();
  })
  .catch((err) => {
    console.error("❌ MongoDB error:", err);
  });
// ─── LOGIN ROUTE ─────────────────────────────────────────
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    console.log("Username:", username);

    const users = await User.find({});
    console.log("Users:", users);

    const user = await User.findOne({ username });
    console.log("Matched user:", user);

    if (!user)
      return res.status(401).json({ error: "Invalid username" });

    const match = await bcrypt.compare(password, user.password);
    console.log("Password match:", match);

    if (!match)
      return res.status(401).json({ error: "Invalid password" });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token,
      username: user.username,
      role: user.role,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});


// ─── Image upload (Security → analyzed → broadcast to Control Room) ─────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
});

app.post("/api/upload-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ error: "No image uploaded" });

    const form = new FormData();
    form.append("image", req.file.buffer, {
      filename: req.file.originalname || "upload.jpg",
    });

    const pyRes = await axios.post(
      "http://localhost:5001/process_image",
      form,
      { headers: form.getHeaders(), maxBodyLength: Infinity }
    );

    const { people, capacity, density, image_base64 } = pyRes.data;

    const payload = {
      camera: "uploaded",
      people,
      capacity,
      density,
      densityRatio: capacity ? people / capacity : 0,
      image: `data:image/jpeg;base64,${image_base64}`,
      uploadedBy: req.body.username || "security",
      timestamp: new Date(),
    };

    io.emit("uploadedImage", payload);

    res.json(payload);

  } catch (err) {
    console.error("Image upload error:", err.message);
    res.status(500).json({ error: "Failed to process image" });
  }
});


// ─── Threshold persistence ───────────────────────────────
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
  } catch {}
}
loadThresholds();


// ─── Threshold routes ────────────────────────────────────
app.get("/api/thresholds", (_req, res) => res.json(thresholds));

app.post("/api/thresholds", async (req, res) => {
  try {
    const { LOW, MEDIUM } = req.body;

    thresholds = {
      LOW: parseFloat(LOW),
      MEDIUM: parseFloat(MEDIUM)
    };

    await Threshold.findOneAndUpdate(
      { key: "LOW" },
      { value: thresholds.LOW },
      { upsert: true }
    );

    await Threshold.findOneAndUpdate(
      { key: "MEDIUM" },
      { value: thresholds.MEDIUM },
      { upsert: true }
    );

    io.emit("thresholds", thresholds);

    res.json(thresholds);

  } catch {
    res.status(500).json({ error: "Failed to save thresholds" });
  }
});


// ─── Live stats ingestion (Task 1.2: POST /api/live-stats & /api/stats) ─────────
const handleLiveStatsIngestion = async (req, res) => {
  try {
    const {
      camera,
      people,
      capacity,
      density,
      densityRatio,
      location,
      weather,
      eventType,
      timestamp
    } = req.body;

    // Sanitize and validate inputs (Task 1.2 edge-case robustness)
    const sanitizedCamera = typeof camera === "string" && camera.trim() ? camera.trim() : "default";
    const sanitizedPeople = isNaN(Number(people)) ? 0 : Math.max(0, Math.round(Number(people)));
    const sanitizedCapacity = isNaN(Number(capacity)) ? 1 : Math.max(1, Math.round(Number(capacity)));
    const validDensity = ["LOW", "MEDIUM", "HIGH"].includes(density) ? density : "LOW";
    const sanitizedRatio = isNaN(Number(densityRatio)) ? 0 : Math.max(0, Number(densityRatio));
    const validLocation = (typeof location === "string" && CAMPUS_LOCATIONS.includes(location)) ? location : null;
    const validWeather = ["clear", "cloudy", "rainy", "stormy", "unknown"].includes(weather) ? weather : "clear";
    const validEventType = ["normal", "class_change", "exam", "fest", "sports", "emergency"].includes(eventType) ? eventType : "normal";

    let ts = new Date();
    if (timestamp) {
      if (typeof timestamp === "number") {
        ts = timestamp < 1e11 ? new Date(timestamp * 1000) : new Date(timestamp);
      } else {
        const parsed = new Date(timestamp);
        if (!isNaN(parsed.getTime())) ts = parsed;
      }
    }

    const stat = await CrowdStat.create({
      camera: sanitizedCamera,
      people: sanitizedPeople,
      capacity: sanitizedCapacity,
      density: validDensity,
      densityRatio: sanitizedRatio,
      location: validLocation,
      weather: validWeather,
      eventType: validEventType,
      timestamp: ts
    });

    io.emit("live", stat);

    if (validDensity === "HIGH") {
      io.emit("alert", {
        camera: sanitizedCamera,
        message: `🚨 HIGH density on ${sanitizedCamera}`
      });
    }

    res.status(200).json({ success: true, id: stat._id });

  } catch (err) {
    console.error("Live stats ingestion error:", err);
    res.status(500).json({ error: "Failed to save stat" });
  }
};

app.post("/api/live-stats", handleLiveStatsIngestion);
app.post("/api/stats",      handleLiveStatsIngestion);
app.use("/api/stats",       analyticsRouter);
app.use("/api/analytics",   analyticsRouter);



// ─── Cameras list ───────────────────────────────────────
app.get("/api/cameras", async (req, res) => {
  try {
    const cameras = await CrowdStat.distinct("camera");
    res.json(cameras);
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});


// ─── Locations list ─────────────────────────────────────
app.get("/api/locations", (_req, res) => {
  res.json(CAMPUS_LOCATIONS);
});


// ─── Daily Summary ──────────────────────────────────────
app.get("/api/daily-summary", async (req, res) => {
  try {
    const { camera, location } = req.query;
    const match = {};
    if (camera)   match.camera   = camera;
    if (location) match.location = location;

    const summary = await CrowdStat.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
            camera: "$camera",
          },
          maxPeople:    { $max: "$people" },
          avgPeople:    { $avg: "$people" },
          avgCapacity:  { $avg: "$capacity" },
          totalRecords: { $sum: 1 },
          alerts:       { $sum: { $cond: [{ $eq: ["$density", "HIGH"] }, 1, 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          date: "$_id.date",
          camera: "$_id.camera",
          maxPeople: 1,
          avgPeople:   { $round: ["$avgPeople", 1] },
          avgCapacity: { $round: ["$avgCapacity", 0] },
          totalRecords: 1,
          alerts: 1,
        },
      },
      { $sort: { date: -1, camera: 1 } },
    ]);

    res.json(summary);
  } catch (err) {
    console.error("Daily summary error:", err);
    res.status(500).json({ error: "Failed to fetch daily summary" });
  }
});


// ─── AI Next-Day Crowd Prediction (independent ML microservice) ─────────
// These routes only forward to ml/predictor.py (port 5002).
// They do not touch CrowdStat/DailyStat/HourlyStat, the live pipeline,
// or any other existing route.
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:5002";

app.get("/api/predictions", async (_req, res) => {
  try {
    const mlRes = await axios.get(`${ML_SERVICE_URL}/predict/all`);
    res.json(mlRes.data);
  } catch (err) {
    console.error("Prediction service error:", err.message);
    res.status(503).json({ error: "Prediction service unavailable" });
  }
});

app.get("/api/predictions/analytics/metrics", async (_req, res) => {
  try {
    const mlRes = await axios.get(`${ML_SERVICE_URL}/analytics/metrics`);
    res.json(mlRes.data);
  } catch (err) {
    res.status(503).json({ error: "Prediction service unavailable" });
  }
});

app.get("/api/predictions/analytics/backtest", async (_req, res) => {
  try {
    const mlRes = await axios.get(`${ML_SERVICE_URL}/analytics/backtest/all`);
    res.json(mlRes.data);
  } catch (err) {
    res.status(503).json({ error: "Prediction service unavailable" });
  }
});

app.get("/api/predictions/analytics/backtest/:camera", async (req, res) => {
  try {
    const mlRes = await axios.get(
      `${ML_SERVICE_URL}/analytics/backtest/${encodeURIComponent(req.params.camera)}`
    );
    res.json(mlRes.data);
  } catch (err) {
    res.status(503).json({ error: "Prediction service unavailable" });
  }
});

// NOTE: this generic /:camera route must stay LAST among /api/predictions/*
// routes, or it will swallow the more specific /analytics/* paths above.
app.get("/api/predictions/:camera", async (req, res) => {
  try {
    const mlRes = await axios.get(
      `${ML_SERVICE_URL}/predict/${encodeURIComponent(req.params.camera)}`
    );
    res.json(mlRes.data);
  } catch (err) {
    console.error("Prediction service error:", err.message);
    res.status(503).json({ error: "Prediction service unavailable" });
  }
});


// ─── Socket ─────────────────────────────────────────────
io.on("connection", (socket) => {

  socket.on("subscribe", (cam) => {
    socket.join(cam);
  });

});


// ─── START SERVER ───────────────────────────────────────
// server.listen(5000, () => {
//   console.log("🚀 Backend running on http://localhost:5000");
// });
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});
