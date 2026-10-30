# UI/UX Theme Standardization Changelog
**Haryak Technologies India Private Limited — Enterprise Operations Platform**  
**Branch:** `ui-theme-standardization`  
**Base Commit:** `1202fe1 Pre-UI-audit baseline: preserve current state before theme standardization`

---

## Summary of Changes

Every change in this release was made within the existing Next.js, React 19, and Tailwind CSS v4 architecture without adding third-party dependencies or altering backend business logic, authorization rules, or API schemas.

---

## Modified Files and Details

### 1. `src/app/portal/layout.tsx` (Portal Shell & Sidebar)
- **Problem:** Portal sidebar was colored with mismatched `#1e3a8a` (blue-800) instead of the brand navy `#1e2a78`, used `w-[70px]` when collapsed (vs `w-[72px]`), had larger `h-5` nav icons, lacked the `bg-black/10` profile footer styling, and had differing active button states.
- **Changes:**
  - Aligned sidebar background to `bg-[#1e2a78]`.
  - Updated collapsed width to `w-[72px]`.
  - Standardized navigation links to `text-xs font-medium rounded-lg` with `h-4 w-4` icons.
  - Aligned active state indicator to `bg-white/15 text-white shadow-sm font-semibold`.
  - Standardized user profile footer with `p-3 border-t border-white/10 shrink-0 bg-black/10`, `h-8 w-8` avatar with `bg-white/20` fallback, and consistent typography.

### 2. `src/components/shared/stat-card.tsx` (Shared KPI Component)
- **Problem:** Circular `rounded-full` icon badge with generic `bg-blue-50 text-blue-600` styling contradicted the corporate `rounded-xl` brand badge established by Calendar's `MetricCard`.
- **Changes:**
  - Changed icon badge container to `rounded-xl bg-[#1e2a78]/8 text-[#1e2a78] dark:bg-blue-950/30 dark:text-blue-300`.
  - Added `shadow-sm transition-shadow hover:shadow-md` to the card wrapper for subtle interactive elevation.

### 3. `src/components/shared/page-header.tsx` (Shared Header Component)
- **Problem:** `text-3xl font-bold tracking-tight` was visually overpowering on high-density data tables and administrative forms.
- **Changes:**
  - Standardized title font size to `text-2xl font-bold tracking-tight`.
  - Added `text-sm text-muted-foreground mt-1` to the description.

### 4. `src/app/(dashboard)/approvals/page.tsx` (Approvals Workflow)
- **Problem:** Rejection/return modal was an ad-hoc custom `fixed inset-0 z-50 flex items-center justify-center bg-black/50` overlay; table header used `border-b bg-muted/50`.
- **Changes:**
  - Replaced custom fixed modal with shadcn/ui `<Dialog>`, `<DialogContent>`, `<DialogHeader>`, `<DialogTitle>`, `<DialogDescription>`, `<DialogFooter>`, and `<Label>`.
  - Standardized table header to `border-b bg-muted/30 text-[10px] font-semibold uppercase text-muted-foreground tracking-wider`.

### 5. `src/app/(dashboard)/employees/page.tsx` (Employee Directory)
- **Problem:** Status filter used native HTML `<select>`; notice status badge had a classname concatenation bug (`dark:text-orange-300border-orange-200`); table header used `bg-muted/50`.
- **Changes:**
  - Replaced native `<select>` with accessible shadcn/ui `<Select>`, `<SelectContent>`, `<SelectItem>`, `<SelectTrigger>`, `<SelectValue>`.
  - Fixed badge space delimiter to `dark:text-orange-300 border-orange-200`.
  - Standardized table header to `bg-muted/30 border-b text-muted-foreground uppercase font-semibold text-[10px] tracking-wider`.

### 6. `src/app/(dashboard)/employees/new/page.tsx` (Employee Creation Wizard)
- **Problem:** Reusable helper `SelectField` rendered a native HTML `<select>` element, causing all dropdowns in the onboarding wizard to bypass design tokens.
- **Changes:**
  - Refactored `SelectField` to wrap shadcn/ui `<Select>`, standardizing Gender, Marital Status, Department, Designation, Employment Status, and Employment Type fields.

