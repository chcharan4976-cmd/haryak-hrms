import * as z from 'zod';
import { EMPLOYMENT_TYPE } from '../constants';

export const personalDetailsSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  date_of_birth: z.coerce.date().max(new Date(), 'Date of birth cannot be in the future'),
  phone: z.string().min(10, 'Phone number must be at least 10 digits'),
  personal_email: z.string().email('Invalid email address'),
  work_email: z.string().email('Invalid email address').optional(),
});

export const employmentDetailsSchema = z.object({
  joining_date: z.coerce.date(),
  employment_type: z.nativeEnum(EMPLOYMENT_TYPE),
  probation_end_date: z.coerce.date().optional(),
  notice_period_days: z.coerce.number().min(0, 'Notice period cannot be negative'),
});

export const departmentSchema = z.object({
  department_id: z.string().uuid('Invalid department').optional(),
  designation_id: z.string().uuid('Invalid designation').optional(),
  location_id: z.string().uuid('Invalid location').optional(),
  reporting_manager_id: z.string().uuid('Invalid manager').optional(),
});

export const compensationSchema = z.object({
  annual_ctc: z.coerce.number().positive('CTC must be positive'),
  components: z.array(z.object({
    component_id: z.string().uuid(),
    amount: z.coerce.number().min(0),
  })).optional(),
});

export const bankDetailsSchema = z.object({
  bank_name: z.string().min(1, 'Bank name is required'),
  account_holder_name: z.string().min(1, 'Account holder name is required'),
  account_number: z.string().min(1, 'Account number is required'),
  ifsc_code: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code'),
  branch_name: z.string().min(1, 'Branch name is required'),
});

export const statutoryDetailsSchema = z.object({
  pan: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN format'),
  pf_applicable: z.boolean().default(true),
  pf_number: z.string().optional(),
  uan_number: z.string().length(12, 'UAN must be 12 digits').optional(),
  esi_applicable: z.boolean().default(false),
  esi_number: z.string().optional(),
  pt_applicable: z.boolean().default(true),
  tax_regime: z.enum(['OLD', 'NEW']).default('NEW'),
});

export const createEmployeeSchema = z.object({
  personal: personalDetailsSchema,
  employment: employmentDetailsSchema,
  department: departmentSchema,
  compensation: compensationSchema,
  bank: bankDetailsSchema.optional(),
  statutory: statutoryDetailsSchema.optional(),
});

export type PersonalDetailsInput = z.infer<typeof personalDetailsSchema>;
export type EmploymentDetailsInput = z.infer<typeof employmentDetailsSchema>;
export type DepartmentInput = z.infer<typeof departmentSchema>;
export type CompensationInput = z.infer<typeof compensationSchema>;
export type BankDetailsInput = z.infer<typeof bankDetailsSchema>;
export type StatutoryDetailsInput = z.infer<typeof statutoryDetailsSchema>;
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
