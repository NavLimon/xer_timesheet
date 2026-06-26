# Agent Log

## Session Information

- Date: 2026-06-26
- Objective: Extend the existing Xero Timesheet prototype into a Payroll Configuration Module without rebuilding the app.
- Feature being implemented: Payroll configuration foundations, Xero sync, employee mapping, earnings configuration, validation, review, and audit logging.

## Architecture Review

### Files Inspected

- `package.json`
- `README.md`
- `src/server.js`
- `src/config.js`
- `src/lib/dates.js`
- `src/services/store.js`
- `src/services/xero.js`
- `src/views/layout.ejs`
- `src/views/dashboard.ejs`
- `src/views/staff.ejs`
- `src/views/profiles.ejs`
- `src/views/timesheets.ejs`
- `src/views/timesheet-form.ejs`
- `src/views/timesheet-detail.ejs`
- `src/views/not-found.ejs`
- `public/styles.css`
- `data/db.json`

### Current Architecture

- Folder structure: small Express application with `src/server.js` as the route/controller layer, `src/services` for persistence and Xero integration, `src/views` for EJS templates, `src/lib` for date utilities, `public/styles.css` for the design system, and `data/db.json` as the JSON DB.
- Component hierarchy: EJS layout wraps page-level views. There are no reusable partials yet; screens reuse shared CSS classes such as `page-title`, `panel`, `table-wrap`, `button`, `notice`, `pill`, and `cards`.
- Service hierarchy: `store.js` owns local JSON persistence for `staff` and `timesheets`; `xero.js` owns token management, Payroll AU reads, and Payroll AU v2 timesheet publishing.
- JSON DB architecture: single `data/db.json` object with top-level arrays. `store.js` creates missing DB file, reads and writes the whole object, and uses UUIDs for local IDs.
- Existing Xero integration flow: `xero.js` creates a Custom Connection `XeroClient`, fetches client credentials tokens, syncs access tokens into the generated Payroll AU v2 API client, and calls Payroll AU endpoints.
- Existing timesheet submission flow: routes create local weekly timesheets, then `POST /timesheets/:id/publish` calls `xero.publishTimesheet(staff, timesheet)` and marks the local record `Published`.

### Existing Strengths

- Small and understandable architecture with clear service boundaries.
- Xero integration is isolated in `src/services/xero.js`.
- JSON DB persistence is isolated in `src/services/store.js`.
- The current UI is consistent and easy to extend with cards, tables, notices, and panels.
- Existing timesheet publish path stores Xero response details for traceability.

### Potential Risks

- `store.js` sorts arrays returned from DB in place, which can reorder persisted arrays after later writes.
- Existing timesheets can duplicate employee/week combinations; validation must catch published duplicates before submitting.
- Timesheet days currently contain hours only, not earning categories, so category resolution must be inferred unless the form is later expanded.
- Xero Custom Connections may not have Accounting API scopes, so organisation display should not depend on Accounting `getOrganisations`.
- Existing `staff` records already contain Xero fields; new mapping storage must remain backwards compatible with that shape.
- The app has no automated test script, so verification is limited to syntax checks and manual HTTP checks unless tests are added later.

### Recommended Extension Points

- Extend `store.js` with new top-level collections in the existing `data/db.json` convention.
- Add focused services under `src/services` for sync, mapping, validation, and submission orchestration.
- Keep Xero SDK calls in `xero.js`; expose additional read methods rather than calling SDKs from route handlers.
- Add payroll admin routes under `/payroll/*` in `src/server.js`.
- Reuse existing EJS/CSS conventions for settings, mapping, and review screens.
- Keep legacy `staff` fields populated so the existing publish workflow and profile screens continue to work.

### Refactoring Opportunities

- Move route groups out of `src/server.js` if the module grows further.
- Add reusable EJS partials for status badges, validation reports, and select controls.
- Add a proper test harness around `store.js`, mapping resolution, and validation.
- Add local authentication/authorisation before using audit `user` values beyond the prototype default.

## Implementation Plan

### Milestone 1 - Persistence and Audit Foundations

- Extend the JSON DB schema with Xero sync data, employee mappings, position mappings, employee overrides, sync logs, submission logs, audit logs, and sync metadata.
- Add safe read/write helper methods in `store.js`.
- Add audit log writing that can be reused by all payroll services.
- Independently testable by loading the app and verifying `data/db.json` migrations are non-destructive.

### Milestone 2 - Xero Synchronisation

- Extend `xero.js` to expose reusable payroll reads and a connection test.
- Add a sync service that upserts Xero employees, payroll calendars, earnings rates, and pay items into JSON DB.
- Track last sync time, status, counts, and technical errors.
- Independently testable via settings page sync actions.

### Milestone 3 - Payroll Admin UI

- Add Xero Settings, Employee Mapping, and Payroll Settings pages.
- Reuse existing tables, panels, buttons, flash notices, loading states via simple form submissions, and empty states.
- Independently testable by browsing `/payroll/xero`, `/payroll/mappings`, and `/payroll/settings`.

### Milestone 4 - Mapping and Override Logic

