/**
 * Sets (or resets) the bootstrap admin's password from
 * ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD. Run once after seeding:
 *   pnpm --filter backend bootstrap:admin
 */
import bcrypt from "bcryptjs";
import { prisma } from "@home-service/database";
import { env } from "../config/env";
import { logger } from "../config/logger";

async function main() {
  if (!env.ADMIN_BOOTSTRAP_EMAIL || !env.ADMIN_BOOTSTRAP_PASSWORD) {
    throw new Error("Set ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD in .env first");
  }

  const passwordHash = await bcrypt.hash(env.ADMIN_BOOTSTRAP_PASSWORD, 10);

  const admin = await prisma.user.update({
    where: { email: env.ADMIN_BOOTSTRAP_EMAIL },
    data: { passwordHash },
  });

  logger.info(`Password set for admin ${admin.email}`);
}

main()
  .catch((err) => {
    logger.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
