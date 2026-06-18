
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
  // Formula:  capacity = floor(camera_area / avg_person_area)
  // Only stored when cameras are actively detecting (> 0).
  // Never accepts the old hardcoded value of 20.
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
    max:      10,            // allow overflow > 1 when more people than capacity
  },

  timestamp: {
    type:    Date,
    default: Date.now,
    index:   true,
  },
});

// ── Compound indexes ─────────────────────────────────────────────
CrowdStatSchema.index({ camera: 1,   timestamp: -1 });
CrowdStatSchema.index({ location: 1, timestamp: -1 });
CrowdStatSchema.index({ timestamp: -1 });

module.exports = mongoose.model("CrowdStat", CrowdStatSchema);
module.exports.CAMPUS_LOCATIONS = CAMPUS_LOCATIONS;
