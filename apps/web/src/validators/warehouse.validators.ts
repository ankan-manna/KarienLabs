import { z } from 'zod';

export const warehouseFormSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short'),
  code: z.string().trim().min(2, 'Code is too short').max(20),
  isActive: z.boolean().optional(),
});

export type WarehouseFormValues = z.infer<typeof warehouseFormSchema>;
