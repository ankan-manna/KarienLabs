import { z } from 'zod';

export const nameSlugFormSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short'),
  isActive: z.boolean().optional(),
});

export type NameSlugFormValues = z.infer<typeof nameSlugFormSchema>;
