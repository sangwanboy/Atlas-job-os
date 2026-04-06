import { Worker } from "bullmq";
import { createBullMQConnection } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { syncGmail } from "@/lib/services/integration/gmail/sync-engine";
import type { GmailSyncPayload } from "../index";

const log = logger.child({ worker: "gmail-sync" });

export function startGmailSyncWorker() {
  const worker = new Worker<GmailSyncPayload>(
    "gmail-sync",
    async (job) => {
      const { userId, keywords, days } = job.data;
      log.info({ userId, days }, "Processing gmail sync job");

      const result = await syncGmail(userId, { keywords, days });
      if (!result.success) {
        throw new Error(result.error ?? "Gmail sync failed");
      }

      log.info({ userId, count: result.count }, "Gmail sync completed");
      return { count: result.count };
    },
    {
      connection: createBullMQConnection(),
      concurrency: 1,
    }
  );

  worker.on("completed", (job) => {
    log.info({ jobId: job.id }, "Gmail sync completed");
  });

  worker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, err: err.message }, "Gmail sync failed");
  });

  return worker;
}
