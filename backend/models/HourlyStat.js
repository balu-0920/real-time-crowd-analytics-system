const mongoose = require("mongoose");
const { CAMPUS_LOCATIONS } = require("./CrowdStat");

const HourlyStatSchema = new mongoose.Schema({
  camera: {
    type: String,
    required: true,
    default: "default",
    index: true,
  },
  location: {
    type: String,
    enum: CAMPUS_LOCATIONS,
    default: null,
    index: true,
  },
  timestamp: {
    type: Date,
    required: true,
    index: true, // Start of hour (e.g. YYYY-MM-DDTHH:00:00.000Z)
  },
  dateStr: {
    type: String,
    required: true,
    index: true, // YYYY-MM-DD
  },
  hour: {
    type: Number,
    required: true,
    min: 0,
    max: 23,
    index: true,
  },
  dayOfWeek: {
    type: Number,
    required: true,
    min: 0,
    max: 6,
  },
  isWeekend: {
    type: Boolean,
    default: false,
  },
  avgPeople: {
    type: Number,
    required: true,
    min: 0,
  },
  maxPeople: {
    type: Number,
    required: true,
    min: 0,
  },
  minPeople: {
    type: Number,
    required: true,
    min: 0,
  },
  avgCapacity: {
    type: Number,
    required: true,
    min: 1,
  },
  avgDensityRatio: {
    type: Number,
    required: true,
    min: 0,
  },
  totalObservations: {
    type: Number,
    required: true,
    min: 0,
  },
  densityBreakdown: {
    LOW: { type: Number, default: 0 },
    MEDIUM: { type: Number, default: 0 },
    HIGH: { type: Number, default: 0 },
  },
  highDensityCount: {
    type: Number,
    default: 0,
  },
  weatherDominant: {
    type: String,
    enum: ["clear", "cloudy", "rainy", "stormy", "unknown"],
    default: "clear",
  },
  eventTypeDominant: {
    type: String,
    enum: ["normal", "class_change", "exam", "fest", "sports", "emergency"],
    default: "normal",
  },
  aggregatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Unique compound index for idempotency per camera, location, and hour timestamp
HourlyStatSchema.index({ camera: 1, location: 1, timestamp: 1 }, { unique: true });
HourlyStatSchema.index({ camera: 1, timestamp: -1 });
HourlyStatSchema.index({ location: 1, timestamp: -1 });
HourlyStatSchema.index({ dateStr: 1, camera: 1 });

module.exports = mongoose.model("HourlyStat", HourlyStatSchema);
