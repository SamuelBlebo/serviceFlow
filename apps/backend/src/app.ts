import express, { type Request } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { logger } from "./config/logger";
import { errorHandler, notFoundHandler } from "./common/middleware/errorHandler";
import { authRouter } from "./modules/auth/auth.routes";
import { servicesRouter } from "./modules/services/services.routes";
import { techniciansRouter } from "./modules/technicians/technicians.routes";
import { bookingsRouter } from "./modules/bookings/bookings.routes";
import { whatsappRouter } from "./modules/whatsapp/whatsapp.routes";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/health" } }));

  // Capture the raw body so WhatsApp webhook signature verification can hash
  // the exact bytes Meta signed, not a re-serialized copy.
  app.use(
    express.json({
      verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = Buffer.from(buf);
      },
    }),
  );

  const globalLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false });
  app.use(globalLimiter);

  app.get("/health", (_req, res) => res.json({ status: "ok", service: "home-service-backend" }));

  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/services", servicesRouter);
  app.use("/api/v1/technicians", techniciansRouter);
  app.use("/api/v1/bookings", bookingsRouter);
  app.use("/api/v1/whatsapp", whatsappRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
