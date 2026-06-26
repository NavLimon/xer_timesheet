const { config } = require("../config");
const store = require("./store");
const { categoryForDate, categoryLabel } = require("./payrollConfig");
const earningsMappingService = require("./earningsMappingService");

function pass(label, details = "") {
  return { label, details, ok: true };
}

function fail(label, details = "") {
  return { label, details, ok: false };
}

function normalizeStatus(status) {
  const allowed = ["Draft", "Approved", "Completed"];
  return allowed.includes(status) ? status : "Draft";
}

async function getStaffMapping(staff) {
  const mapping = await store.findEmployeeMappingByStaffId(staff.id);
  if (mapping) return mapping;
  if (!staff.xeroEmployeeID) return null;
  return {
    staffId: staff.id,
    xeroEmployeeID: staff.xeroEmployeeID,
    payrollCalendarID: staff.payrollCalendarID || ""
  };
}

async function validateTimesheet(timesheet, staff) {
  const checks = [];
  const [mapping, xeroEmployees, calendars, earningsRates, timesheets] = await Promise.all([
    staff ? getStaffMapping(staff) : null,
    store.listCollection("xeroEmployees"),
    store.listCollection("payrollCalendars"),
    store.listCollection("earningsRates"),
    store.listTimesheets()
  ]);
  const xeroEmployee = mapping
    ? xeroEmployees.find((employee) => employee.xeroEmployeeID === mapping.xeroEmployeeID)
    : null;
  const payrollCalendar = mapping
    ? calendars.find((calendar) => calendar.payrollCalendarID === mapping.payrollCalendarID)
    : null;
  const earningsById = new Map(earningsRates.map((rate) => [rate.earningsRateID, rate]));
  const totalHours = (timesheet.days || []).reduce((sum, day) => sum + Number(day.hours || 0), 0);
  const duplicate = timesheets.find(
    (item) =>
      item.id !== timesheet.id &&
      item.staffId === timesheet.staffId &&
      item.weekStart === timesheet.weekStart &&
      item.status === "Published"
  );

  if (!staff) checks.push(fail("Employee Linked", "The local staff profile no longer exists."));
  else if (!mapping || !mapping.xeroEmployeeID) checks.push(fail("Employee Linked", "Map this employee to Xero."));
  else checks.push(pass("Employee Linked", mapping.xeroEmployeeID));

  if (!mapping || !mapping.payrollCalendarID) checks.push(fail("Payroll Calendar", "Assign a payroll calendar."));
  else checks.push(payrollCalendar ? pass("Payroll Calendar", payrollCalendar.name) : fail("Payroll Calendar", "Calendar is not synced."));

  if (xeroEmployee && xeroEmployee.status && xeroEmployee.status.toLowerCase() !== "active") {
    checks.push(fail("Employee Active", xeroEmployee.status));
  } else if (mapping && mapping.xeroEmployeeID) {
    checks.push(pass("Employee Active", xeroEmployee ? xeroEmployee.status || "Active" : "Not synced, using mapped ID."));
  }

  if (!timesheet.weekStart || !timesheet.weekEnd) checks.push(fail("Pay Period Exists", "Week dates are missing."));
  else checks.push(pass("Pay Period Exists", `${timesheet.weekStart} to ${timesheet.weekEnd}`));

  if (totalHours <= 0) checks.push(fail("Timesheet Contains Hours", "Enter at least one hour."));
  else checks.push(pass("Timesheet Contains Hours", `${totalHours} hours`));

  const invalidDates = (timesheet.days || []).filter((day) => Number.isNaN(Date.parse(`${day.date}T00:00:00Z`)));
  checks.push(invalidDates.length ? fail("Dates Valid", "One or more dates are invalid.") : pass("Dates Valid"));

  if (timesheet.status === "Published") checks.push(fail("Duplicate Submission", "This timesheet is already published."));
  else if (duplicate) checks.push(fail("Duplicate Submission", "A published timesheet already exists for this employee/week."));
  else checks.push(pass("Duplicate Submission"));

  let resolvedMappings = {};
  if (staff) {
    resolvedMappings = await earningsMappingService.resolveMappingsForStaff(staff);
  }

  const lines = [];
  const missingCategories = new Set();
  const invalidRateIds = new Set();
  for (const day of timesheet.days || []) {
    const hours = Number(day.hours || 0);
    if (hours <= 0) continue;
    const category = day.earningCategory || categoryForDate(day.date);
    const earningsRateID = resolvedMappings[category] || (staff && staff.earningsRateID) || "";
    if (!earningsRateID) {
      missingCategories.add(category);
      continue;
    }
    if (earningsRates.length && !earningsById.has(earningsRateID)) {
      invalidRateIds.add(earningsRateID);
    }
    lines.push({
      date: day.date,
      earningCategory: category,
      earningCategoryLabel: categoryLabel(category),
      earningsRateID,
      earningsRateName: earningsById.get(earningsRateID) ? earningsById.get(earningsRateID).name : "Legacy staff earnings rate",
      numberOfUnits: hours
    });
  }

  if (missingCategories.size) {
    checks.push(
      fail(
        "Earnings Configured",
        `Missing ${Array.from(missingCategories)
          .map(categoryLabel)
          .join(", ")} earnings mapping.`
      )
    );
  } else if (invalidRateIds.size) {
    checks.push(fail("Earnings Configured", "One or more earnings rates are not in the latest sync."));
  } else if (!lines.length) {
    checks.push(fail("Earnings Configured", "No payable lines were generated."));
  } else {
    checks.push(pass("Earnings Configured", `${lines.length} line(s)`));
  }

  const payload =
    mapping && mapping.xeroEmployeeID && mapping.payrollCalendarID
      ? {
          payrollCalendarID: mapping.payrollCalendarID,
          employeeID: mapping.xeroEmployeeID,
          startDate: timesheet.weekStart,
          endDate: timesheet.weekEnd,
          status: normalizeStatus(config.xero.timesheetStatus),
          timesheetLines: lines.map((line) => ({
            date: line.date,
            earningsRateID: line.earningsRateID,
            numberOfUnits: line.numberOfUnits
          }))
        }
      : null;

  const ok = checks.every((check) => check.ok);
  return {
    ok,
    status: ok ? "READY" : "NOT READY",
    checks,
    lines,
    payload,
    totalHours,
    mapping,
    xeroEmployee,
    payrollCalendar
  };
}

module.exports = {
  validateTimesheet
};
