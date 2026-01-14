
'use client';

import { z } from 'zod';
import type { UserRole } from '@/lib/types';

const allRoles: UserRole[] = [
  'Admin', 'Manager', 'Employee', 'Customer', 'CEO', 'Sales Manager', 'Production Manager', 'Purchase Manager', 'Service Manager', 'Accounts Manager', 'HR Manager', 'Gate Keeper', 'Inventory Manager', 'Partner',
];

export const userFormSchema = z.object({
  contactPerson: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  email: z.string().email(),
  role: z.enum(allRoles),
  businessName: z.string().optional(),
  mobile: z.string().optional(),
  password: z.string().optional(),
});

export type UserFormValues = z.infer<typeof userFormSchema>;
