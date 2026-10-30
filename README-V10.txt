HARYAK CHAT V10 — CORRECT DIRECT-CHAT IDENTITY + PROFILE

Built on V9.

Fixes:
1. Direct chat title is now calculated from the OTHER participant.
   - Admin sees employee name.
   - Employee sees administrator/other participant name.
   - The stored conversation title is only a fallback.
2. Direct chat avatar initials also use the other participant's display name.
3. Clicking the direct-chat header name or avatar opens a premium profile dialog.
4. For linked employees, the profile uses the existing safe chat directory endpoint and shows:
   Employee ID, full name, designation, department, official email.
5. For administrator/non-employee participants, the dialog shows only verified participant
   name/role available in chat data and does not fabricate employee fields.
6. V9 native desktop notifications/sound and V8 request-storm protection are retained.

Security:
The profile reuses the safe employee directory projection. It does not expose salary,
CTC, bank details, PAN, UAN, personal address, or other payroll/private fields.

Apply the included src files, then:
npm run build
