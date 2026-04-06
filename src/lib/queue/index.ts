import { Queue } from "bullmq";
import { createBullMQConnection } from "@/lib/redis";

const connection = createBullMQConnection();

export const jobScrapeQueue = new Queue("job-scrape", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

export const gmailSyncQueue = new Queue("gmail-sync", {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "fixed", delay: 10000 },
    removeOnComplete: 50,
    removeOnFail: 25,
  },
});

export type JobScrapePayload = {
  userId: string;
  sessionId: string;
  query: string;
  location: string;
  platforms?: string[];
};

export type GmailSyncPayload = {
  userId: string;
  keywords?: string[];
  days?: number;
};