### 7. `src/app/(dashboard)/employees/[id]/page.tsx` (Employee Profile Details)
- **Problem:** Tab section icons used hardcoded `text-blue-700`; local `MetricCard` used non-standard plain card; salary components table header used `bg-muted/40`.
- **Changes:**
  - Aligned tab section icons (`CircleUserRound`, `BriefcaseBusiness`, `FileText`) to `text-[#1e2a78] dark:text-blue-400`.
  - Updated local `MetricCard` to use `rounded-xl bg-[#1e2a78]/8 text-[#1e2a78]` icon badge and `shadow-sm hover:shadow-md`.
  - Standardized salary components table header to `border-b bg-muted/30 text-left text-xs text-muted-foreground uppercase text-[10px] tracking-wider font-semibold`.

### 8. `src/app/(dashboard)/documents/page.tsx` (Document Repository & Letters)
- **Problem:** Filter bar used 3 native `<select>` tags (Category, Status, Expiry); official letter generator used 2 native `<select>` tags (Employee, Document Type, Signatory); table headers used `border-b bg-muted/40`.
- **Changes:**
  - Upgraded all 5 selects to shadcn/ui `<Select>`, with `<SelectGroup>` and `<SelectLabel>` for grouped categories.
  - Standardized repository and issued letters table headers to `border-b bg-muted/30 font-semibold text-muted-foreground uppercase text-[10px] tracking-wider`.

### 9. `src/components/documents/document-compliance-matrix.tsx` (Compliance Matrix)
- **Problem:** Department filter used native `<select>`; table header used `border-b bg-muted/40`.
- **Changes:**
  - Replaced department dropdown with shadcn/ui `<Select>`.
  - Standardized thead to `border-b bg-muted/30 font-semibold text-muted-foreground uppercase text-[10px] tracking-wider`.

### 10. `src/components/documents/document-upload-dialog.tsx` (Document Upload Dialog)
- **Problem:** Employee association and category dropdowns used native `<select>` elements.
- **Changes:**
  - Replaced both dropdowns with shadcn/ui `<Select>` with grouped category options.

### 11. `src/components/documents/document-details-dialog.tsx` (Document Details)
- **Problem:** Version history table header used `bg-muted/40 border-b`.
- **Changes:**
  - Standardized thead to `bg-muted/30 border-b font-semibold text-muted-foreground uppercase text-[10px] tracking-wider`.

### 12. `src/app/(dashboard)/settings/page.tsx` (System Settings)
- **Problem:** Automated payslip release rule used native HTML `<select>`.
- **Changes:**
  - Replaced with shadcn/ui `<Select>` component with predefined release options.

### 13. `src/app/(dashboard)/announcements/page.tsx` (Announcements)
- **Problem:** Category dropdown in Create Announcement dialog used native `<select>`.
- **Changes:**
  - Replaced with shadcn/ui `<Select>` component.

### 14. `src/app/(dashboard)/audit/page.tsx` (Audit Trail)
- **Problem:** Action filter used native `<select>`; audit log table header used `bg-muted/50 border-b`.
- **Changes:**
  - Replaced action filter with shadcn/ui `<Select>`.
  - Standardized table header to `bg-muted/30 border-b text-muted-foreground uppercase font-semibold text-[10px] tracking-wider`.

### 15. `src/app/(dashboard)/notifications/page.tsx` (Notifications View)
- **Problem:** Hardcoded raw Tailwind gray tokens (`text-gray-900`, `text-gray-500`, `border-gray-200`, `bg-white`) that bypassed design system tokens and broke dark mode.
- **Changes:**
  - Refactored page structure with `PageHeader`, `Card`, and `Button`.
  - Standardized colors to `text-foreground`, `text-muted-foreground`, `border-border`, and brand navy notification badge.

### 16. `src/app/(dashboard)/timesheets/page.tsx` (Timesheet Operations)
- **Problem:** Month and year filters used native `<select>`; table row headers used `bg-muted/50`.
- **Changes:**
  - Replaced month and year pickers with shadcn/ui `<Select>` components.
  - Standardized table row headers to `border-b bg-muted/30`.

