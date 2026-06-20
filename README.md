# Xero Timesheet Prototype

Node.js and EJS prototype for a Xero Custom Connection workflow:

1. Connect to a single Xero organisation with client credentials.
2. Search Xero Payroll AU employees.
3. Link selected employees to local system profiles.
4. Let a profile submit weekly hours.
5. Let accounts publish the timesheet to Xero Payroll AU.

This is intentionally small and easy to lift into another project. The local JSON store is a prototype replacement for your real database, authentication, and approval workflow.

## Xero API Notes

This project uses the official `xero-node` SDK.

Custom Connections are Xero's machine-to-machine option for a single organisation and use the OAuth 2.0 client credentials grant. In `xero-node`, custom connections pass an empty string for `xeroTenantId` because the app is already tied to one organisation.

Payroll AU timesheets are not accounting invoices or bills. Employee timesheets use:

- `payrollCalendarID`
- `employeeID`
- `startDate`
- `endDate`
- `status`
- `timesheetLines[]` with `date`, `earningsRateID`, and `numberOfUnits`

The supplied `XERO_DEFAULT_ACCOUNT_CODE` and `XERO_DEFAULT_TAX_TYPE` are kept in config because they may matter elsewhere in the real project, but they are not sent to the Xero Payroll timesheet endpoint.

Official references checked while building:

- Xero Custom Connections: https://developer.xero.com/documentation/guides/oauth2/custom-connections/
- Xero OAuth 2 scopes: https://developer.xero.com/documentation/guides/oauth2/scopes/
- Xero Payroll AU Timesheets: https://developer.xero.com/documentation/api/payrollau/timesheets
- Xero Payroll AU Employees: https://developer.xero.com/documentation/api/payrollau/employees
- Xero API changelog, last updated 15 June 2026: https://developer.xero.com/changelog

## Setup

Install dependencies:

```bash
npm install
```

Create `.env` from `.env.example` and fill in the Xero values:

```bash
PORT=3000
SESSION_SECRET=replace-with-a-long-random-string
XERO_CLIENT_ID=your-client-id
XERO_CLIENT_SECRET=your-client-secret
XERO_TENANT_ID=
XERO_TIMESHEET_STATUS=Draft
XERO_DEFAULT_ACCOUNT_CODE=429
XERO_DEFAULT_TAX_TYPE=INPUT
```

Run the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Required Xero Setup

Create a Custom Connection app in the Xero Developer portal and select the payroll scopes required by your workflow. For this prototype, the practical scopes are:

```text
payroll.employees payroll.settings payroll.timesheets
```

Depending on how your Xero app is configured, Xero may present these as read/manage variants in the developer UI. The app must be authorised for the target organisation before the client credentials token can access payroll data.

For first testing, use the Xero Demo Company or a non-production organisation. Keep `XERO_TIMESHEET_STATUS=Draft` until the accounts team confirms the final approval behavior.

## Workflow

### 1. Check the Xero connection

Use the dashboard button. The app requests a client credentials token and reads payroll calendars. If this fails, check:

- Custom Connection is authorised.
- Client ID and secret match the Custom Connection app.
- Payroll scopes include settings access.
- The organisation has Payroll AU enabled.

### 2. Connect staff

Go to `Connect Staff`. The app loads Xero Payroll AU employees, payroll calendars, and earnings rates. When a staff member is connected, the app stores:

- Local profile ID
- Xero `employeeID`
- Name and email
- Selected `payrollCalendarID`
- Selected `earningsRateID`

In a real project, this belongs in your users/staff table, not a separate JSON file.

### 3. Fill a weekly timesheet

Go to `Timesheets > New timesheet`. Select a connected profile, choose the week start date, and enter daily hours. The prototype saves seven daily lines locally.

### 4. Publish to Xero

Open a saved timesheet and click `Publish to Xero`. The app sends one Xero Payroll AU v2 timesheet with a line for each day that has hours.

After a successful publish, the local record is marked `Published` and stores the returned Xero timesheet ID when present.

## Project Structure

```text
src/server.js          Express routes and workflow orchestration
src/config.js          Environment configuration
src/services/xero.js   Xero SDK setup and API calls
src/services/store.js  Prototype JSON persistence
src/lib/dates.js       Week/date helpers
src/views/*            EJS screens
public/styles.css      App styling
data/db.json           Local prototype data, created at runtime
```

## Moving This Into a Real Project

Replace `src/services/store.js` with your real database layer. Keep the shape of the service methods or adapt the route calls:

- `listStaff`
- `findStaff`
- `upsertStaff`
- `createTimesheet`
- `findTimesheet`
- `markTimesheetPublished`

Add authentication before using this in production:

- Staff users should only create or view their own timesheets.
- Accounts users should be the only users allowed to publish.
- Store `xeroEmployeeID`, `payrollCalendarID`, and `earningsRateID` on the staff profile or an integration mapping table.

Add approval and validation rules:

- Prevent duplicate local timesheets for the same staff/week.
- Decide whether Xero timesheets should be `Draft` or `Approved`.
- Validate week start against the employee's payroll calendar.
- Handle the Xero rule that a timesheet start date must be later than the end date of existing timesheets for that employee.

Add production-grade Xero handling:

- Persist token metadata if you want fewer token requests.
- Add structured logging around Xero API errors.
- Add idempotency keys for publish requests.
- Add a background reconciliation job to compare local published records with Xero.

## Key Xero Service Methods

`src/services/xero.js` is the integration boundary:

```js
async function listEmployees(searchTerm)
async function listPayrollCalendars()
async function listEarningsRates()
async function publishTimesheet(staff, timesheet)
```

The publish method builds this payload:

```js
{
  payrollCalendarID: staff.payrollCalendarID,
  employeeID: staff.xeroEmployeeID,
  startDate: timesheet.weekStart,
  endDate: timesheet.weekEnd,
  status: "Draft",
  timesheetLines: [
    {
      date: "2026-06-15",
      earningsRateID: staff.earningsRateID,
      numberOfUnits: 7.5
    }
  ]
}
```

## Security Notes

The `.env` file is ignored by Git. Do not commit real Xero secrets to a repository. Rotate the secret if it has been exposed outside the intended development environment.

Custom Connections grant organisation-level access for the selected scopes, so treat the client secret like a production password.
