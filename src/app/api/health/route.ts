import { prisma } from "@/lib/db";
import { getRedis } from "@/lib/redis";

export async function GET() {
  const [dbResult, redisResult] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    getRedis().ping(),
  ]);

  const db = dbResult.status === "fulfilled" ? "ok" : "error";
  const redis = redisResult.status === "fulfilled" ? "ok" : "error";
  const status = db === "ok" && redis === "ok" ? "ok" : "degraded";

  return Response.json(
    { status, db, redis, ts: Date.now() },
    { status: status === "ok" ? 200 : 503 }
  );
}
