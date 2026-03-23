// const mongoose = require("mongoose");

// const CrowdStatSchema = new mongoose.Schema({
//   people: Number,
//   capacity: Number,
//   density: String,
//   densityRatio: Number,
//   timestamp: Date
// });

// module.exports = mongoose.model("CrowdStat", CrowdStatSchema);


const mongoose = require("mongoose");

const CrowdStatSchema = new mongoose.Schema({
  camera:       { type: String,  required: true, default: "default" },
  people:       { type: Number,  required: true },
  capacity:     { type: Number,  required: true },
  density:      { type: String,  required: true, enum: ["LOW", "MEDIUM", "HIGH"] },
  densityRatio: { type: Number,  required: true },
  timestamp:    { type: Date,    required: true, default: Date.now },
});

// Compound index: fast queries per camera + time
CrowdStatSchema.index({ camera: 1, timestamp: -1 });
CrowdStatSchema.index({ timestamp: -1 });

module.exports = mongoose.model("CrowdStat", CrowdStatSchema);