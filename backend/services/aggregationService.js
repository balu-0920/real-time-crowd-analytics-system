const CrowdStat = require("../models/CrowdStat");
const HourlyStat = require("../models/HourlyStat");
const DailyStat = require("../models/DailyStat");

/**
 * Helper to calculate mode (most frequent value) in an array
 */
function getDominantValue(arr, defaultValue = "normal") {
  if (!arr || arr.length === 0) return defaultValue;
  const counts = {};
  let maxCount = 0;
  let dominant = arr[0] || defaultValue;
  for (const item of arr) {
    if (!item) continue;
    counts[item] = (counts[item] || 0) + 1;
    if (counts[item] > maxCount) {
      maxCount = counts[item];
      dominant = item;
    }
  }
  return dominant;
}

/**
 * Aggregates raw CrowdStat records into HourlyStat documents for a given time window.
 * Default window is the previous full hour.
 */
async function aggregateHourlyStats(options = {}) {
  try {
    let start, end;

    if (options.startTime && options.endTime) {
      start = new Date(options.startTime);
      end = new Date(options.endTime);
    } else {
      // Default to previous full hour
      const now = new Date();
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);
      start = new Date(end.getTime() - 60 * 60 * 1000);
    }

    const matchQuery = {
      timestamp: { $gte: start, $lt: end },
    };
    if (options.camera) matchQuery.camera = options.camera;
    if (options.location) matchQuery.location = options.location;

    // MongoDB aggregation pipeline
    const aggregatedResults = await CrowdStat.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            camera: "$camera",
            location: "$location",
            dateStr: "$dateStr",
            hour: "$hour",
            dayOfWeek: "$dayOfWeek",
            isWeekend: "$isWeekend",
          },
          avgPeople: { $avg: "$people" },
          maxPeople: { $max: "$people" },
          minPeople: { $min: "$people" },
          avgCapacity: { $avg: "$capacity" },
          avgDensityRatio: { $avg: "$densityRatio" },
          totalObservations: { $sum: 1 },
          lowCount: {
            $sum: { $cond: [{ $eq: ["$density", "LOW"] }, 1, 0] },
          },
          mediumCount: {
            $sum: { $cond: [{ $eq: ["$density", "MEDIUM"] }, 1, 0] },
          },
          highCount: {
            $sum: { $cond: [{ $eq: ["$density", "HIGH"] }, 1, 0] },
          },
          weathers: { $push: "$weather" },
          eventTypes: { $push: "$eventType" },
        },
      },
    ]);

    let upsertCount = 0;

    for (const item of aggregatedResults) {
      const group = item._id;
      if (!group.dateStr || group.hour === undefined) continue;

      // Construct timestamp representing start of hour
      const [year, month, day] = group.dateStr.split("-").map(Number);
      const hourStartTs = new Date(Date.UTC(year, month - 1, day, group.hour, 0, 0, 0));

      const weatherDominant = getDominantValue(item.weathers, "clear");
      const eventTypeDominant = getDominantValue(item.eventTypes, "normal");

      const docData = {
        camera: group.camera || "default",
        location: group.location || null,
        timestamp: hourStartTs,
        dateStr: group.dateStr,
        hour: group.hour,
        dayOfWeek: group.dayOfWeek !== undefined ? group.dayOfWeek : hourStartTs.getUTCDay(),
        isWeekend: group.isWeekend !== undefined ? group.isWeekend : (group.dayOfWeek === 0 || group.dayOfWeek === 6),
        avgPeople: Number(item.avgPeople.toFixed(1)),
        maxPeople: item.maxPeople,
        minPeople: item.minPeople,
        avgCapacity: Number(item.avgCapacity.toFixed(1)),
        avgDensityRatio: Number(item.avgDensityRatio.toFixed(2)),
        totalObservations: item.totalObservations,
        densityBreakdown: {
          LOW: item.lowCount,
          MEDIUM: item.mediumCount,
          HIGH: item.highCount,
        },
        highDensityCount: item.highCount,
        weatherDominant,
        eventTypeDominant,
        aggregatedAt: new Date(),
      };

      // Idempotent upsert
      await HourlyStat.findOneAndUpdate(
        { camera: docData.camera, location: docData.location, timestamp: docData.timestamp },
        { $set: docData },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      );

      upsertCount++;
    }

    return {
      success: true,
      processed: aggregatedResults.length,
      upserted: upsertCount,
      window: { start: start.toISOString(), end: end.toISOString() },
    };
  } catch (err) {
    console.error("❌ Error in aggregateHourlyStats:", err);
    throw err;
  }
}

/**
 * Aggregates HourlyStat records into DailyStat documents for a given date range.
 * Default window is yesterday.
 */
