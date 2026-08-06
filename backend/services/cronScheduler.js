const cron = require("node-cron");
const { aggregateHourlyStats, aggregateDailyStats, runCatchupAggregation } = require("./aggregationService");

let hourlyCronTask = null;
let dailyCronTask = null;

/**
 * Initializes background cron jobs for hourly & daily aggregation pipelines.
 */
function initCronJobs() {
  console.log("⏰ Initializing Aggregation Pipeline Background Cron Jobs...");

  // 1. Hourly Aggregation Cron Job — Runs every hour at minute 0 ('0 * * * *')
  hourlyCronTask = cron.schedule("0 * * * *", async () => {
    const now = new Date().toISOString();
    console.log(`[CRON ${now}] 🔄 Running Scheduled Hourly Aggregation...`);
    try {
      const result = await aggregateHourlyStats();
      console.log(`[CRON ${now}] ✅ Hourly Aggregation Complete:`, result);
    } catch (err) {
      console.error(`[CRON ${now}] ❌ Hourly Aggregation Cron Error:`, err.message);
    }
  });

  // 2. Daily Aggregation Cron Job — Runs once daily at 00:00 midnight ('0 0 * * *')
  dailyCronTask = cron.schedule("0 0 * * *", async () => {
    const now = new Date().toISOString();
    console.log(`[CRON ${now}] 🔄 Running Scheduled Daily Aggregation...`);
    try {
      const result = await aggregateDailyStats();
      console.log(`[CRON ${now}] ✅ Daily Aggregation Complete:`, result);
    } catch (err) {
      console.error(`[CRON ${now}] ❌ Daily Aggregation Cron Error:`, err.message);
    }
  });

  // 3. Initial startup catchup backfill (async)
  setTimeout(() => {
    runCatchupAggregation()
      .then((res) => {
        console.log("🚀 Initial Aggregation Startup Catchup Finished:", res);
      })
      .catch((err) => {
        console.error("⚠️ Startup Catchup Aggregation Warning:", err.message);
      });
  }, 2000);

  console.log("✅ Aggregation Cron Jobs scheduled successfully (Hourly: '0 * * * *', Daily: '0 0 * * *').");
}

module.exports = {
  initCronJobs,
  hourlyCronTask,
  dailyCronTask,
};
