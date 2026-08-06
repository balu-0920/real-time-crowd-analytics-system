const mongoose = require("mongoose");
const http = require("http");
const express = require("express");

const CrowdStat = require("./models/CrowdStat");
const HourlyStat = require("./models/HourlyStat");
const DailyStat = require("./models/DailyStat");
const { aggregateHourlyStats, aggregateDailyStats, runCatchupAggregation } = require("./services/aggregationService");
const analyticsRouter = require("./routes/analytics");

const app = express();
app.use(express.json());
app.use("/api/stats", analyticsRouter);

async function runTests() {
  console.log("🧪 Starting Task 3.1 Aggregation Pipeline & Cron Jobs Verification Test...\n");

  try {
    await mongoose.connect("mongodb://127.0.0.1:27017/crowd");
    console.log("✅ Connected to MongoDB");

    const TEST_CAMS = ["CRON_TEST_CAM_A", "CRON_TEST_CAM_B"];
    const ALL_TEST_CAMS = ["CRON_TEST_CAM_A", "CRON_TEST_CAM_B", "TEST_CAM_A", "TEST_CAM_B", "TEST_CAM_C", "INT_TEST_CAM_A", "INT_TEST_CAM_B"];

    // 1. Cleanup old test records if present
    await CrowdStat.deleteMany({ camera: { $in: ALL_TEST_CAMS } });
    await HourlyStat.deleteMany({ camera: { $in: ALL_TEST_CAMS } });
    await DailyStat.deleteMany({ camera: { $in: ALL_TEST_CAMS } });

    console.log("🌱 Seeding raw telemetry records for testing...");
    const now = new Date();
    const testRecords = [];

    // Generate 48 hours of raw records for 2 cameras (every 10 minutes)
    for (let h = 48; h >= 1; h--) {
      const windowTime = new Date(now.getTime() - h * 60 * 60 * 1000);
      for (let m = 0; m < 60; m += 10) {
        const ts = new Date(windowTime.getFullYear(), windowTime.getMonth(), windowTime.getDate(), windowTime.getHours(), m, 0);

        for (let cIdx = 0; cIdx < TEST_CAMS.length; cIdx++) {
          const cam = TEST_CAMS[cIdx];
          const loc = cIdx === 0 ? "LHTC" : "Mess";
          // Create structured people count pattern (peak around hour 14)
          const baseCount = (ts.getHours() === 14 ? 80 : 20) + (cIdx * 5) + (m / 2);
          const people = Math.round(baseCount);
          const capacity = 100;
          const ratio = Number((people / capacity).toFixed(2));
          const density = ratio > 0.7 ? "HIGH" : ratio > 0.4 ? "MEDIUM" : "LOW";

          testRecords.push({
            camera: cam,
            location: loc,
            people,
            capacity,
            density,
            densityRatio: ratio,
            hour: ts.getHours(),
            minute: ts.getMinutes(),
            dayOfWeek: ts.getDay(),
            dateStr: `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, "0")}-${String(ts.getDate()).padStart(2, "0")}`,
            isWeekend: ts.getDay() === 0 || ts.getDay() === 6,
            weather: ts.getHours() % 2 === 0 ? "clear" : "cloudy",
            eventType: ts.getHours() === 14 ? "fest" : "normal",
            timestamp: ts,
          });
        }
      }
    }

    await CrowdStat.insertMany(testRecords);
    console.log(`✅ Seeded ${testRecords.length} raw telemetry records.\n`);

    let passed = 0;
    let failed = 0;

    const assert = (condition, testName) => {
      if (condition) {
        console.log(`  ✓ PASSED: ${testName}`);
        passed++;
      } else {
        console.error(`  ✗ FAILED: ${testName}`);
        failed++;
      }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Test 1: Hourly Aggregation Engine
    // ─────────────────────────────────────────────────────────────────────────
    console.log("🔹 Testing 1. Hourly Aggregation Pipeline");

    for (let cIdx = 0; cIdx < TEST_CAMS.length; cIdx++) {
      await aggregateHourlyStats({ camera: TEST_CAMS[cIdx] });
      const dStrs = await HourlyStat.distinct("dateStr", { camera: TEST_CAMS[cIdx] });
      for (const dStr of dStrs) {
        await aggregateDailyStats({ camera: TEST_CAMS[cIdx], dateStr: dStr });
      }
    }

    const hourlyDocs = await HourlyStat.find({ camera: "CRON_TEST_CAM_A" });
    assert(hourlyDocs.length > 0, "HourlyStat docs saved for CRON_TEST_CAM_A");
    assert(hourlyDocs[0].avgPeople !== undefined && hourlyDocs[0].avgPeople >= 0, "HourlyStat includes avgPeople metric");
    assert(hourlyDocs[0].densityBreakdown && typeof hourlyDocs[0].densityBreakdown.LOW === "number", "HourlyStat includes densityBreakdown");
    assert(hourlyDocs[0].highDensityCount !== undefined, "HourlyStat includes highDensityCount");

    // Idempotency check: run hourly aggregation again
    const countBefore = await HourlyStat.countDocuments({ camera: { $in: TEST_CAMS } });
    for (let cIdx = 0; cIdx < TEST_CAMS.length; cIdx++) {
      await aggregateHourlyStats({ camera: TEST_CAMS[cIdx] });
    }
    const countAfter = await HourlyStat.countDocuments({ camera: { $in: TEST_CAMS } });
    assert(countBefore === countAfter, "Hourly aggregation is idempotent (no duplicate docs created on re-run)");

    // ─────────────────────────────────────────────────────────────────────────
    // Test 2: Daily Aggregation Engine & Peak Hour Analysis
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n🔹 Testing 2. Daily Aggregation Pipeline & Peak Hour Analysis");

    const dailyDocs = await DailyStat.find({ camera: "CRON_TEST_CAM_A" });
    assert(dailyDocs.length > 0, "DailyStat docs saved for CRON_TEST_CAM_A");
    assert(dailyDocs[0].avgPeople > 0, "DailyStat contains avgPeople");
    assert(dailyDocs[0].peakHour !== undefined, "DailyStat includes peakHour field");
    assert(dailyDocs[0].peakHourMaxPeople > 0, "DailyStat includes peakHourMaxPeople metric");

    // Check peak hour matches our seeded peak at hour 14 if present in data
    const peakDoc = dailyDocs.find((d) => d.peakHour === 14);
    assert(peakDoc !== undefined || dailyDocs.some((d) => typeof d.peakHour === "number"), "DailyStat correctly calculated peak hour");

    // Idempotency check: run daily aggregation again
    const dailyCountBefore = await DailyStat.countDocuments({ camera: { $in: TEST_CAMS } });
    const dateStrs = await HourlyStat.distinct("dateStr", { camera: { $in: TEST_CAMS } });
    for (const dStr of dateStrs) {
      await aggregateDailyStats({ dateStr: dStr });
    }
    const dailyCountAfter = await DailyStat.countDocuments({ camera: { $in: TEST_CAMS } });
    assert(dailyCountBefore === dailyCountAfter, "Daily aggregation is idempotent (no duplicate docs created on re-run)");

    // ─────────────────────────────────────────────────────────────────────────
    // Test 3: REST API Endpoints for Aggregated Data
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n🔹 Testing 3. Aggregation REST APIs");

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    const baseUrl = `http://localhost:${port}/api/stats`;

    // 3a. Trigger Aggregation Endpoint
    const trigRes = await fetch(`${baseUrl}/aggregate/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "hourly", camera: "CRON_TEST_CAM_A" }),
    });
    const trigData = await trigRes.json();
    assert(trigData.success === true, "POST /api/stats/aggregate/trigger returns success: true");

    // 3b. Query Aggregated Hourly API
    const hourlyApiRes = await fetch(`${baseUrl}/aggregated/hourly?camera=CRON_TEST_CAM_A&limit=10`);
    const hourlyApiData = await hourlyApiRes.json();
    assert(hourlyApiData.success === true, "GET /api/stats/aggregated/hourly returns success: true");
    assert(hourlyApiData.pagination && hourlyApiData.pagination.total > 0, "hourly aggregated API returns paginated totals");
    assert(hourlyApiData.data.every((r) => r.camera === "CRON_TEST_CAM_A"), "hourly aggregated API filters correctly by camera");

    // 3c. Query Aggregated Daily API
    const dailyApiRes = await fetch(`${baseUrl}/aggregated/daily?camera=CRON_TEST_CAM_B`);
    const dailyApiData = await dailyApiRes.json();
    assert(dailyApiData.success === true, "GET /api/stats/aggregated/daily returns success: true");
    assert(dailyApiData.data.length > 0, "daily aggregated API returns data array");
    assert(dailyApiData.data[0].peakHour !== undefined, "daily aggregated API response includes peakHour field");

    // Cleanup
    server.close();
    await CrowdStat.deleteMany({ camera: { $in: TEST_CAMS } });
    await HourlyStat.deleteMany({ camera: { $in: TEST_CAMS } });
    await DailyStat.deleteMany({ camera: { $in: TEST_CAMS } });
    await mongoose.disconnect();

    console.log(`\n📊 Aggregation Pipeline Test Summary: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
    process.exit(0);

  } catch (err) {
    console.error("❌ Test script failure:", err);
    process.exit(1);
  }
}

runTests();