async function aggregateDailyStats(options = {}) {
  try {
    let startDateStr, endDateStr;

    if (options.dateStr) {
      startDateStr = options.dateStr;
      endDateStr = options.dateStr;
    } else if (options.startDate && options.endDate) {
      startDateStr = options.startDate;
      endDateStr = options.endDate;
    } else {
      // Default to yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const y = yesterday.getFullYear();
      const m = String(yesterday.getMonth() + 1).padStart(2, "0");
      const d = String(yesterday.getDate()).padStart(2, "0");
      startDateStr = `${y}-${m}-${d}`;
      endDateStr = startDateStr;
    }

    const matchQuery = {
      dateStr: { $gte: startDateStr, $lte: endDateStr },
    };
    if (options.camera) matchQuery.camera = options.camera;
    if (options.location) matchQuery.location = options.location;

    // First try aggregating from HourlyStat documents
    let hourlyGroups = await HourlyStat.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            camera: "$camera",
            location: "$location",
            dateStr: "$dateStr",
            dayOfWeek: "$dayOfWeek",
            isWeekend: "$isWeekend",
          },
          hourlyRecords: {
            $push: {
              hour: "$hour",
              avgPeople: "$avgPeople",
              maxPeople: "$maxPeople",
              minPeople: "$minPeople",
              avgCapacity: "$avgCapacity",
              avgDensityRatio: "$avgDensityRatio",
              totalObservations: "$totalObservations",
              lowCount: "$densityBreakdown.LOW",
              mediumCount: "$densityBreakdown.MEDIUM",
              highCount: "$densityBreakdown.HIGH",
            },
          },
        },
      },
    ]);

    let upsertCount = 0;

    for (const item of hourlyGroups) {
      const group = item._id;
      const records = item.hourlyRecords || [];
      if (records.length === 0) continue;

      let totalObs = 0;
      let sumWeightedPeople = 0;
      let sumWeightedCapacity = 0;
      let sumWeightedRatio = 0;
      let globalMaxPeople = 0;
      let globalMinPeople = Infinity;
      let lowCount = 0;
      let mediumCount = 0;
      let highCount = 0;

      let peakHour = 0;
      let peakHourMaxPeople = 0;

      for (const rec of records) {
        const obs = rec.totalObservations || 1;
        totalObs += obs;
        sumWeightedPeople += rec.avgPeople * obs;
        sumWeightedCapacity += rec.avgCapacity * obs;
        sumWeightedRatio += rec.avgDensityRatio * obs;

        if (rec.maxPeople > globalMaxPeople) {
          globalMaxPeople = rec.maxPeople;
        }
        if (rec.minPeople < globalMinPeople) {
          globalMinPeople = rec.minPeople;
        }

        lowCount += rec.lowCount || 0;
        mediumCount += rec.mediumCount || 0;
        highCount += rec.highCount || 0;

        // Determine peak hour by highest maxPeople (or avgPeople)
        if (rec.maxPeople > peakHourMaxPeople) {
          peakHourMaxPeople = rec.maxPeople;
          peakHour = rec.hour;
        }
      }

      if (globalMinPeople === Infinity) globalMinPeople = 0;

      const avgPeople = totalObs > 0 ? Number((sumWeightedPeople / totalObs).toFixed(1)) : 0;
      const avgCapacity = totalObs > 0 ? Number((sumWeightedCapacity / totalObs).toFixed(1)) : 1;
      const avgDensityRatio = totalObs > 0 ? Number((sumWeightedRatio / totalObs).toFixed(2)) : 0;

      const [year, month, day] = group.dateStr.split("-").map(Number);
      const dayStartTs = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

      const docData = {
        camera: group.camera || "default",
        location: group.location || null,
        dateStr: group.dateStr,
        timestamp: dayStartTs,
        dayOfWeek: group.dayOfWeek,
        isWeekend: group.isWeekend,
        avgPeople,
        maxPeople: globalMaxPeople,
        minPeople: globalMinPeople,
        avgCapacity,
        avgDensityRatio,
        totalObservations: totalObs,
        densityBreakdown: {
          LOW: lowCount,
          MEDIUM: mediumCount,
          HIGH: highCount,
        },
        highDensityCount: highCount,
        peakHour,
        peakHourMaxPeople,
        aggregatedAt: new Date(),
      };

      // Idempotent upsert
      await DailyStat.findOneAndUpdate(
        { camera: docData.camera, location: docData.location, dateStr: docData.dateStr },
        { $set: docData },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      );

      upsertCount++;
    }

    return {
      success: true,
      processed: hourlyGroups.length,
      upserted: upsertCount,
      window: { startDateStr, endDateStr },
    };
  } catch (err) {
    console.error("❌ Error in aggregateDailyStats:", err);
    throw err;
  }
}

/**
 * Backfill & catchup function: Aggregates all pending raw CrowdStat records
 * into HourlyStat and DailyStat records up to the current hour.
 */
async function runCatchupAggregation() {
  try {
    // Find earliest CrowdStat record
    const earliestDoc = await CrowdStat.findOne().sort({ timestamp: 1 }).lean();
    if (!earliestDoc) {
      return { success: true, message: "No CrowdStat records found to aggregate" };
    }

    const startTs = new Date(earliestDoc.timestamp);
    const now = new Date();
    const endTs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);

    let hourlyCount = 0;
    let curr = new Date(startTs.getFullYear(), startTs.getMonth(), startTs.getDate(), startTs.getHours(), 0, 0, 0);

    while (curr < endTs) {
      const nextHour = new Date(curr.getTime() + 60 * 60 * 1000);
      const res = await aggregateHourlyStats({ startTime: curr, endTime: nextHour });
      hourlyCount += res.upserted;
      curr = nextHour;
    }

    // Now aggregate daily stats for all dateStrs found in HourlyStat
    const dateStrs = await HourlyStat.distinct("dateStr");
    let dailyCount = 0;
    for (const dStr of dateStrs) {
      const res = await aggregateDailyStats({ dateStr: dStr });
      dailyCount += res.upserted;
    }

    return {
      success: true,
      hourlyUpserts: hourlyCount,
      dailyUpserts: dailyCount,
      datesCovered: dateStrs.length,
    };
  } catch (err) {
    console.error("❌ Error in runCatchupAggregation:", err);
    throw err;
  }
}

module.exports = {
  aggregateHourlyStats,
  aggregateDailyStats,
  runCatchupAggregation,
};
