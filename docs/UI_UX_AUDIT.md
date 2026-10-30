# UI/UX Theme Audit & Design System Standardization Report
**Haryak Technologies India Private Limited — Enterprise Operations Platform**  
**Audit Date:** October 2026  
**Auditor / Architect:** Senior UI/UX Designer & Frontend Architect  
**Branch:** `ui-theme-standardization`  
**Status:** Audit & Implementation Completed

---

## 1. Executive Summary

A comprehensive design system, UI/UX audit, and standardization pass was conducted across the entire **Haryak Technologies India Private Limited Enterprise Operations Platform**.

### Key Architectural Findings:
1. **The Calendar Module is NOT Theme-Divergent:**  
   Initial suspicions suggested the Calendar module might have a distinct theme or external conflicting stylesheet. Deep inspection of both `src/app/(dashboard)/calendar/page.tsx` (1,532 lines) and `src/app/portal/company-calendar/page.tsx` (867 lines) proved that **neither page imports third-party calendar libraries** (no FullCalendar, react-calendar, date-fns CSS, or react-day-picker CSS). Both render native custom CSS grids utilizing the application's shared `globals.css` and the Google `Inter` font. The admin calendar actually implemented some of the highest-quality component patterns (such as `MetricCard` with brand-tinted square icon containers).
2. **Real Inconsistencies Discovered and Resolved:**
   - **Sidebar Color & Item Inconsistency:** The Admin Dashboard sidebar utilized corporate brand navy `#1e2a78` (`w-64` / `w-[72px]`), whereas the Employee Portal sidebar utilized a mismatched lighter blue `#1e3a8a` (`w-64` / `w-[70px]`) with larger icons and unaligned active states.
   - **KPI Card Divergence:** The global `StatCard` used circular icon containers (`rounded-full`) with generic Tailwind blues (`bg-blue-50 text-blue-600`), while the Calendar's `MetricCard` used modern rounded squares (`rounded-xl`) with brand navy tinting (`bg-[#1e2a78]/8 text-[#1e2a78]`).
   - **PageHeader Scaling:** The shared `PageHeader` component used `text-3xl font-bold`, which caused disproportionate spacing in information-dense ERP table views compared to the rest of the application.
   - **Native `<select>` HTML Elements:** Six distinct modules and forms used raw unstyled or minimally styled native browser `<select>` elements instead of the design system's Radix-powered accessible shadcn/ui `<Select>` component.
   - **Custom Fixed-Position Modal:** The Approvals page implemented an ad-hoc custom `fixed inset-0 z-50 flex items-center justify-center bg-black/50` modal for rejection and correction reasons instead of the standardized shadcn/ui `<Dialog>` component.
   - **Table Header Opacity Inconsistency:** Table headers (`<thead>` and `TableHeader`) had erratic background opacities (`bg-muted/70`, `bg-muted/50`, `bg-muted/40`, `bg-muted/20`, `bg-muted/10`), creating disjointed contrasts across pages.
   - **Accent & Loading Spinner Variations:** Several pages used `text-blue-600` or `text-blue-700` for loading spinners and section icons instead of the corporate brand color `#1e2a78`.

---

## 2. Reference Corporate Design Tokens

The visual language is anchored in the Haryak corporate brand identity:
- **Primary Navy / Brand Navy:** `#1e2a78` (Tailwind arbitrary hex) / `oklch(0.35 0.12 260)` (`--primary`)
- **Primary Hover:** `#152060` / `#16205f`
- **Sidebar Surface:** `#1e2a78` with `bg-black/10` footer and `bg-white/15` active indicators
- **Surfaces & Cards:** `bg-card` (`oklch(1 0 0)` light, `oklch(0.20 0.03 260)` dark), `border-border`, `shadow-sm`
- **Icon Container Badges:** `h-9 w-9` or `h-10 w-10` `rounded-xl bg-[#1e2a78]/8 text-[#1e2a78] dark:bg-blue-950/30 dark:text-blue-300`
- **Table Headers:** `border-b bg-muted/30 text-muted-foreground uppercase text-[10px]` or `text-[11px] font-semibold tracking-wider`
- **Table Row Hover:** `hover:bg-muted/20` or `hover:bg-muted/25 transition-colors`
- **Primary Actions:** `bg-[#1e2a78] text-white hover:bg-[#16205f] shadow-sm font-semibold`
- **Typography:** `Inter` font family loaded globally in root layout (`src/app/layout.tsx`)

---

## 3. Detailed Page & Module Audit Matrix

