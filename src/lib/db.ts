import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Connection pool size — tune via DATABASE_CONNECTION_LIMIT env var.
// Prisma enforces this via the connection_limit URL param appended here.
// Default 10 for dev/beta; set higher (e.g. 25) behind PgBouncer in prod.
function buildDatabaseUrl(): string {
  const base = process.env.DATABASE_URL ?? "";
  const limit = process.env.DATABASE_CONNECTION_LIMIT ?? "35";
  const timeout = process.env.DATABASE_POOL_TIMEOUT ?? "20";
  const sep = base.includes("?") ? "&" : "?";
  // Don't double-append if already set
  if (base.includes("connection_limit=")) return base;
  return `${base}${sep}connection_limit=${limit}&pool_timeout=${timeout}`;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: buildDatabaseUrl() } },
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
