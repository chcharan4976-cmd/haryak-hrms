import * as z from 'zod';

export const salaryComponentSchema = z.object({
  name: z.string().min(1, 'Component name is required'),
  code: z.string().min(1, 'Component code is required').toUpperCase(),
  type: z.enum(['EARNING', 'DEDUCTION']),
  is_taxable: z.boolean().default(true),
  is_fixed: z.boolean().default(true),
  part_of_ctc: z.boolean().default(true),
});

export const salaryStructureSchema = z.object({
  name: z.string().min(1, 'Structure name is required'),
  description: z.string().optional(),
  is_active: z.boolean().default(true),
  components: z.array(z.object({
    component_id: z.string().uuid(),
    calculation_type: z.enum(['FLAT', 'PERCENTAGE']),
    calculation_value: z.coerce.number().min(0),
    base_component_id: z.string().uuid().optional(),
  })).min(1, 'At least one component is required'),
});

export const payrollRunSchema = z.object({
  period_id: z.string().uuid('Invalid payroll period'),
  employee_ids: z.array(z.string().uuid()).optional(), // Optional: if empty, run for all eligible
});

export const payrollSettingsSchema = z.object({
  payroll_cycle: z.enum(['MONTHLY', 'SEMI_MONTHLY', 'WEEKLY']),
  cutoff_date: z.coerce.number().min(1).max(31),
  payment_date: z.coerce.number().min(1).max(31),
});

export type SalaryComponentInput = z.infer<typeof salaryComponentSchema>;
export type SalaryStructureInput = z.infer<typeof salaryStructureSchema>;
export type PayrollRunInput = z.infer<typeof payrollRunSchema>;
export type PayrollSettingsInput = z.infer<typeof payrollSettingsSchema>;
