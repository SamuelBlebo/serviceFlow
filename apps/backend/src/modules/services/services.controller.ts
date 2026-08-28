import type { Request, Response } from "express";
import { z } from "zod";
import { requireParam } from "../../common/http/params";
import * as servicesService from "./services.service";

export async function listPublic(_req: Request, res: Response) {
  const services = await servicesService.listActiveServices();
  res.json({ services });
}

export async function listAdmin(_req: Request, res: Response) {
  const services = await servicesService.listAllServices();
  res.json({ services });
}

const createSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  iconUrl: z.string().url().optional(),
  basePriceMin: z.number().nonnegative(),
  basePriceMax: z.number().nonnegative(),
});

export async function create(req: Request, res: Response) {
  const input = createSchema.parse(req.body);
  const service = await servicesService.createService(input);
  res.status(201).json({ service });
}

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  iconUrl: z.string().url().optional(),
  basePriceMin: z.number().nonnegative().optional(),
  basePriceMax: z.number().nonnegative().optional(),
});

export async function update(req: Request, res: Response) {
  const input = updateSchema.parse(req.body);
  const service = await servicesService.updateService(requireParam(req, "id"), input);
  res.json({ service });
}

const setActiveSchema = z.object({ isActive: z.boolean() });

export async function setActive(req: Request, res: Response) {
  const { isActive } = setActiveSchema.parse(req.body);
  const service = await servicesService.setServiceActive(requireParam(req, "id"), isActive);
  res.json({ service });
}
