import { startJobScrapeWorker } from "./workers/job-scrape.worker";
import { startGmailSyncWorker } from "./workers/gmail-sync.worker";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db";
import cron from "node-cron";

const log = logger.child({ process: "workers" });

const scrapeWorker = startJobScrapeWorker();
const gmailWorker = startGmailSyncWorker();

log.info("BullMQ workers started: job-scrape, gmail-sync");

// ─── Job archiving cron ───────────────────────────────────────────────────────
// Runs daily at 02:00. Soft-archives REJECTED/ARCHIVED jobs older than 90 days
// by stamping archivedAt. Keeps the hot jobs table lean without deleting data.
cron.schedule("0 2 * * *", async () => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  try {
    const result = await prisma.job.updateMany({
      where: {
        applicationStatus: { in: ["REJECTED", "ARCHIVED"] },
        createdAt: { lt: cutoff },
        archivedAt: null,
      },
      data: { archivedAt: new Date() },
    });
    log.info({ archived: result.count }, "Job archiving cron: archived old jobs");
  } catch (err) {
    log.error({ err }, "Job archiving cron: failed");
  }
});

log.info("Cron scheduled: job archiving at 02:00 daily");

// ─── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown() {
  log.info("Shutting down workers...");
  await Promise.all([scrapeWorker.close(), gmailWorker.close()]);
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
