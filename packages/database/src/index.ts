import { PrismaClient } from "@prisma/client";

/**
 * Singleton Prisma client. In dev, Node's module cache already gives us a
 * singleton per process; we still guard against hot-reload creating extra
 * connections by stashing the instance on `globalThis`.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "@prisma/client";
