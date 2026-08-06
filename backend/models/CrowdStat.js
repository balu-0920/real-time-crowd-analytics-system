// const mongoose = require("mongoose");

// const CrowdStatSchema = new mongoose.Schema({
//   camera:       { type: String,  required: true, default: "default" },
//   people:       { type: Number,  required: true },
//   capacity:     { type: Number,  required: true },
//   density:      { type: String,  required: true, enum: ["LOW", "MEDIUM", "HIGH"] },
//   densityRatio: { type: Number,  required: true },
//   timestamp:    { type: Date,    required: true, default: Date.now },
// });

// // Compound index: fast queries per camera + time
// CrowdStatSchema.index({ camera: 1, timestamp: -1 });
// CrowdStatSchema.index({ timestamp: -1 });

// module.exports = mongoose.model("CrowdStat", CrowdStatSchema);
















const mongoose = require("mongoose");

// ─── Campus locations from PDPM IIITDM Jabalpur map ─────────────────────────
const CAMPUS_LOCATIONS = [
  "Entrance",
  "Admin",
  "PHC",
  "CC",
  "LHTC",
  "CL",
  "Hex",
  "OAT",
  "SAC",
  "H1",
  "H3",
  "H4",
  "PA",
  "PB",
  "N",
  "M",
  "Mess",
  "Nescafe",
  "ATM",
  "Visitor_Hostel",
];

const CrowdStatSchema = new mongoose.Schema({
  // ── Identity ──────────────────────────────────────────────────
  camera: {
    type:     String,
    required: true,
    default:  "default",
    index:    true,
  },

  // ── Campus location (from PDPM map) ──────────────────────────
  location: {
    type:    String,
    enum:    CAMPUS_LOCATIONS,
    default: null,
    index:   true,
  },

  // ── People count (YOLO-detected, smoothed) ───────────────────
  people: {
    type:     Number,
    required: true,
    min:      0,
  },

  // ── Capacity (LIVE — derived from frame geometry + avg bbox) ─
  capacity: {
    type:     Number,
    required: true,
    min:      1,
  },

  // ── Derived fields ────────────────────────────────────────────
  density: {
    type:     String,
    required: true,
    enum:     ["LOW", "MEDIUM", "HIGH"],
  },

  densityRatio: {
    type:     Number,
    required: true,
    min:      0,
    max:      10,
  },

  // ── Expanded Temporal Metadata (Task 1.1) ──────────────────────
  dayOfWeek: {
    type: Number, // 0 = Sunday, 1 = Monday ... 6 = Saturday
    min: 0,
    max: 6,
  },

  hour: {
    type: Number, // 0 - 23
    min: 0,
    max: 23,
  },

  minute: {
    type: Number, // 0 - 59
    min: 0,
    max: 59,
  },

  dateStr: {
    type: String, // "YYYY-MM-DD"
    index: true,
  },

  isWeekend: {
    type: Boolean,
    default: false,
  },

  // ── Contextual & Environmental Metadata ───────────────────────
  weather: {
    type: String,
    enum: ["clear", "cloudy", "rainy", "stormy", "unknown"],
    default: "clear",
  },

  eventType: {
    type: String,
    enum: ["normal", "class_change", "exam", "fest", "sports", "emergency"],
    default: "normal",
  },

  timestamp: {
    type:    Date,
    default: Date.now,
    index:   true,
  },
});

// ── Pre-validate Hook: Auto-populate temporal metadata ───────────
CrowdStatSchema.pre("validate", function () {
  const ts = this.timestamp ? new Date(this.timestamp) : new Date();

  if (this.hour === undefined || this.hour === null) {
    this.hour = ts.getHours();
  }
  if (this.minute === undefined || this.minute === null) {
    this.minute = ts.getMinutes();
  }
  if (this.dayOfWeek === undefined || this.dayOfWeek === null) {
    this.dayOfWeek = ts.getDay();
  }
  if (this.isWeekend === undefined || this.isWeekend === null) {
    this.isWeekend = this.dayOfWeek === 0 || this.dayOfWeek === 6;
  }
  if (!this.dateStr) {
    const y = ts.getFullYear();
    const m = String(ts.getMonth() + 1).padStart(2, "0");
    const d = String(ts.getDate()).padStart(2, "0");
    this.dateStr = `${y}-${m}-${d}`;
  }
});

// ── Compound indexes (Task 1.1) ───────────────────────────────────
CrowdStatSchema.index({ camera: 1,   timestamp: -1 });
CrowdStatSchema.index({ location: 1, timestamp: -1 });

// TTL index: auto-deletes raw CrowdStat documents 60 days after their
// `timestamp`. This only prunes the raw, high-frequency collection —
// HourlyStat and DailyStat (which the ML pipeline and Analytics tab read)
// are separate, permanent collections and are never touched by this.
CrowdStatSchema.index({ timestamp: -1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });

CrowdStatSchema.index({ camera: 1,   dateStr: 1 });
CrowdStatSchema.index({ location: 1, dateStr: 1 });
CrowdStatSchema.index({ hour: 1,     dayOfWeek: 1 });

module.exports = mongoose.model("CrowdStat", CrowdStatSchema);
module.exports.CAMPUS_LOCATIONS = CAMPUS_LOCATIONS;