| Route / Module | Current Styling Prior to Fix | Inconsistency Detected | Root Cause | Correction Applied | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Portal Shell** (`src/app/portal/layout.tsx`) | `bg-[#1e3a8a]`, `w-[70px]`, `h-5` icons | Color mismatch with admin sidebar (`#1e2a78`), icon scale differences, missing `bg-black/10` user footer | Divergent portal implementation created separately | Standardized to `bg-[#1e2a78]`, `w-[72px]`, `h-4` icons, `rounded-lg`, `bg-white/15` active state, and matched footer | **Verified** |
| **StatCard Component** (`src/components/shared/stat-card.tsx`) | `rounded-full`, `bg-blue-50`, `text-blue-600` | Circular badge with generic blue contradicted Calendar MetricCard | Early starter template styling | Standardized to `rounded-xl bg-[#1e2a78]/8 text-[#1e2a78] dark:bg-blue-950/30 dark:text-blue-300` with `transition-shadow hover:shadow-md` | **Verified** |
| **PageHeader Component** (`src/components/shared/page-header.tsx`) | `text-3xl font-bold tracking-tight` | Header title was disproportionately large for dense enterprise pages | Static heading scale | Standardized title to `text-2xl font-bold` and added `text-sm` constraint to subtitle | **Verified** |
| **Approvals Page** (`src/app/(dashboard)/approvals/page.tsx`) | Custom `fixed inset-0 bg-black/50` modal; `bg-muted/50` table header | Non-standard dialog markup; dark table header | Handcrafted modal backdrop before shared Dialog was adopted | Replaced with shadcn `<Dialog>`, `<DialogContent>`, `<DialogHeader>`, `<DialogTitle>`, `<DialogFooter>`; standardized thead to `bg-muted/30` | **Verified** |
| **Employees Directory** (`src/app/(dashboard)/employees/page.tsx`) | Native HTML `<select>` for status filter; syntax bug in notice badge; `bg-muted/50` thead | Inconsistent input styling; classname concatenation bug (`dark:text-orange-300border-orange-200`) | Native element used in filter bar | Replaced with shadcn `<Select>`; corrected badge whitespace bug; standardized thead to `bg-muted/30` | **Verified** |
| **New Employee Wizard** (`src/app/(dashboard)/employees/new/page.tsx`) | Reusable `SelectField` helper used native HTML `<select>` | All employee onboarding dropdowns bypassed shadcn design tokens | Helper was written with native `<select>` | Standardized `SelectField` to wrap shadcn/ui `<Select>`, upgrading all 6 wizard selects | **Verified** |
| **Employee Detail** (`src/app/(dashboard)/employees/[id]/page.tsx`) | `text-blue-700` icons; `bg-muted/40` salary table header; plain MetricCard | Icons mismatched brand navy; thead opacity mismatch | Inconsistent local styling | Replaced `text-blue-700` with `text-[#1e2a78] dark:text-blue-400`; updated MetricCard with `rounded-xl` brand badge; updated thead to `bg-muted/30` | **Verified** |
| **Document Center** (`src/app/(dashboard)/documents/page.tsx`) | 3 native `<select>` in filter bar + 2 native `<select>` in letter generation form; `bg-muted/40` thead | Inconsistent select controls across document filters and modal; mismatched header background | Native select tags used | Replaced all 5 selects with shadcn `<Select>` (utilizing `<SelectGroup>` and `<SelectLabel>`); standardized thead to `bg-muted/30` | **Verified** |
| **Document Compliance Matrix** (`src/components/documents/document-compliance-matrix.tsx`) | Native `<select>` for department filter; `bg-muted/40` thead | Inconsistent select element; table header opacity | Native select tag used | Replaced with shadcn `<Select>`; standardized thead to `bg-muted/30` | **Verified** |
| **Document Upload Dialog** (`src/components/documents/document-upload-dialog.tsx`) | Native `<select>` for employee and document category | Upload modal did not match shared Select design tokens | Native select tags used | Replaced both selects with shadcn `<Select>` with hierarchical category groups | **Verified** |
| **Document Details Dialog** (`src/components/documents/document-details-dialog.tsx`) | Version table thead used `bg-muted/40` | Minor table header opacity divergence | Inconsistent opacity | Standardized to `bg-muted/30 border-b` with uppercase tracking | **Verified** |
| **Settings Page** (`src/app/(dashboard)/settings/page.tsx`) | Native `<select>` for automated payslip release rule | Dropdown styling differed from other form controls | Native select tag used | Replaced with shadcn `<Select>` | **Verified** |
| **Announcements Page** (`src/app/(dashboard)/announcements/page.tsx`) | Native `<select>` for announcement category | Modal dropdown differed from design system | Native select tag used | Replaced with shadcn `<Select>` | **Verified** |
| **Audit Logs Page** (`src/app/(dashboard)/audit/page.tsx`) | Native `<select>` for action filter; `bg-muted/50` thead | Inconsistent dropdown and dark header | Native select tag used | Replaced with shadcn `<Select>`; standardized thead to `bg-muted/30` | **Verified** |
| **Notifications Page** (`src/app/(dashboard)/notifications/page.tsx`) | Raw Tailwind gray tokens (`text-gray-900`, `text-gray-500`, `border-gray-200`, `bg-white`) | Completely bypassed semantic design system tokens; broke dark mode | Standalone prototype screen | Refactored to use `PageHeader`, `Card`, `Button`, and semantic tokens (`text-foreground`, `text-muted-foreground`, `border-border`, brand navy badge) | **Verified** |
| **Timesheets Admin** (`src/app/(dashboard)/timesheets/page.tsx`) | Native `<select>` for month and year; `bg-muted/50` thead | Filter dropdowns and table headers diverged from design tokens | Native select tags used | Replaced with shadcn `<Select>`; standardized thead to `bg-muted/30` | **Verified** |
| **Attendance Admin** (`src/app/(dashboard)/attendance/page.tsx`) | `bg-muted/50` table header | Table header opacity mismatch | Inconsistent opacity | Standardized thead to `bg-muted/30` | **Verified** |
| **Compensation Admin** (`src/app/(dashboard)/compensation/page.tsx`) | `bg-muted/50` table header | Table header opacity mismatch | Inconsistent opacity | Standardized thead to `bg-muted/30` | **Verified** |
| **Leave Admin** (`src/app/(dashboard)/leave/page.tsx`) | `bg-muted/50` table header | Table header opacity mismatch | Inconsistent opacity | Standardized thead to `bg-muted/30` | **Verified** |
| **Organization Admin** (`src/app/(dashboard)/organization/page.tsx`) | `bg-muted/50` thead on departments & designations tables | Table header opacity mismatch | Inconsistent opacity | Standardized both theads to `bg-muted/30` | **Verified** |
| **Payroll Run** (`src/app/(dashboard)/payroll/run/page.tsx`) | Heavy `bg-muted/70` table header | Excessively dark contrast on employee payroll grid | Outdated token | Standardized thead to `bg-muted/30` | **Verified** |
| **Payslips Admin** (`src/app/(dashboard)/payslips/page.tsx`) | `bg-muted/50` table header | Table header opacity mismatch | Inconsistent opacity | Standardized thead to `bg-muted/30` | **Verified** |
| **Forgot Password** (`src/app/(auth)/forgot-password/page.tsx`) | Eyebrow text used `text-blue-800` | Accent color variation | Local Tailwind class | Standardized to `text-[#1e2a78] dark:text-blue-400` | **Verified** |
| **Portal Help** (`src/app/portal/help/page.tsx`) | `Loader2` spinner used `text-blue-600` | Spinner color variation | Local Tailwind class | Standardized to `text-[#1e2a78]` | **Verified** |
| **Portal Leaves** (`src/app/portal/my-leaves/page.tsx`) | Native `<select>` for leave category | Apply modal used native browser select | Native select tag used | Replaced with shadcn `<Select>` | **Verified** |
| **Portal Payslips** (`src/app/portal/my-payslips/page.tsx`) | `bg-muted/50` table header | Table header opacity mismatch | Inconsistent opacity | Standardized thead to `bg-muted/30` | **Verified** |
| **Portal Documents** (`src/app/portal/my-documents/page.tsx`) | `bg-muted/40` on 3 table views | Table header opacity mismatch | Inconsistent opacity | Standardized all 3 theads to `bg-muted/30` | **Verified** |
| **Portal Attendance** (`src/app/portal/my-attendance/page.tsx`) | `Loader2` used `text-blue-600`; `bg-muted/50` thead | Spinner and header opacity mismatch | Inconsistent classes | Standardized spinner to `text-[#1e2a78]` and thead to `bg-muted/30` | **Verified** |
| **Portal Salary** (`src/app/portal/my-salary/page.tsx`) | `bg-muted/50` TableHeader | Table header opacity mismatch | Inconsistent opacity | Standardized TableHeader to `bg-muted/30` | **Verified** |
| **Portal Timesheet** (`src/app/portal/timesheet/page.tsx`) | `bg-muted/40` table header | Table header opacity mismatch | Inconsistent opacity | Standardized thead to `border-b bg-muted/30` | **Verified** |
| **Portal Calendar** (`src/app/portal/company-calendar/page.tsx`) | `bg-muted/40` table header | Table header opacity mismatch | Inconsistent opacity | Standardized thead to `border-b bg-muted/30` | **Verified** |
| **Admin Calendar** (`src/app/(dashboard)/calendar/page.tsx`) | Verified fully conforming (`bg-[#1e2a78]`, Inter font, `bg-muted/30` directory header, MetricCard pattern) | None (strong benchmark) | N/A (benchmark pattern) | Preserved intact without unnecessary changes | **Verified** |

