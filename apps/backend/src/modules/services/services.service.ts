import { prisma } from "@serviceflow/database";
import { NotFoundError } from "@serviceflow/shared";

/**
 * Services are entirely admin-managed data (spec §5/§28: "services must NOT
 * be hard-coded"). This module is the only place that reads/writes the
 * Service table — adding "Cleaning" or "Carpentry" later is a POST here,
 * not a code change.
 */

export async function listActiveServices() {
  return prisma.service.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
}

export async function listAllServices() {
  return prisma.service.findMany({ orderBy: { name: "asc" } });
}

export interface CreateServiceInput {
  name: string;
  slug: string;
  description?: string;
  iconUrl?: string;
  basePriceMin: number;
  basePriceMax: number;
}

export async function createService(input: CreateServiceInput) {
  return prisma.service.create({ data: input });
}

export interface UpdateServiceInput {
  name?: string;
  description?: string;
  iconUrl?: string;
  basePriceMin?: number;
  basePriceMax?: number;
}

export async function updateService(serviceId: string, input: UpdateServiceInput) {
  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) throw new NotFoundError("Service", serviceId);
  return prisma.service.update({ where: { id: serviceId }, data: input });
}

export async function setServiceActive(serviceId: string, isActive: boolean) {
  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) throw new NotFoundError("Service", serviceId);
  return prisma.service.update({ where: { id: serviceId }, data: { isActive } });
}
