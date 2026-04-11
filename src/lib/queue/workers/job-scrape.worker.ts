import { Worker } from "bullmq";
import { createBullMQConnection } from "@/lib/redis";
import { logger } from "@/lib/logger";
import type { JobScrapePayload } from "../index";

const log = logger.child({ worker: "job-scrape" });

export function startJobScrapeWorker() {
  const worker = new Worker<JobScrapePayload>(
    "job-scrape",
    async (job) => {
      const { userId, sessionId, query, location } = job.data;
      log.info({ userId, sessionId, query, location }, "Processing scrape job");

      // The actual scraping logic lives in the browser-extract-jobs tool handler
      // in the orchestrator. The worker pattern here enables async queueing so
      // the HTTP thread isn't blocked. For now, workers log the intent; the
      // orchestrator still handles inline scraping via the extension.
      // TODO: move ScraperService.scrape() here once decoupled from HTTP context.

      log.info({ jobId: job.id }, "Scrape job queued for processing");
      return { queued: true, query, location };
    },
    {
      connection: createBullMQConnection(),
      concurrency: 15,
    }
  );

  worker.on("completed", (job) => {
    log.info({ jobId: job.id }, "Scrape job completed");
  });

  worker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, err: err.message }, "Scrape job failed");
  });

  return worker;
}
