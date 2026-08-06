const mongoose = require("mongoose");
const { CAMPUS_LOCATIONS } = require("./CrowdStat");

const DailyStatSchema = new mongoose.Schema({
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
  dateStr: {
    type: String,
    required: true,
    index: true, // YYYY-MM-DD
  },
  timestamp: {
    type: Date,
    required: true,
    index: true, // Start of day (e.g. YYYY-MM-DDT00:00:00.000Z)
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
  peakHour: {
    type: Number,
    min: 0,
    max: 23,
    default: 0,
  },
  peakHourMaxPeople: {
    type: Number,
    default: 0,
  },
  aggregatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Unique compound index for idempotency per camera, location, and dateStr
DailyStatSchema.index({ camera: 1, location: 1, dateStr: 1 }, { unique: true });
DailyStatSchema.index({ camera: 1, timestamp: -1 });
DailyStatSchema.index({ location: 1, timestamp: -1 });
DailyStatSchema.index({ dateStr: -1 });

module.exports = mongoose.model("DailyStat", DailyStatSchema);