---

## 4. Accessible Route Inventory

All 45 identified application routes were inspected and mapped:

### Authentication Routes (5)
- `/login` (`src/app/(auth)/login/page.tsx`)
- `/forgot-password` (`src/app/(auth)/forgot-password/page.tsx`)
- `/first-login/admin-security` (`src/app/(auth)/first-login/admin-security/page.tsx`)
- `/first-login/change-credentials` (`src/app/(auth)/first-login/change-credentials/page.tsx`)
- `/first-login/change-password` (`src/app/(auth)/first-login/change-password/page.tsx`)

### Admin & Operations Routes (22)
- `/dashboard` (`src/app/(dashboard)/dashboard/page.tsx`)
- `/calendar` (`src/app/(dashboard)/calendar/page.tsx`)
- `/employees` (`src/app/(dashboard)/employees/page.tsx`)
- `/employees/new` (`src/app/(dashboard)/employees/new/page.tsx`)
- `/employees/[id]` (`src/app/(dashboard)/employees/[id]/page.tsx`)
- `/approvals` (`src/app/(dashboard)/approvals/page.tsx`)
- `/attendance` (`src/app/(dashboard)/attendance/page.tsx`)
- `/timesheets` (`src/app/(dashboard)/timesheets/page.tsx`)
- `/leave` (`src/app/(dashboard)/leave/page.tsx`)
- `/payroll` (`src/app/(dashboard)/payroll/page.tsx`)
- `/payroll/run` (`src/app/(dashboard)/payroll/run/page.tsx`)
- `/payslips` (`src/app/(dashboard)/payslips/page.tsx`)
- `/payslips/[id]` (`src/app/(dashboard)/payslips/[id]/page.tsx`)
- `/compensation` (`src/app/(dashboard)/compensation/page.tsx`)
- `/documents` (`src/app/(dashboard)/documents/page.tsx`)
- `/announcements` (`src/app/(dashboard)/announcements/page.tsx`)
- `/messages` (`src/app/(dashboard)/messages/page.tsx`)
- `/notifications` (`src/app/(dashboard)/notifications/page.tsx`)
- `/reports` (`src/app/(dashboard)/reports/page.tsx`)
- `/organization` (`src/app/(dashboard)/organization/page.tsx`)
- `/audit` (`src/app/(dashboard)/audit/page.tsx`)
- `/settings` (`src/app/(dashboard)/settings/page.tsx`)

