require("dotenv").config();
const express  = require("express");
const mongoose = require("mongoose");
const http     = require("http");
const { Server } = require("socket.io");
const cors     = require("cors");

const bcrypt = require("bcrypt");
const jwt    = require("jsonwebtoken");
 
const CrowdStat = require("./models/CrowdStat");
const { CAMPUS_LOCATIONS } = require("./models/CrowdStat");
const User = require("./models/User");

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ─── MongoDB ─────────────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));
// ─── LOGIN ROUTE ─────────────────────────────────────────
app.post("/api/auth/login", async (req, res) => {
  try {

    const { username, password } = req.body;

    const user = await User.findOne({ username });

    if (!user)
      return res.status(401).json({ error: "Invalid username" });

    const match = await bcrypt.compare(password, user.password);

    if (!match)
      return res.status(401).json({ error: "Invalid password" });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      "secret123",
      { expiresIn: "1d" }
    );

    res.json({
      username: user.username,
      role: user.role,
      token
    });

  } catch (err) {
    res.status(500).json({ error: "Login failed" });
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


// ─── Live stats ─────────────────────────────────────────
app.post("/api/live-stats", async (req, res) => {

  try {

    const {
      camera,
      people,
      capacity,
      density,
      densityRatio
    } = req.body;

    const stat = await CrowdStat.create({
      camera,
      people,
      capacity,
      density,
      densityRatio,
      timestamp: new Date()
    });

    io.emit("live", stat);

    if (density === "HIGH") {
      io.emit("alert", {
        message: `🚨 HIGH density on ${camera}`
      });
    }

    res.sendStatus(200);

  } catch (err) {
    res.status(500).json({ error: "Failed to save stat" });
  }
});


// ─── Cameras list ───────────────────────────────────────
app.get("/api/cameras", async (req, res) => {
  try {
    const cameras = await CrowdStat.distinct("camera");
    res.json(cameras);
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});


// ─── Daily data ─────────────────────────────────────────
app.get("/api/daily", async (req, res) => {
  try {
    const data = await CrowdStat.find()
      .sort({ timestamp: -1 })
      .limit(100);

    res.json(data);

  } catch {
    res.status(500).json({ error: "Failed" });
  }
});


// ─── Socket ─────────────────────────────────────────────
io.on("connection", (socket) => {

  socket.on("subscribe", (cam) => {
    socket.join(cam);
  });

});


// ─── START SERVER ───────────────────────────────────────
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});
