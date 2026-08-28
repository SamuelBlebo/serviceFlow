import { Router } from "express";
import { Role } from "@home-service/database";
import { asyncHandler } from "../../common/http/asyncHandler";
import { authenticate, requireRole } from "../../common/middleware/auth";
import * as controller from "./bookings.controller";

export const bookingsRouter = Router();
bookingsRouter.use(authenticate);

// IMPORTANT: the "/admin" sub-router must be registered before the "/:id"
// routes below — otherwise Express would match GET /admin as :id="admin".
const admin = Router();
admin.use(requireRole(Role.ADMIN));
admin.get("/", asyncHandler(controller.listForAdmin));
admin.post("/:id/reassign", asyncHandler(controller.reassign));

bookingsRouter.use("/admin", admin);

bookingsRouter.get("/:id", asyncHandler(controller.getById));
bookingsRouter.post("/:id/confirm", requireRole(Role.CUSTOMER), asyncHandler(controller.confirm));
bookingsRouter.post("/:id/cancel", requireRole(Role.CUSTOMER, Role.TECHNICIAN, Role.ADMIN), asyncHandler(controller.cancel));
bookingsRouter.post("/:id/pay", requireRole(Role.CUSTOMER), asyncHandler(controller.pay));
bookingsRouter.post("/:id/rating", requireRole(Role.CUSTOMER), asyncHandler(controller.rate));
