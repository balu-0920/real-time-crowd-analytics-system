const mongoose = require("mongoose");
const http = require("http");
const express = require("express");

const CrowdStat = require("./models/CrowdStat");
const HourlyStat = require("./models/HourlyStat");
const DailyStat = require("./models/DailyStat");
const { runCatchupAggregation } = require("./services/aggregationService");
const analyticsRouter = require("./routes/analytics");

const app = express();
app.use(express.json());
app.use("/api/stats", analyticsRouter);
app.use("/api/analytics", analyticsRouter);

async function runIntegrationTests() {
  console.log("🧪 Starting Task 3.2 High-Performance Aggregated Analytics API Verification Test...\n");

  try {
    await mongoose.connect("mongodb://127.0.0.1:27017/crowd");
    console.log("✅ Connected to MongoDB");

    const TEST_CAMS = ["INT_TEST_CAM_A", "INT_TEST_CAM_B"];

    // 1. Cleanup old test records
    await CrowdStat.deleteMany({ camera: { $in: TEST_CAMS } });
    await HourlyStat.deleteMany({ camera: { $in: TEST_CAMS } });
    await DailyStat.deleteMany({ camera: { $in: TEST_CAMS } });

    // 2. Seed raw records across 2 days
    console.log("🌱 Seeding test dataset...");
    const now = new Date();
    const testRecords = [];

    for (let h = 24; h >= 1; h--) {
      const windowTime = new Date(now.getTime() - h * 60 * 60 * 1000);
      for (let m = 0; m < 60; m += 15) {
        const ts = new Date(windowTime.getFullYear(), windowTime.getMonth(), windowTime.getDate(), windowTime.getHours(), m, 0);
        for (let cIdx = 0; cIdx < TEST_CAMS.length; cIdx++) {
          const cam = TEST_CAMS[cIdx];
          const loc = cIdx === 0 ? "LHTC" : "Mess";
          const people = ts.getHours() === 14 ? 90 : 25;
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
            weather: "clear",
            eventType: "normal",
            timestamp: ts,
          });
        }
      }
    }

    await CrowdStat.insertMany(testRecords);
    console.log(`✅ Seeded ${testRecords.length} raw telemetry records.`);

    // Run catchup pipeline to populate HourlyStat and DailyStat tables
    await runCatchupAggregation();
    console.log("✅ Pre-aggregated tables populated via pipeline.\n");

    // Start ephemeral server
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    const analyticsUrl = `http://localhost:${port}/api/analytics`;
    const statsUrl = `http://localhost:${port}/api/stats`;

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
    // Test 1: GET /api/analytics/hourly
    // ─────────────────────────────────────────────────────────────────────────
    console.log("🔹 Testing 1. GET /api/analytics/hourly");

    const resHourly = await fetch(`${analyticsUrl}/hourly?camera=INT_TEST_CAM_A`);
    const dataHourly = await resHourly.json();
    assert(dataHourly.success === true, "returns success: true");
    assert(dataHourly.isPreAggregated === true, "returns isPreAggregated: true");
    assert(dataHourly.querySource === "HourlyStat", "returns querySource: HourlyStat");
    assert(typeof dataHourly.executionTimeMs === "number", "includes executionTimeMs execution timing metric");
    assert(dataHourly.summary && dataHourly.summary.avgPeople > 0, "calculates summary.avgPeople accurately");
    assert(Array.isArray(dataHourly.data) && dataHourly.data.length > 0, "returns data array of pre-aggregated hourly records");

    // ─────────────────────────────────────────────────────────────────────────
    // Test 2: GET /api/analytics/daily
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n🔹 Testing 2. GET /api/analytics/daily");

    const resDaily = await fetch(`${analyticsUrl}/daily?camera=INT_TEST_CAM_A`);
    const dataDaily = await resDaily.json();
    assert(dataDaily.success === true, "returns success: true");
    assert(dataDaily.isPreAggregated === true, "returns isPreAggregated: true");
    assert(dataDaily.querySource === "DailyStat", "returns querySource: DailyStat");
    assert(dataDaily.summary && dataDaily.summary.peakHour !== undefined, "calculates overall peakHour metric");
    assert(dataDaily.summary.peakHourMaxPeople >= 90, "correctly identifies peak hour max crowd count (>= 90)");
    assert(Array.isArray(dataDaily.data) && dataDaily.data.length > 0, "returns data array of pre-aggregated daily records");

    // ─────────────────────────────────────────────────────────────────────────
    // Test 3: Accelerated Trend Query (/api/stats/trends?useAggregated=true)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n🔹 Testing 3. Accelerated Trends Query (/api/stats/trends)");

    const resTrends = await fetch(`${statsUrl}/trends?camera=INT_TEST_CAM_A&useAggregated=true`);
    const dataTrends = await resTrends.json();
    assert(dataTrends.success === true, "trends returns success: true");
    assert(Array.isArray(dataTrends.timeSeries) && dataTrends.timeSeries.length > 0, "returns timeSeries array");

    // Cleanup
    server.close();
    await CrowdStat.deleteMany({ camera: { $in: TEST_CAMS } });
    await HourlyStat.deleteMany({ camera: { $in: TEST_CAMS } });
    await DailyStat.deleteMany({ camera: { $in: TEST_CAMS } });
    await mongoose.disconnect();

    console.log(`\n📊 Task 3.2 Integration Test Summary: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
    process.exit(0);

  } catch (err) {
    console.error("❌ Test script failure:", err);
    process.exit(1);
  }
}

runIntegrationTests();
