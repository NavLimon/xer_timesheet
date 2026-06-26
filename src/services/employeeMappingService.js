const store = require("./store");

function byId(records, key) {
  return new Map(records.map((record) => [record[key], record]));
}

function mappingStatus({ staff, mapping, xeroEmployee, positionMapping, override }) {
  if (!mapping && !staff.xeroEmployeeID) return { key: "notLinked", label: "Not Linked", ready: false };
  if (!mapping && staff.xeroEmployeeID) {
    mapping = {
      xeroEmployeeID: staff.xeroEmployeeID,
      payrollCalendarID: staff.payrollCalendarID
    };
  }
  if (!mapping.payrollCalendarID) return { key: "missingCalendar", label: "Missing Payroll Calendar", ready: false };
  if (xeroEmployee && xeroEmployee.status && xeroEmployee.status.toLowerCase() !== "active") {
    return { key: "inactive", label: "Employee Inactive", ready: false };
  }
  const hasPositionMappings = positionMapping && Object.values(positionMapping.earningsMappings || {}).some(Boolean);
  const hasOverrides = override && Object.values(override.earningsMappings || {}).some(Boolean);
  if (!staff.earningsRateID && !hasPositionMappings && !hasOverrides) {
    return { key: "missingEarnings", label: "Missing Earnings", ready: false };
  }
  return { key: "ready", label: "Ready", ready: true };
}

async function listMappingRows(options = {}) {
  const [staff, mappings, xeroEmployees, calendars, positionMappings, overrides] = await Promise.all([
    store.listStaff(),
    store.listEmployeeMappings(),
    store.listCollection("xeroEmployees"),
    store.listCollection("payrollCalendars"),
    store.listPositionMappings(),
    store.listEmployeeOverrides()
  ]);
  const xeroById = byId(xeroEmployees, "xeroEmployeeID");
  const calendarById = byId(calendars, "payrollCalendarID");
  const mappingByStaffId = byId(mappings, "staffId");
  const positionByName = byId(positionMappings, "position");
  const overrideByStaffId = byId(overrides, "staffId");
  const search = (options.search || "").trim().toLowerCase();
  const statusFilter = options.status || "";

  return staff
    .map((profile) => {
      const mapping = mappingByStaffId.get(profile.id);
      const fallbackMapping =
        mapping ||
        (profile.xeroEmployeeID
          ? {
              staffId: profile.id,
              xeroEmployeeID: profile.xeroEmployeeID,
              payrollCalendarID: profile.payrollCalendarID
            }
          : null);
      const xeroEmployee = fallbackMapping ? xeroById.get(fallbackMapping.xeroEmployeeID) : null;
      const payrollCalendar = fallbackMapping ? calendarById.get(fallbackMapping.payrollCalendarID) : null;
      const status = mappingStatus({
        staff: profile,
        mapping: fallbackMapping,
        xeroEmployee,
        positionMapping: positionByName.get(profile.position || ""),
        override: overrideByStaffId.get(profile.id)
      });
      return {
        staff: profile,
        mapping: fallbackMapping,
        xeroEmployee,
        payrollCalendar,
        status
      };
    })
    .filter((row) => {
      if (search) {
        const haystack = `${row.staff.name} ${row.staff.email} ${row.xeroEmployee ? row.xeroEmployee.name : ""}`
          .toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      if (statusFilter && row.status.key !== statusFilter) return false;
      return true;
    })
    .sort((a, b) => a.staff.name.localeCompare(b.staff.name));
}

async function saveMapping(input) {
  const mapping = await store.upsertEmployeeMapping(input);
  await store.addAuditLog({
    action: "employeeMapping.save",
    result: "success",
    referenceIds: {
      staffId: input.staffId,
      xeroEmployeeID: input.xeroEmployeeID,
      payrollCalendarID: input.payrollCalendarID
    }
  });
  return mapping;
}

module.exports = {
  listMappingRows,
  saveMapping
};
