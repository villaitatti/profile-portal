import { prisma } from '../lib/prisma.js';
import type { Application, CreateApplicationInput, UpdateApplicationInput, LoginMethod } from '@itatti/shared';
import { hasAnyRole } from '@itatti/shared';

function toApp(row: {
  id: number;
  name: string;
  description: string | null;
  url: string;
  imageUrl: string | null;
  loginMethod: string;
  requiredRoles: string[];
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): Application {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    url: row.url,
    imageUrl: row.imageUrl ?? undefined,
    loginMethod: row.loginMethod as LoginMethod,
    requiredRoles: row.requiredRoles,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listApplications(userRoles?: string[]): Promise<Application[]> {
  const rows = await prisma.application.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });

  const apps = rows.map(toApp);

  // If roles provided, filter to visible apps (unless user is staff-it)
  if (userRoles && !hasAnyRole(userRoles, ['staff-it'])) {
    return apps.filter((app) => hasAnyRole(userRoles, app.requiredRoles));
  }

  return apps;
}

export async function getApplication(id: number): Promise<Application | null> {
  const row = await prisma.application.findUnique({ where: { id } });
  return row ? toApp(row) : null;
}

export async function createApplication(input: CreateApplicationInput): Promise<Application> {
  const row = await prisma.application.create({
    data: {
      name: input.name,
      description: input.description,
      url: input.url,
      imageUrl: input.imageUrl,
      loginMethod: input.loginMethod,
      requiredRoles: input.requiredRoles,
      sortOrder: input.sortOrder ?? 0,
    },
  });
  return toApp(row);
}

export async function updateApplication(
  id: number,
  input: UpdateApplicationInput
): Promise<Application | null> {
  const existing = await prisma.application.findUnique({ where: { id } });
  if (!existing) return null;

  const row = await prisma.application.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.url !== undefined && { url: input.url }),
      ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
      ...(input.loginMethod !== undefined && { loginMethod: input.loginMethod }),
      ...(input.requiredRoles !== undefined && { requiredRoles: input.requiredRoles }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  });
  return toApp(row);
}

export async function deleteApplication(id: number): Promise<boolean> {
  try {
    await prisma.application.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}
