import { Router } from "express";
import { asyncHandler } from "../../common/http/asyncHandler";
import * as whatsappController from "./whatsapp.controller";

export const whatsappRouter = Router();

whatsappRouter.get("/webhook", asyncHandler(async (req, res) => whatsappController.verifyWebhook(req, res)));
whatsappRouter.post("/webhook", asyncHandler(whatsappController.receiveWebhook));
