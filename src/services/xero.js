const { XeroClient } = require("xero-node");
const { PayrollAuV2Api } = require("xero-node/dist/gen/api/payrollAUV2Api");
const { config, assertConfig } = require("../config");

let client;
let payrollAUV2Api;
let tokenExpiresAt = 0;

function getClient() {
  assertConfig();
  if (!client) {
    client = new XeroClient({
      clientId: config.xero.clientId,
      clientSecret: config.xero.clientSecret,
      grantType: "client_credentials"
    });
  }
  return client;
}

function getPayrollAUV2Api() {
  if (!payrollAUV2Api) {
    payrollAUV2Api = new PayrollAuV2Api();
  }
  return payrollAUV2Api;
}

function syncGeneratedApiTokens(xero) {
  const accessToken = xero.readTokenSet() && xero.readTokenSet().access_token;
  if (!accessToken) return;
  getPayrollAUV2Api().accessToken = accessToken;
}

async function ensureToken() {
  const xero = getClient();
  const now = Date.now();
  if (now < tokenExpiresAt - 60 * 1000) {
    syncGeneratedApiTokens(xero);
    return xero;
  }

  const tokenSet = await xero.getClientCredentialsToken();
  const expiresIn = Number(tokenSet.expires_in || 1800);
  tokenExpiresAt = now + expiresIn * 1000;
  syncGeneratedApiTokens(xero);
  return xero;
}

function tenantId() {
  return config.xero.tenantId || "";
}

function employeeName(employee) {
  const parts = [employee.firstName, employee.lastName].filter(Boolean);
  return parts.join(" ") || employee.email || employee.employeeID;
}

async function getConnectionSummary() {
  const xero = await ensureToken();
  const calendars = await xero.payrollAUApi.getPayrollCalendars(tenantId());
  return {
    ok: true,
    payrollCalendarCount: calendars.body.payrollCalendars ? calendars.body.payrollCalendars.length : 0
  };
}

async function listEmployees(searchTerm = "") {
  const xero = await ensureToken();
  const response = await xero.payrollAUApi.getEmployees(tenantId());
  const employees = response.body.employees || [];
  const normalizedSearch = searchTerm.trim().toLowerCase();

  return employees
    .map((employee) => ({
      xeroEmployeeID: employee.employeeID,
      name: employeeName(employee),
      firstName: employee.firstName || "",
      lastName: employee.lastName || "",
      email: employee.email || "",
      status: employee.status || ""
    }))
    .filter((employee) => {
      if (!normalizedSearch) return true;
      return `${employee.name} ${employee.email}`.toLowerCase().includes(normalizedSearch);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function listPayrollCalendars() {
  const xero = await ensureToken();
  const response = await xero.payrollAUApi.getPayrollCalendars(tenantId());
  return (response.body.payrollCalendars || []).map((calendar) => ({
    payrollCalendarID: calendar.payrollCalendarID,
    name: calendar.name,
    calendarType: calendar.calendarType || "",
    startDate: calendar.startDate || "",
    paymentDate: calendar.paymentDate || ""
  }));
}

async function listEarningsRates() {
  const xero = await ensureToken();
  const response = await xero.payrollAUApi.getPayItems(tenantId());
  const payItems = response.body.payItems || response.body.payItem || [];
  const payItem = Array.isArray(payItems) ? payItems[0] : payItems;
  return (payItem.earningsRates || [])
    .filter((rate) => rate.earningsRateID)
    .map((rate) => ({
      earningsRateID: rate.earningsRateID,
      name: rate.name,
      earningsType: rate.earningsType || "",
      rateType: rate.rateType || ""
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeStatus(status) {
  const allowed = ["Draft", "Approved", "Completed"];
  return allowed.includes(status) ? status : "Draft";
}

async function publishTimesheet(staff, timesheet) {
  await ensureToken();
  const lines = timesheet.days
    .filter((day) => Number(day.hours) > 0)
    .map((day) => ({
      date: day.date,
      earningsRateID: staff.earningsRateID,
      numberOfUnits: Number(day.hours)
    }));

  if (!lines.length) {
    throw new Error("Timesheet has no hours to publish.");
  }

  const payload = {
    payrollCalendarID: staff.payrollCalendarID,
    employeeID: staff.xeroEmployeeID,
    startDate: timesheet.weekStart,
    endDate: timesheet.weekEnd,
    status: normalizeStatus(config.xero.timesheetStatus),
    timesheetLines: lines
  };

  return getPayrollAUV2Api().createTimesheet(tenantId(), payload);
}

module.exports = {
  getConnectionSummary,
  listEarningsRates,
  listEmployees,
  listPayrollCalendars,
  publishTimesheet
};