- Add employee-to-Xero mapping with one-to-one Xero employee enforcement.
- Add position defaults for standard earning categories and employee override mappings.
- Preserve existing staff profile Xero fields for backwards compatibility.
- Independently testable by saving mappings and checking validation status badges.

### Milestone 5 - Validation and Timesheet Review

- Add payroll validation service with readiness checks and payload generation.
- Update timesheet detail into a review screen with validation report, earnings breakdown, and developer JSON payload.
- Block Xero submission until validation passes.
- Independently testable by validating ready and incomplete timesheets.

### Milestone 6 - Verification and Documentation

- Run syntax checks and local server smoke checks.
- Update this log with files changed, testing performed, known issues, and the next recommended task.

## Tasks Completed

- Completed full codebase review before implementation.
- Produced architecture review and implementation roadmap.
- Extended JSON DB defaults and store helpers for payroll configuration collections.
- Added Xero sync service for employees, payroll calendars, pay items, and earnings rates.
- Added employee mapping service with one-to-one Xero employee enforcement.
- Added position earnings mapping and employee override service.
- Added payroll validation service and validated submission service.
- Added Payroll Admin navigation and screens for Xero settings, employee mappings, and payroll settings.
- Updated timesheet review to show validation results, earnings breakdown, and generated Xero payload.
- Updated publish flow so validation must pass before submission.

## Files Modified

- `src/services/store.js`: Extended existing JSON DB conventions with payroll collections, sync status, audit logs, submission logs, employee mappings, position mappings, and overrides.
- `src/services/xero.js`: Added reusable Xero reads for pay items and timesheets, exposed earnings extraction, and added payload-based timesheet publishing.
- `src/server.js`: Added payroll admin routes, sync actions, mapping actions, payroll settings actions, validation action, and validation-gated submission.
- `src/views/layout.ejs`: Added Payroll Admin navigation.
- `src/views/timesheet-detail.ejs`: Rebuilt as a timesheet review screen with validation report, earnings breakdown, and developer payload.
- `public/styles.css`: Added shared styles for payroll tabs, details grids, mapping forms, settings blocks, validation rows, and JSON payload preview.

## Files Created

- `AGENT_LOG.md`: Mandatory implementation log and handoff document.
- `src/services/payrollConfig.js`: Central list of supported internal positions, earning categories, and date-to-category helper.
- `src/services/xeroSyncService.js`: Xero synchronisation orchestration and sync/audit logging.
- `src/services/employeeMappingService.js`: Employee mapping rows, readiness status, and mapping save logic.
- `src/services/earningsMappingService.js`: Position mapping, employee override, and mapping resolution logic.
- `src/services/payrollValidationService.js`: Timesheet readiness validation and Xero payload generation.
- `src/services/timesheetSubmissionService.js`: Validation logging and validation-gated Xero submission.
- `src/views/payroll-xero.ejs`: Xero settings and synchronisation page.
- `src/views/payroll-mappings.ejs`: Employee mapping page.
- `src/views/payroll-settings.ejs`: Position earnings and employee override configuration page.

## Design Decisions

- Continue using the existing single-file JSON DB rather than introducing per-collection JSON files because the current app convention is `data/db.json`.
- Add payroll admin routes under `/payroll` to avoid disrupting existing `staff`, `profiles`, and `timesheets` routes.
- Preserve existing `staff.xeroEmployeeID`, `staff.payrollCalendarID`, and `staff.earningsRateID` fields for backwards compatibility.
- Use synced Xero data for new configuration pages, while allowing legacy `staff.earningsRateID` as a fallback in validation so existing simple profiles remain usable after calendar/employee sync.
- Infer initial earning categories from dates because existing timesheet rows store daily hours only. Saturday and Sunday map to their weekend categories; weekdays map to Ordinary Hours.
- Store audit logs, sync logs, and submission logs in `data/db.json` to stay inside the JSON DB architecture.

## Known Issues

- Existing timesheets include duplicate employee/week records in local data; validation must prevent publishing duplicates.
- Existing timesheet rows do not store earning categories; initial validation will infer categories from dates.
- No automated test script exists in `package.json`.
- Re-sync Employee currently runs the employee sync action and returns to Xero settings; a later refinement should support returning to the originating review screen.
- Xero organisation name is best-effort from Payroll settings because Custom Connections may not have Accounting API organisation scopes.

## Testing Performed

- Ran `node --check` on `src/server.js`, `src/services/store.js`, `src/services/xero.js`, and all service files.
- Started the app on `PORT=3001` because port `3000` was already in use.
- Smoke-tested `GET /`, `GET /payroll/xero`, `GET /payroll/mappings`, `GET /payroll/settings`, and a ready timesheet detail page; all returned HTTP 200.
- Exercised `POST /timesheets/:id/validate` against a local ready timesheet; route returned the expected redirect after writing local validation/audit log entries.
- Did not run live Xero sync or submission actions during verification to avoid changing external Xero data.

## Current Status

- First implementation pass is complete for the payroll configuration module foundation, sync UI, mapping UI, settings UI, validation report, payload preview, audit logging, and validation-gated submission.

## Next Recommended Task

- Manually sync from Xero in the UI, configure position mappings, then validate a real unpublished timesheet end to end before attempting a live Xero submission.
