# Changes — ProOblik accounting rulebook (2026-11-21)

Files changed: `netlify/functions/api.js`, `public/index.html`, `public/forms.js`, `public/app2.js`, `public/app5.js`, `public/theme.css`, `schema.sql`, `package.json`.

New: `netlify/functions/rule-engine.js`, `netlify/functions/report-codes.js`, `netlify/functions/report-defaults.js`, `public/rulebook.js`, `accounting_rulebook_migration.sql`, `ACCOUNTING_RULEBOOK_GUIDE.md`, `tests/rule_engine.test.mjs`.

- Restricted superadmin rule management, persisted DB role verified.
- Drafts, server-side preview, date-effective immutable rule versions, audit log.
- Posting correspondence overrides in automatic documents, payroll, payroll payments, financial closing.
- Provenance via `entries.posting_rule_version_id` and payment instruction version.
- Financial reporting overrides by form and date, multiple account prefixes/terms, formulas from other rows.
- Diagnostic page and default 1420 formula corrected to account 44 (without double-counting 79 and open P&L).
- Security: declarative grammar only, no arbitrary JavaScript/SQL evaluation.

Known limitations:
- This is a *correspondence mapping* for existing generated posting lines, NOT a full replacement for all source-level amount formulas.
- Existing historical PDF/XLSX snapshots and posted entries are not rewritten. Re-generating a past report with corrected **built-in** formula 1420 may yield a corrected result.
- Rulebook only covers financial Forms №1/№2, not every report.
- Tests were unit + browser mock; NO production Neon integration test.
- Source ZIP in this turn is not necessarily the more recent inventory/pricing build; apply only after comparing versions.
- Fonts from user-provided archive are deliberately excluded from deliverable; preserve existing `public/fonts/` in GitHub.