### 17. `src/app/(dashboard)/attendance/page.tsx` (Attendance Management)
- **Problem:** Table header used `bg-muted/50 border-b`.
- **Changes:**
  - Standardized to `bg-muted/30 border-b text-muted-foreground uppercase font-semibold text-[10px] tracking-wider`.

### 18. `src/app/(dashboard)/compensation/page.tsx` (Compensation Structures)
- **Problem:** Table header used `bg-muted/50 border-b text-[10px]`.
- **Changes:**
  - Standardized to `bg-muted/30 border-b text-muted-foreground uppercase font-semibold text-[10px] tracking-wider`.

### 19. `src/app/(dashboard)/leave/page.tsx` (Leave Operations)
- **Problem:** Table header used `bg-muted/50 border-b text-[10px]`.
- **Changes:**
  - Standardized to `bg-muted/30 border-b text-muted-foreground uppercase font-semibold text-[10px] tracking-wider`.

### 20. `src/app/(dashboard)/organization/page.tsx` (Departments & Designations)
- **Problem:** Departments and designations tables used `bg-muted/50 border-b text-[10px]`.
- **Changes:**
  - Standardized both table headers to `bg-muted/30 border-b text-muted-foreground uppercase font-semibold text-[10px] tracking-wider`.

### 21. `src/app/(dashboard)/payroll/run/page.tsx` (Payroll Execution Grid)
- **Problem:** Heavy `bg-muted/70` table header created disproportionately dark contrast.
- **Changes:**
  - Standardized table header to `border-b bg-muted/30 text-left text-muted-foreground`.

### 22. `src/app/(dashboard)/payslips/page.tsx` (Payslips Directory)
- **Problem:** Table header used `bg-muted/50 border-b`.
- **Changes:**
  - Standardized to `bg-muted/30 border-b text-muted-foreground uppercase font-semibold text-[10px] tracking-wider`.

### 23. `src/app/(auth)/forgot-password/page.tsx` (Account Recovery)
- **Problem:** Eyebrow label used `text-blue-800`.
- **Changes:**
  - Standardized to brand navy `text-[#1e2a78] dark:text-blue-400`.

### 24. `src/app/portal/help/page.tsx` (Employee Helpdesk)
- **Problem:** Loading spinner used `text-blue-600`.
- **Changes:**
  - Standardized spinner to brand navy `text-[#1e2a78]`.

### 25. `src/app/portal/my-leaves/page.tsx` (Employee Leave Application)
- **Problem:** Leave category select used native `<select>`.
- **Changes:**
  - Replaced with shadcn/ui `<Select>` component.

### 26. `src/app/portal/my-payslips/page.tsx` (Employee Payslips)
- **Problem:** Table header used `bg-muted/50 border-b`.
- **Changes:**
  - Standardized to `bg-muted/30 border-b text-muted-foreground uppercase font-semibold text-[10px] tracking-wider`.

### 27. `src/app/portal/my-documents/page.tsx` (Employee Documents)
- **Problem:** 3 table headers used `border-b bg-muted/40`.
- **Changes:**
  - Standardized all 3 table headers to `border-b bg-muted/30 font-semibold text-muted-foreground uppercase text-[10px] tracking-wider`.

### 28. `src/app/portal/my-attendance/page.tsx` (Employee Punch Log)
- **Problem:** Spinner used `text-blue-600`; TableHeader used `bg-muted/50`.
- **Changes:**
  - Standardized spinner to `text-[#1e2a78]` and TableHeader to `bg-muted/30 text-[10px] uppercase tracking-wider`.

### 29. `src/app/portal/my-salary/page.tsx` (Employee Salary Breakdown)
- **Problem:** TableHeader used `bg-muted/50`.
- **Changes:**
  - Standardized TableHeader to `bg-muted/30 text-[10px] uppercase tracking-wider`.

### 30. `src/app/portal/timesheet/page.tsx` (Employee Timesheet Entry)
- **Problem:** Table header used `bg-muted/40`.
- **Changes:**
  - Standardized to `border-b bg-muted/30`.

### 31. `src/app/portal/company-calendar/page.tsx` (Portal Holiday Calendar)
- **Problem:** Holiday table header used `bg-muted/40`.
- **Changes:**
  - Standardized to `border-b bg-muted/30`.
