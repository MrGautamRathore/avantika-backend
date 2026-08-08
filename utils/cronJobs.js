const cron = require('node-cron');
const { generateAndEmailMonthlyStats } = require('../routes/statsRoutes');

/**
 * Runs automatically at 09:00 AM on the 1st of every month
 * (server timezone — pass a `timezone` option if your server isn't IST).
 *
 * Cron pattern: minute hour day-of-month month day-of-week
 *   '0 9 1 * *'  ->  09:00 on day 1 of every month
 */
function startCronJobs() {
  cron.schedule(
    '0 9 1 * *',
    async () => {
      console.log('[cron] Generating monthly stats + sending report email...');
      try {
        const stats = await generateAndEmailMonthlyStats();
        if (stats) {
          console.log(`[cron] Monthly stats for ${stats.month} generated and emailed.`);
        } else {
          console.log('[cron] Stats already existed for this month, skipped.');
        }
      } catch (err) {
        console.error('[cron] Monthly stats job failed:', err.message);
      }
    },
    { timezone: 'Asia/Kolkata' }
  );

  console.log('[cron] Monthly stats job scheduled (1st of every month, 9:00 AM IST).');
}

module.exports = startCronJobs;