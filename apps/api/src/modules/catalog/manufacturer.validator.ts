import { z } from 'zod';

export const createManufacturerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().optional(),
  licenseNumber: z.string().max(50).optional(),
  address: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
});

export const updateManufacturerSchema = createManufacturerSchema.partial();
