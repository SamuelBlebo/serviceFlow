import { Router } from "express";
import { Role } from "@serviceflow/database";
import { asyncHandler } from "../../common/http/asyncHandler";
import { authenticate, requireRole } from "../../common/middleware/auth";
import * as servicesController from "./services.controller";

export const servicesRouter = Router();

// Public catalogue — used by the WhatsApp bot's menu today, and directly by
// a future customer-facing surface. No auth required to browse services.
servicesRouter.get("/", asyncHandler(servicesController.listPublic));

const admin = Router();
admin.use(authenticate, requireRole(Role.ADMIN));
admin.get("/", asyncHandler(servicesController.listAdmin));
admin.post("/", asyncHandler(servicesController.create));
admin.patch("/:id", asyncHandler(servicesController.update));
admin.patch("/:id/active", asyncHandler(servicesController.setActive));

servicesRouter.use("/admin", admin);
