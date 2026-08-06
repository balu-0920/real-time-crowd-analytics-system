const express = require("express");
const router = express.Router();
const CrowdStat = require("../models/CrowdStat");
const HourlyStat = require("../models/HourlyStat");
const DailyStat = require("../models/DailyStat");
const { aggregateHourlyStats, aggregateDailyStats, runCatchupAggregation } = require("../services/aggregationService");


// Helper function to build date & metadata $match stage
function buildMatchQuery(query) {
  const { startDate, endDate, camera, location, density, eventType } = query;
  const match = {};

  if (startDate || endDate) {
    match.timestamp = {};
    if (startDate) {
      const s = !isNaN(Number(startDate)) ? new Date(Number(startDate)) : new Date(startDate);
      if (!isNaN(s.getTime())) match.timestamp.$gte = s;
    }
    if (endDate) {
      const e = !isNaN(Number(endDate)) ? new Date(Number(endDate)) : new Date(endDate);
      if (!isNaN(e.getTime())) match.timestamp.$lte = e;
    }
    if (Object.keys(match.timestamp).length === 0) delete match.timestamp;
  }

  if (camera) {
    const cams = camera.split(",").map((c) => c.trim()).filter(Boolean);
    if (cams.length === 1) match.camera = cams[0];
    else if (cams.length > 1) match.camera = { $in: cams };
  }

  if (location) {
    const locs = location.split(",").map((l) => l.trim()).filter(Boolean);
    if (locs.length === 1) match.location = locs[0];
    else if (locs.length > 1) match.location = { $in: locs };
  }

  if (density && ["LOW", "MEDIUM", "HIGH"].includes(density.toUpperCase())) {
    match.density = density.toUpperCase();
  }

  if (eventType && typeof eventType === "string" && eventType.trim()) {
    match.eventType = eventType.trim();
  }

  return match;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. GET /api/stats/history
// Historical records search with pagination, filtering & summary statistics
// ─────────────────────────────────────────────────────────────────────────────
router.get("/history", async (req, res) => {
  try {
    const match = buildMatchQuery(req.query);

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const skip = (page - 1) * limit;

    const allowedSortFields = ["timestamp", "people", "capacity", "densityRatio", "camera", "location"];
    const sortBy = allowedSortFields.includes(req.query.sortBy) ? req.query.sortBy : "timestamp";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

    const pipelineResults = await CrowdStat.aggregate([
      { $match: match },
      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,
                totalRecords: { $sum: 1 },
                avgPeople: { $avg: "$people" },
                maxPeople: { $max: "$people" },
                minPeople: { $min: "$people" },
                avgCapacity: { $avg: "$capacity" },
                avgDensityRatio: { $avg: "$densityRatio" },
                highDensityCount: {
                  $sum: { $cond: [{ $eq: ["$density", "HIGH"] }, 1, 0] }
                },
                mediumDensityCount: {
                  $sum: { $cond: [{ $eq: ["$density", "MEDIUM"] }, 1, 0] }
                },
                lowDensityCount: {
                  $sum: { $cond: [{ $eq: ["$density", "LOW"] }, 1, 0] }
                }
              }
            }
          ],
          records: [
            { $sort: { [sortBy]: sortOrder } },
            { $skip: skip },
            { $limit: limit }
          ]
        }
      }
    ]);

    const facetData = pipelineResults[0] || {};
    const summaryRaw = (facetData.summary && facetData.summary[0]) || {
      totalRecords: 0,
      avgPeople: 0,
      maxPeople: 0,
      minPeople: 0,
      avgCapacity: 0,
      avgDensityRatio: 0,
      highDensityCount: 0,
      mediumDensityCount: 0,
      lowDensityCount: 0
    };

    const totalRecords = summaryRaw.totalRecords || 0;
    const totalPages = Math.ceil(totalRecords / limit) || 1;

    res.json({
      success: true,
      summary: {
        totalRecords,
        avgPeople: Number((summaryRaw.avgPeople || 0).toFixed(1)),
        maxPeople: summaryRaw.maxPeople || 0,
        minPeople: summaryRaw.minPeople || 0,
        avgCapacity: Number((summaryRaw.avgCapacity || 0).toFixed(1)),
        avgDensityRatio: Number((summaryRaw.avgDensityRatio || 0).toFixed(2)),
        highDensityCount: summaryRaw.highDensityCount || 0,
        mediumDensityCount: summaryRaw.mediumDensityCount || 0,
        lowDensityCount: summaryRaw.lowDensityCount || 0,
        highDensityPercentage: totalRecords > 0
          ? Number(((summaryRaw.highDensityCount / totalRecords) * 100).toFixed(2))
          : 0
      },
      pagination: {
        total: totalRecords,
        page,
        limit,
        totalPages
      },
      data: facetData.records || []
    });
  } catch (err) {
    console.error("GET /api/stats/history error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch historical stats" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. GET /api/stats/comparison
// Multi-camera, multi-location, or period-over-period comparison API
// ─────────────────────────────────────────────────────────────────────────────
router.get("/comparison", async (req, res) => {
  try {
    const mode = ["cameras", "locations", "time_periods"].includes(req.query.mode)
      ? req.query.mode
      : "cameras";

    if (mode === "cameras" || mode === "locations") {
      const match = buildMatchQuery(req.query);
      const groupField = mode === "cameras" ? "$camera" : "$location";

      const metrics = await CrowdStat.aggregate([
        { $match: match },
        {
          $group: {
            _id: groupField,
            totalObservations: { $sum: 1 },
            avgPeople: { $avg: "$people" },
            maxPeople: { $max: "$people" },
            minPeople: { $min: "$people" },
            avgCapacity: { $avg: "$capacity" },
            avgDensityRatio: { $avg: "$densityRatio" },
            alertCount: {
              $sum: { $cond: [{ $eq: ["$density", "HIGH"] }, 1, 0] }
            },
            lowCount: {
              $sum: { $cond: [{ $eq: ["$density", "LOW"] }, 1, 0] }
            },
            mediumCount: {
              $sum: { $cond: [{ $eq: ["$density", "MEDIUM"] }, 1, 0] }
            },
            highCount: {
              $sum: { $cond: [{ $eq: ["$density", "HIGH"] }, 1, 0] }
            }
          }
        },
        { $sort: { avgPeople: -1 } }
      ]);

      const formattedMetrics = metrics
        .filter((m) => m._id !== null && m._id !== undefined)
        .map((m) => ({
          entity: m._id,
          totalObservations: m.totalObservations,
          avgPeople: Number(m.avgPeople.toFixed(1)),
          maxPeople: m.maxPeople,
          minPeople: m.minPeople,
          avgCapacity: Number(m.avgCapacity.toFixed(1)),
          avgDensityRatio: Number(m.avgDensityRatio.toFixed(2)),
          alertCount: m.alertCount,
          densityBreakdown: {
            LOW: m.lowCount,
            MEDIUM: m.mediumCount,
            HIGH: m.highCount
          }
        }));

      // Time-series breakdown for comparative chart line plots
      const timeSeriesMatch = { ...match };
      const timeSeriesGroupFormat = req.query.groupBy === "day" ? "%Y-%m-%d" : "%H:00";

      const timeSeries = await CrowdStat.aggregate([
        { $match: timeSeriesMatch },
        {
          $group: {
            _id: {
              bucket: { $dateToString: { format: timeSeriesGroupFormat, date: "$timestamp" } },
              entity: groupField
            },
            avgPeople: { $avg: "$people" }
          }
        },
        { $sort: { "_id.bucket": 1 } }
      ]);

      // Pivot timeSeries array by bucket
      const bucketMap = {};
      timeSeries.forEach((item) => {
        if (!item._id.entity) return;
        const bucket = item._id.bucket;
        if (!bucketMap[bucket]) {
          bucketMap[bucket] = { timeBucket: bucket };
        }
        bucketMap[bucket][item._id.entity] = Number(item.avgPeople.toFixed(1));
      });

      const timeSeriesComparison = Object.values(bucketMap).sort((a, b) =>
        a.timeBucket.localeCompare(b.timeBucket)
      );

      return res.json({
        success: true,
        mode,
        timeRange: {
          startDate: req.query.startDate || null,
          endDate: req.query.endDate || null
        },
        metrics: formattedMetrics,
        timeSeriesComparison
      });
    }

    // mode === "time_periods"
    const parsePeriodDate = (val, defaultVal) => {
      if (!val) return defaultVal;
      const d = !isNaN(Number(val)) ? new Date(Number(val)) : new Date(val);
      return !isNaN(d.getTime()) ? d : defaultVal;
    };

    const now = new Date();
    const defaultEndA = now;
    const defaultStartA = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const defaultEndB = new Date(defaultStartA.getTime() - 1);
    const defaultStartB = new Date(defaultStartA.getTime() - 7 * 24 * 60 * 60 * 1000);

    const startA = parsePeriodDate(req.query.startDate, defaultStartA);
    const endA = parsePeriodDate(req.query.endDate, defaultEndA);
    const startB = parsePeriodDate(req.query.compareStartDate, defaultStartB);
    const endB = parsePeriodDate(req.query.compareEndDate, defaultEndB);

    const baseFilter = buildMatchQuery(req.query);
    delete baseFilter.timestamp;

    const queryPeriod = async (start, end) => {
      const match = { ...baseFilter, timestamp: { $gte: start, $lte: end } };
      const agg = await CrowdStat.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalRecords: { $sum: 1 },
            avgPeople: { $avg: "$people" },
            maxPeople: { $max: "$people" },
            avgDensityRatio: { $avg: "$densityRatio" },
            highDensityCount: {
              $sum: { $cond: [{ $eq: ["$density", "HIGH"] }, 1, 0] }
            }
          }
        }
      ]);
      const res = agg[0] || {
        totalRecords: 0,
        avgPeople: 0,
        maxPeople: 0,
        avgDensityRatio: 0,
        highDensityCount: 0
      };
      return {
        totalRecords: res.totalRecords,
        avgPeople: Number((res.avgPeople || 0).toFixed(1)),
        maxPeople: res.maxPeople || 0,
        avgDensityRatio: Number((res.avgDensityRatio || 0).toFixed(2)),
        highDensityCount: res.highDensityCount || 0
      };
    };

    const [periodAData, periodBData] = await Promise.all([
      queryPeriod(startA, endA),
      queryPeriod(startB, endB)
    ]);

    const avgPeoplePercentChange = periodBData.avgPeople > 0
      ? Number((((periodAData.avgPeople - periodBData.avgPeople) / periodBData.avgPeople) * 100).toFixed(2))
      : 0;

    res.json({
      success: true,
      mode: "time_periods",
      periodA: {
        label: "Current Period",
        startDate: startA.toISOString(),
        endDate: endA.toISOString(),
        ...periodAData
      },
      periodB: {
        label: "Comparison Period",
        startDate: startB.toISOString(),
        endDate: endB.toISOString(),
        ...periodBData
      },
      delta: {
        avgPeopleDiff: Number((periodAData.avgPeople - periodBData.avgPeople).toFixed(1)),
        avgPeoplePercentChange,
        maxPeopleDiff: periodAData.maxPeople - periodBData.maxPeople,
        highDensityCountDiff: periodAData.highDensityCount - periodBData.highDensityCount
      }
    });
  } catch (err) {
    console.error("GET /api/stats/comparison error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch comparison stats" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. GET /api/stats/trends
// Time-series trendlines, hourly matrix (0-23h), day-of-week & density breakdown
// ─────────────────────────────────────────────────────────────────────────────
router.get("/trends", async (req, res) => {
  try {
    const match = buildMatchQuery(req.query);
    const interval = ["raw", "minute", "hour", "day"].includes(req.query.interval)
      ? req.query.interval
      : "hour";
    const includeDistribution = req.query.includeDistribution !== "false";

    // 1. Time-series trendlines
    let timeFormat = "%Y-%m-%dT%H:00:00.000Z";
    if (interval === "minute") timeFormat = "%Y-%m-%dT%H:%M:00.000Z";
    if (interval === "day") timeFormat = "%Y-%m-%d";

    let timeSeries = [];
    if (interval === "raw") {
      const rawDocs = await CrowdStat.find(match)
        .sort({ timestamp: 1 })
        .limit(1000)
        .lean();
      timeSeries = rawDocs.map((d) => ({
        timestamp: d.timestamp,
        label: d.timestamp ? new Date(d.timestamp).toISOString() : "",
        avgPeople: d.people,
        maxPeople: d.people,
        minPeople: d.people,
        avgDensityRatio: Number(d.densityRatio.toFixed(2)),
        sampleCount: 1,
        highAlerts: d.density === "HIGH" ? 1 : 0
      }));
    } else {
      const aggSeries = await CrowdStat.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $dateToString: { format: timeFormat, date: "$timestamp" } },
            avgPeople: { $avg: "$people" },
            maxPeople: { $max: "$people" },
            minPeople: { $min: "$people" },
            avgDensityRatio: { $avg: "$densityRatio" },
            sampleCount: { $sum: 1 },
            highAlerts: {
              $sum: { $cond: [{ $eq: ["$density", "HIGH"] }, 1, 0] }
            }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      timeSeries = aggSeries.map((s) => ({
        timestamp: s._id,
        label: s._id,
        avgPeople: Number(s.avgPeople.toFixed(1)),
        maxPeople: s.maxPeople,
        minPeople: s.minPeople,
        avgDensityRatio: Number(s.avgDensityRatio.toFixed(2)),
        sampleCount: s.sampleCount,
        highAlerts: s.highAlerts
      }));
    }

    if (!includeDistribution) {
      return res.json({
        success: true,
        filter: { camera: req.query.camera || null, location: req.query.location || null, interval },
        timeSeries
      });
    }

    // 2. Hourly Distribution (0 - 23 hrs)
    const hourlyAgg = await CrowdStat.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$hour",
          avgPeople: { $avg: "$people" },
          maxPeople: { $max: "$people" },
          sampleCount: { $sum: 1 },
          alertCount: {
            $sum: { $cond: [{ $eq: ["$density", "HIGH"] }, 1, 0] }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const hourlyMap = {};
    hourlyAgg.forEach((h) => {
      if (h._id !== null && h._id !== undefined) {
        hourlyMap[h._id] = {
          hour: h._id,
          avgPeople: Number(h.avgPeople.toFixed(1)),
          maxPeople: h.maxPeople,
          sampleCount: h.sampleCount,
          alertCount: h.alertCount
        };
      }
    });

    const hourlyDistribution = Array.from({ length: 24 }, (_, h) => {
      return hourlyMap[h] || { hour: h, avgPeople: 0, maxPeople: 0, sampleCount: 0, alertCount: 0 };
    });

    // 3. Day of Week Distribution (0 - 6, Sunday - Saturday)
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dowAgg = await CrowdStat.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$dayOfWeek",
          avgPeople: { $avg: "$people" },
          maxPeople: { $max: "$people" },
          sampleCount: { $sum: 1 },
          alertCount: {
            $sum: { $cond: [{ $eq: ["$density", "HIGH"] }, 1, 0] }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const dowMap = {};
    dowAgg.forEach((d) => {
      if (d._id !== null && d._id !== undefined) {
        dowMap[d._id] = {
          dayOfWeek: d._id,
          dayName: dayNames[d._id] || `Day ${d._id}`,
          avgPeople: Number(d.avgPeople.toFixed(1)),
          maxPeople: d.maxPeople,
          sampleCount: d.sampleCount,
          alertCount: d.alertCount
        };
      }
    });

    const dayOfWeekDistribution = Array.from({ length: 7 }, (_, d) => {
      return dowMap[d] || { dayOfWeek: d, dayName: dayNames[d], avgPeople: 0, maxPeople: 0, sampleCount: 0, alertCount: 0 };
    });

    // 4. Density Distribution Breakdown
    const densityAgg = await CrowdStat.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$density",
          count: { $sum: 1 }
        }
      }
    ]);

    const densityCounts = { LOW: 0, MEDIUM: 0, HIGH: 0 };
    let totalDensitySamples = 0;
    densityAgg.forEach((d) => {
      if (d._id && densityCounts[d._id] !== undefined) {
        densityCounts[d._id] = d.count;
        totalDensitySamples += d.count;
      }
    });

    const densityDistribution = {
      LOW: densityCounts.LOW,
      MEDIUM: densityCounts.MEDIUM,
      HIGH: densityCounts.HIGH,
      LOW_pct: totalDensitySamples > 0 ? Number(((densityCounts.LOW / totalDensitySamples) * 100).toFixed(2)) : 0,
      MEDIUM_pct: totalDensitySamples > 0 ? Number(((densityCounts.MEDIUM / totalDensitySamples) * 100).toFixed(2)) : 0,
      HIGH_pct: totalDensitySamples > 0 ? Number(((densityCounts.HIGH / totalDensitySamples) * 100).toFixed(2)) : 0
    };

    res.json({
      success: true,
      filter: { camera: req.query.camera || null, location: req.query.location || null, interval },
      timeSeries,
      hourlyDistribution,
      dayOfWeekDistribution,
      densityDistribution
    });
  } catch (err) {
    console.error("GET /api/stats/trends error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch trend analytics" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. POST /api/stats/aggregate/trigger
// Manual or programmatic trigger for hourly and daily aggregation pipelines
// ─────────────────────────────────────────────────────────────────────────────
router.post("/aggregate/trigger", async (req, res) => {
  try {
    const { type = "all", startTime, endTime, dateStr, startDate, endDate, camera, location } = req.body || {};
    let result = {};

    if (type === "hourly") {
      result = await aggregateHourlyStats({ startTime, endTime, camera, location });
    } else if (type === "daily") {
      result = await aggregateDailyStats({ dateStr, startDate, endDate, camera, location });
    } else {
      // type === "all" or "catchup"
      result = await runCatchupAggregation();
    }

    res.json({
      success: true,
      type,
      result
    });
  } catch (err) {
    console.error("POST /api/stats/aggregate/trigger error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to run aggregation pipeline" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. GET /hourly (also accessible via /api/analytics/hourly and /api/stats/aggregated/hourly)
// High-Performance pre-aggregated 1-hour analytics endpoint
// ─────────────────────────────────────────────────────────────────────────────
router.get(["/hourly", "/aggregated/hourly"], async (req, res) => {
  const startTimeMs = performance.now();
  try {
    const match = {};
    const { camera, location, dateStr, startDate, endDate, hour } = req.query;

    if (camera) {
      const cams = camera.split(",").map((c) => c.trim()).filter(Boolean);
      match.camera = cams.length === 1 ? cams[0] : { $in: cams };
    }
    if (location) {
      const locs = location.split(",").map((l) => l.trim()).filter(Boolean);
      match.location = locs.length === 1 ? locs[0] : { $in: locs };
    }
    if (dateStr) match.dateStr = dateStr;
    if (hour !== undefined && hour !== null && hour !== "") match.hour = parseInt(hour, 10);

    if (startDate || endDate) {
      match.timestamp = {};
      if (startDate) match.timestamp.$gte = new Date(startDate);
      if (endDate) match.timestamp.$lte = new Date(endDate);
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const skip = (page - 1) * limit;

    const total = await HourlyStat.countDocuments(match);
    const docs = await HourlyStat.find(match)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const summaryAgg = await HourlyStat.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalObservations: { $sum: "$totalObservations" },
          avgPeople: { $avg: "$avgPeople" },
          maxPeople: { $max: "$maxPeople" },
          minPeople: { $min: "$minPeople" },
          avgDensityRatio: { $avg: "$avgDensityRatio" },
          highDensityCount: { $sum: "$highDensityCount" },
          lowCount: { $sum: "$densityBreakdown.LOW" },
          mediumCount: { $sum: "$densityBreakdown.MEDIUM" },
          highCount: { $sum: "$densityBreakdown.HIGH" }
        }
      }
    ]);

    const s = summaryAgg[0] || {};
    const executionTimeMs = Number((performance.now() - startTimeMs).toFixed(2));

    res.json({
      success: true,
      isPreAggregated: true,
      querySource: "HourlyStat",
      executionTimeMs,
      summary: {
        totalRecords: total,
        totalObservations: s.totalObservations || 0,
        avgPeople: Number((s.avgPeople || 0).toFixed(1)),
        maxPeople: s.maxPeople || 0,
        minPeople: s.minPeople || 0,
        avgDensityRatio: Number((s.avgDensityRatio || 0).toFixed(2)),
        highDensityCount: s.highDensityCount || 0,
        densityBreakdown: {
          LOW: s.lowCount || 0,
          MEDIUM: s.mediumCount || 0,
          HIGH: s.highCount || 0
        }
      },
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1
      },
      data: docs
    });
  } catch (err) {
    console.error("GET /hourly error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch aggregated hourly stats" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. GET /daily (also accessible via /api/analytics/daily and /api/stats/aggregated/daily)
// High-Performance pre-aggregated 24-hour daily analytics endpoint
// ─────────────────────────────────────────────────────────────────────────────
router.get(["/daily", "/aggregated/daily"], async (req, res) => {
  const startTimeMs = performance.now();
  try {
    const match = {};
    const { camera, location, dateStr, startDate, endDate } = req.query;

    if (camera) {
      const cams = camera.split(",").map((c) => c.trim()).filter(Boolean);
      match.camera = cams.length === 1 ? cams[0] : { $in: cams };
    }
    if (location) {
      const locs = location.split(",").map((l) => l.trim()).filter(Boolean);
      match.location = locs.length === 1 ? locs[0] : { $in: locs };
    }
    if (dateStr) match.dateStr = dateStr;

    if (startDate || endDate) {
      match.timestamp = {};
      if (startDate) match.timestamp.$gte = new Date(startDate);
      if (endDate) match.timestamp.$lte = new Date(endDate);
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const skip = (page - 1) * limit;

    const total = await DailyStat.countDocuments(match);
    const docs = await DailyStat.find(match)
      .sort({ dateStr: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const summaryAgg = await DailyStat.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalObservations: { $sum: "$totalObservations" },
          avgPeople: { $avg: "$avgPeople" },
          maxPeople: { $max: "$maxPeople" },
          minPeople: { $min: "$minPeople" },
          avgDensityRatio: { $avg: "$avgDensityRatio" },
          highDensityCount: { $sum: "$highDensityCount" },
          lowCount: { $sum: "$densityBreakdown.LOW" },
          mediumCount: { $sum: "$densityBreakdown.MEDIUM" },
          highCount: { $sum: "$densityBreakdown.HIGH" }
        }
      }
    ]);

    const s = summaryAgg[0] || {};
    const executionTimeMs = Number((performance.now() - startTimeMs).toFixed(2));

    let peakHour = 0;
    let peakHourMaxPeople = 0;
    docs.forEach((d) => {
      if (d.peakHourMaxPeople > peakHourMaxPeople) {
        peakHourMaxPeople = d.peakHourMaxPeople;
        peakHour = d.peakHour;
      }
    });

    res.json({
      success: true,
      isPreAggregated: true,
      querySource: "DailyStat",
      executionTimeMs,
      summary: {
        totalRecords: total,
        totalObservations: s.totalObservations || 0,
        avgPeople: Number((s.avgPeople || 0).toFixed(1)),
        maxPeople: s.maxPeople || 0,
        minPeople: s.minPeople || 0,
        avgDensityRatio: Number((s.avgDensityRatio || 0).toFixed(2)),
        highDensityCount: s.highDensityCount || 0,
        peakHour,
        peakHourMaxPeople,
        densityBreakdown: {
          LOW: s.lowCount || 0,
          MEDIUM: s.mediumCount || 0,
          HIGH: s.highCount || 0
        }
      },
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1
      },
      data: docs
    });
  } catch (err) {
    console.error("GET /daily error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch aggregated daily stats" });
  }
});


module.exports = router;