### Employee Portal Routes (14)
- `/portal/home` (`src/app/portal/home/page.tsx`)
- `/portal/dashboard` (`src/app/portal/dashboard/page.tsx`)
- `/portal/my-profile` (`src/app/portal/my-profile/page.tsx`)
- `/portal/my-attendance` (`src/app/portal/my-attendance/page.tsx`)
- `/portal/timesheet` (`src/app/portal/timesheet/page.tsx`)
- `/portal/my-leaves` (`src/app/portal/my-leaves/page.tsx`)
- `/portal/my-payslips` (`src/app/portal/my-payslips/page.tsx`)
- `/portal/my-salary` (`src/app/portal/my-salary/page.tsx`)
- `/portal/my-documents` (`src/app/portal/my-documents/page.tsx`)
- `/portal/announcements` (`src/app/portal/announcements/page.tsx`)
- `/portal/company-calendar` (`src/app/portal/company-calendar/page.tsx`)
- `/portal/messages` (`src/app/portal/messages/page.tsx`)
- `/portal/help` (`src/app/portal/help/page.tsx`)
- `/portal/change-password` (`src/app/portal/change-password/page.tsx`)

### Other Routes (4)
- `/` (`src/app/page.tsx`)
- `/admin/dashboard` (`src/app/admin/dashboard/page.tsx`)
- `/admin/payroll` (`src/app/admin/payroll/page.tsx`)
- `/payslips/[id]/print` (`src/app/payslips/[id]/print/page.tsx`)
