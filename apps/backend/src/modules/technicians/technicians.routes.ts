import { Router } from "express";
import { Role } from "@home-service/database";
import { asyncHandler } from "../../common/http/asyncHandler";
import { authenticate, requireRole } from "../../common/middleware/auth";
import * as controller from "./technicians.controller";

export const techniciansRouter = Router();

// ── Technician self-service (Technician App) ──────────────────────────────
const me = Router();
me.use(authenticate, requireRole(Role.TECHNICIAN));
me.post("/", asyncHandler(controller.createOwnProfile));
me.get("/", asyncHandler(controller.getOwnProfile));
me.patch("/availability", asyncHandler(controller.setAvailabilityToggle));
me.post("/services", asyncHandler(controller.addService));
me.post("/service-areas", asyncHandler(controller.addServiceArea));
me.post("/availability-windows", asyncHandler(controller.setAvailabilityWindow));
me.post("/verification", asyncHandler(controller.submitVerification));
me.get("/jobs", asyncHandler(controller.listOwnJobs));
me.post("/jobs/:bookingId/respond", asyncHandler(controller.respondToJob));
me.post("/jobs/:bookingId/advance", asyncHandler(controller.advanceJob));
me.get("/wallet", asyncHandler(controller.getWallet));
me.post("/wallet/withdraw", asyncHandler(controller.requestWithdrawal));

techniciansRouter.use("/me", me);

// ── Admin (Admin Dashboard) ─────────────────────────────────────────────
const admin = Router();
admin.use(authenticate, requireRole(Role.ADMIN));
admin.get("/", asyncHandler(controller.listForAdmin));
admin.get("/:id", asyncHandler(controller.getForAdmin));
admin.post("/:id/approve", asyncHandler(controller.approve));
admin.post("/:id/reject", asyncHandler(controller.reject));
admin.post("/:id/suspend", asyncHandler(controller.suspend));
admin.post("/:id/reactivate", asyncHandler(controller.reactivate));

techniciansRouter.use("/admin", admin);
