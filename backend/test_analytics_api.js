const mongoose = require("mongoose");
const http = require("http");
const CrowdStat = require("./models/CrowdStat");
const express = require("express");
const analyticsRouter = require("./routes/analytics");

const app = express();
app.use(express.json());
app.use("/api/stats", analyticsRouter);

async function runTests() {
  console.log("🧪 Starting Task 2.1 Analytics APIs Verification Test...\n");

  try {
    await mongoose.connect("mongodb://127.0.0.1:27017/crowd");
    console.log("✅ Connected to MongoDB");

    // Clean test data older test runs if present
    await CrowdStat.deleteMany({ camera: { $in: ["TEST_CAM_A", "TEST_CAM_B", "TEST_CAM_C"] } });

    // Seed test records
    console.log("🌱 Seeding test dataset...");
    const now = Date.now();
    const testRecords = [];

    // Generate 150 records over the past 3 days for 3 test cameras and locations
    const cameras = ["TEST_CAM_A", "TEST_CAM_B", "TEST_CAM_C"];
    const locations = ["LHTC", "Mess", "SAC"];
    const densities = ["LOW", "MEDIUM", "HIGH"];

    for (let i = 0; i < 150; i++) {
      const timeOffset = i * 30 * 60 * 1000; // every 30 minutes going backwards
      const ts = new Date(now - timeOffset);
      const cam = cameras[i % 3];
      const loc = locations[i % 3];
      const people = (i % 50) + 5;
      const capacity = 60;
      const densityRatio = Number((people / capacity).toFixed(2));
      const density = densityRatio > 0.7 ? "HIGH" : densityRatio > 0.4 ? "MEDIUM" : "LOW";

      testRecords.push({
        camera: cam,
        location: loc,
        people,
        capacity,
        density,
        densityRatio,
        hour: ts.getHours(),
        minute: ts.getMinutes(),
        dayOfWeek: ts.getDay(),
        dateStr: ts.toISOString().split("T")[0],
        isWeekend: ts.getDay() === 0 || ts.getDay() === 6,
        weather: "clear",
        eventType: i % 10 === 0 ? "fest" : "normal",
        timestamp: ts
      });
    }

    await CrowdStat.insertMany(testRecords);
    console.log(`✅ Seeded ${testRecords.length} test records into MongoDB.\n`);

    // Start ephemeral server
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    const baseUrl = `http://localhost:${port}/api/stats`;

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
    // Test 1: GET /api/stats/history
    // ─────────────────────────────────────────────────────────────────────────
    console.log("🔹 Testing 1. GET /api/stats/history");

    // 1a. Default History Fetch
    const res1 = await fetch(`${baseUrl}/history?camera=TEST_CAM_A&limit=10`);
    const data1 = await res1.json();
    assert(data1.success === true, "returns success: true");
    assert(data1.summary && data1.summary.totalRecords === 50, "summary calculates correct totalRecords for TEST_CAM_A");
    assert(data1.summary.avgPeople > 0, "summary calculates avgPeople");
    assert(data1.pagination && data1.pagination.limit === 10, "respects pagination limit");
    assert(data1.data && data1.data.length === 10, "returns correct record count");

    // 1b. Location and Density Filter
    const res2 = await fetch(`${baseUrl}/history?camera=TEST_CAM_A&density=HIGH`);
    const data2 = await res2.json();
    assert(data2.success === true, "returns success: true with density filter");
    assert(data2.data.every((r) => r.density === "HIGH"), "filtered records all have density=HIGH");

    // ─────────────────────────────────────────────────────────────────────────
    // Test 2: GET /api/stats/comparison
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n🔹 Testing 2. GET /api/stats/comparison");

    // 2a. Multi-Camera Mode
    const resCompCam = await fetch(`${baseUrl}/comparison?mode=cameras&camera=TEST_CAM_A,TEST_CAM_B`);
    const dataCompCam = await resCompCam.json();
    assert(dataCompCam.success === true, "camera comparison returns success: true");
    assert(Array.isArray(dataCompCam.metrics) && dataCompCam.metrics.length === 2, "returns metrics for both requested cameras");
    assert(dataCompCam.metrics[0].densityBreakdown !== undefined, "includes density breakdown per camera");
    assert(Array.isArray(dataCompCam.timeSeriesComparison), "returns timeSeriesComparison pivot array");

    // 2b. Location Mode
    const resCompLoc = await fetch(`${baseUrl}/comparison?mode=locations`);
    const dataCompLoc = await resCompLoc.json();
    assert(dataCompLoc.success === true, "location comparison returns success: true");
    assert(dataCompLoc.metrics.some((m) => m.entity === "LHTC"), "includes metrics for location LHTC");

    // 2c. Time Period Comparison Mode
    const resCompPeriod = await fetch(`${baseUrl}/comparison?mode=time_periods`);
    const dataCompPeriod = await resCompPeriod.json();
    assert(dataCompPeriod.success === true, "period comparison returns success: true");
    assert(dataCompPeriod.periodA && dataCompPeriod.periodB, "returns periodA and periodB objects");
    assert(dataCompPeriod.delta && typeof dataCompPeriod.delta.avgPeoplePercentChange === "number", "returns delta calculations");

    // ─────────────────────────────────────────────────────────────────────────
    // Test 3: GET /api/stats/trends
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n🔹 Testing 3. GET /api/stats/trends");

    const resTrends = await fetch(`${baseUrl}/trends?camera=TEST_CAM_A&interval=hour`);
    const dataTrends = await resTrends.json();
    assert(dataTrends.success === true, "trends returns success: true");
    assert(Array.isArray(dataTrends.timeSeries) && dataTrends.timeSeries.length > 0, "returns timeSeries trendlines");
    assert(Array.isArray(dataTrends.hourlyDistribution) && dataTrends.hourlyDistribution.length === 24, "returns 24-hour distribution matrix");
    assert(Array.isArray(dataTrends.dayOfWeekDistribution) && dataTrends.dayOfWeekDistribution.length === 7, "returns 7-day dayOfWeek distribution matrix");
    assert(dataTrends.densityDistribution && typeof dataTrends.densityDistribution.HIGH_pct === "number", "returns density percentage breakdown");

    // Cleanup
    server.close();
    await CrowdStat.deleteMany({ camera: { $in: ["TEST_CAM_A", "TEST_CAM_B", "TEST_CAM_C"] } });
    await mongoose.disconnect();

    console.log(`\n📊 Test Summary: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
    process.exit(0);

  } catch (err) {
    console.error("❌ Test script failure:", err);
    process.exit(1);
  }
}

runTests();
