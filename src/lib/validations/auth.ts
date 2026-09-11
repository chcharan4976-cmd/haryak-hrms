import * as z from 'zod';

export const passwordComplexityRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^_-])[A-Za-z\d@$!%*?&#^_-]{8,}$/;

export const loginSchema = z.object({
  identifier: z.string().min(1, 'Please enter your login credential').trim(),
  password: z.string().min(1, 'Password is required'),
  mode: z.enum(['ADMIN', 'EMPLOYEE']),
  rememberMe: z.boolean().optional(),
});

export const forgotPasswordSchema = z.object({
  identifier: z.string().min(1, 'Employee ID or Company Email is required').trim(),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters long')
    .regex(passwordComplexityRegex, 'Password must include uppercase, lowercase, number, and special character'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export const adminFirstLoginSchema = z.object({
  currentPassword: z.string().min(1, 'Current temporary password is required'),
  newEmail: z.string().email('Please enter a valid official email address'),
  confirmNewEmail: z.string().email('Please confirm your new email address'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters long')
    .regex(passwordComplexityRegex, 'Password must include uppercase, lowercase, number, and special character'),
  confirmNewPassword: z.string(),
}).refine((data) => data.newEmail === data.confirmNewEmail, {
  message: "Email addresses do not match",
  path: ["confirmNewEmail"],
}).refine((data) => data.newPassword === data.confirmNewPassword, {
  message: "Passwords do not match",
  path: ["confirmNewPassword"],
}).refine((data) => data.currentPassword !== data.newPassword, {
  message: "New password must be different from current password",
  path: ["newPassword"],
});

export const employeeFirstLoginSchema = z.object({
  currentPassword: z.string().min(1, 'Temporary password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters long')
    .regex(passwordComplexityRegex, 'Password must include uppercase, lowercase, number, and special character'),
  confirmNewPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmNewPassword, {
  message: "Passwords do not match",
  path: ["confirmNewPassword"],
}).refine((data) => data.currentPassword !== data.newPassword, {
  message: "New password must be different from temporary password",
  path: ["newPassword"],
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters long')
    .regex(passwordComplexityRegex, 'Password must include uppercase, lowercase, number, and special character'),
  confirmNewPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmNewPassword, {
  message: "Passwords do not match",
  path: ["confirmNewPassword"],
});

export const changeEmailSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required to change email'),
  newEmail: z.string().email('Invalid email address'),
  confirmNewEmail: z.string().email('Invalid email address'),
}).refine((data) => data.newEmail === data.confirmNewEmail, {
  message: "Email addresses do not match",
  path: ["confirmNewEmail"],
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type AdminFirstLoginInput = z.infer<typeof adminFirstLoginSchema>;
export type EmployeeFirstLoginInput = z.infer<typeof employeeFirstLoginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
