const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const dataDir = path.join(__dirname, "..", "..", "data");
const dbPath = path.join(dataDir, "db.json");

const initialState = {
  staff: [],
  timesheets: [],
  xeroConnection: {
    status: "Not tested",
    organisationName: "",
    tenantId: "",
    lastTestedAt: null,
    lastSyncAt: null,
    apiStatus: "Unknown",
    lastError: null
  },
  xeroEmployees: [],
  payrollCalendars: [],
  earningsRates: [],
  payItems: [],
  employeeMappings: [],
  positionMappings: [],
  employeeOverrides: [],
  syncLogs: [],
  submissionLogs: [],
  auditLogs: [],
  syncStatus: {}
};

function withDefaults(db) {
  return {
    ...initialState,
    ...db,
    xeroConnection: {
      ...initialState.xeroConnection,
      ...(db.xeroConnection || {})
    },
    syncStatus: {
      ...initialState.syncStatus,
      ...(db.syncStatus || {})
    }
  };
}

async function ensureDb() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dbPath);
  } catch {
    await fs.writeFile(dbPath, JSON.stringify(initialState, null, 2));
  }
}

async function readDb() {
  await ensureDb();
  const raw = await fs.readFile(dbPath, "utf8");
  return withDefaults(JSON.parse(raw));
}

async function writeDb(db) {
  await ensureDb();
  await fs.writeFile(dbPath, JSON.stringify(withDefaults(db), null, 2));
}

function makeId() {
  return crypto.randomUUID();
}

async function listStaff() {
  const db = await readDb();
  return [...db.staff].sort((a, b) => a.name.localeCompare(b.name));
}

async function findStaff(id) {
  const db = await readDb();
  return db.staff.find((staff) => staff.id === id);
}

async function findStaffByXeroEmployeeId(xeroEmployeeID) {
  const db = await readDb();
  return db.staff.find((staff) => staff.xeroEmployeeID === xeroEmployeeID);
}

async function upsertStaff(input) {
  const db = await readDb();
  const existingIndex = input.id
    ? db.staff.findIndex((staff) => staff.id === input.id)
    : db.staff.findIndex((staff) => staff.xeroEmployeeID === input.xeroEmployeeID);
  const existing = existingIndex >= 0 ? db.staff[existingIndex] : {};
  const now = new Date().toISOString();
  const record = {
    ...existing,
    id: existingIndex >= 0 ? existing.id : makeId(),
    xeroEmployeeID: input.xeroEmployeeID || existing.xeroEmployeeID || "",
    name: input.name || existing.name,
    email: input.email || existing.email || "",
    position: input.position || existing.position || "",
    payrollCalendarID: input.payrollCalendarID || existing.payrollCalendarID || "",
    earningsRateID: input.earningsRateID || existing.earningsRateID || "",
    createdAt: existingIndex >= 0 ? existing.createdAt : now,
    updatedAt: now
  };

  if (existingIndex >= 0) {
    db.staff[existingIndex] = record;
  } else {
    db.staff.push(record);
  }

  await writeDb(db);
  return record;
}

async function listTimesheets() {
  const db = await readDb();
  return [...db.timesheets].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function findTimesheet(id) {
  const db = await readDb();
  return db.timesheets.find((timesheet) => timesheet.id === id);
}

async function createTimesheet(input) {
  const db = await readDb();
  const now = new Date().toISOString();
  const record = {
    id: makeId(),
    staffId: input.staffId,
    staffName: input.staffName,
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    days: input.days,
    totalHours: input.totalHours,
    notes: input.notes || "",
    status: "Ready",
    xeroTimesheetID: null,
    xeroPublishedAt: null,
    xeroResponse: null,
    createdAt: now,
    updatedAt: now
  };
  db.timesheets.push(record);
  await writeDb(db);
  return record;
}

async function markTimesheetPublished(id, xeroResult) {
  const db = await readDb();
  const index = db.timesheets.findIndex((timesheet) => timesheet.id === id);
  if (index === -1) return null;

  const body = xeroResult && xeroResult.body ? xeroResult.body : xeroResult;
  const xeroTimesheet = body && (body.timesheet || (body.timesheets && body.timesheets[0]));

  db.timesheets[index] = {
    ...db.timesheets[index],
    status: "Published",
    xeroTimesheetID: xeroTimesheet ? xeroTimesheet.timesheetID : null,
    xeroPublishedAt: new Date().toISOString(),
    xeroResponse: body || null,
    updatedAt: new Date().toISOString()
  };

  await writeDb(db);
  return db.timesheets[index];
}

async function listCollection(name) {
  const db = await readDb();
  const collection = db[name] || [];
  return Array.isArray(collection) ? [...collection] : collection;
}

async function replaceCollection(name, records) {
  const db = await readDb();
  db[name] = records;
  await writeDb(db);
  return db[name];
}

async function upsertCollectionRecord(name, key, input) {
  const db = await readDb();
  const collection = db[name] || [];
  const index = collection.findIndex((record) => record[key] === input[key]);
  const now = new Date().toISOString();
  const record = {
    ...(index >= 0 ? collection[index] : {}),
    ...input,
    createdAt: index >= 0 ? collection[index].createdAt : input.createdAt || now,
    updatedAt: now
  };

  if (index >= 0) {
    collection[index] = record;
  } else {
    collection.push(record);
  }

  db[name] = collection;
  await writeDb(db);
  return record;
}

async function updateXeroConnection(input) {
  const db = await readDb();
  db.xeroConnection = {
    ...db.xeroConnection,
    ...input
  };
  await writeDb(db);
  return db.xeroConnection;
}

async function getXeroConnection() {
  const db = await readDb();
  return db.xeroConnection;
}

async function updateSyncStatus(name, input) {
  const db = await readDb();
  db.syncStatus[name] = {
    ...(db.syncStatus[name] || {}),
    ...input,
    updatedAt: new Date().toISOString()
  };
  await writeDb(db);
  return db.syncStatus[name];
}

async function getSyncStatus() {
  const db = await readDb();
  return db.syncStatus;
}

async function addAuditLog(input) {
  const db = await readDb();
  const record = {
    id: makeId(),
    timestamp: new Date().toISOString(),
    user: input.user || "Prototype Admin",
    action: input.action,
    result: input.result || "success",
    errorMessage: input.errorMessage || "",
    referenceIds: input.referenceIds || {},
    details: input.details || {}
  };
  db.auditLogs.push(record);
  await writeDb(db);
  return record;
}

async function addSyncLog(input) {
  const db = await readDb();
  const record = {
    id: makeId(),
    timestamp: new Date().toISOString(),
    syncType: input.syncType,
    result: input.result || "success",
    count: Number(input.count || 0),
    errorMessage: input.errorMessage || "",
    referenceIds: input.referenceIds || {},
    details: input.details || {}
  };
  db.syncLogs.push(record);
  await writeDb(db);
  return record;
}

async function addSubmissionLog(input) {
  const db = await readDb();
  const record = {
    id: makeId(),
    timestamp: new Date().toISOString(),
    timesheetId: input.timesheetId,
    staffId: input.staffId || "",
    action: input.action,
    result: input.result || "success",
    errorMessage: input.errorMessage || "",
    referenceIds: input.referenceIds || {},
    payload: input.payload || null
  };
  db.submissionLogs.push(record);
  await writeDb(db);
  return record;
}

async function listEmployeeMappings() {
  const db = await readDb();
  return [...db.employeeMappings];
}

async function findEmployeeMappingByStaffId(staffId) {
  const db = await readDb();
  return db.employeeMappings.find((mapping) => mapping.staffId === staffId);
}

async function upsertEmployeeMapping(input) {
  const db = await readDb();
  const duplicate = db.employeeMappings.find(
    (mapping) => mapping.staffId !== input.staffId && mapping.xeroEmployeeID === input.xeroEmployeeID
  );
  if (duplicate) {
    throw new Error("That Xero employee is already linked to another internal employee.");
  }

  const now = new Date().toISOString();
  const index = db.employeeMappings.findIndex((mapping) => mapping.staffId === input.staffId);
  const existing = index >= 0 ? db.employeeMappings[index] : {};
  const record = {
    ...existing,
    id: existing.id || makeId(),
    staffId: input.staffId,
    xeroEmployeeID: input.xeroEmployeeID,
    payrollCalendarID: input.payrollCalendarID || "",
    payrollStatus: input.payrollStatus || existing.payrollStatus || "Active",
    createdAt: existing.createdAt || now,
    updatedAt: now
  };

  if (index >= 0) {
    db.employeeMappings[index] = record;
  } else {
    db.employeeMappings.push(record);
  }

  const staffIndex = db.staff.findIndex((staff) => staff.id === input.staffId);
  if (staffIndex >= 0) {
    const xeroEmployee = db.xeroEmployees.find((employee) => employee.xeroEmployeeID === input.xeroEmployeeID);
    db.staff[staffIndex] = {
      ...db.staff[staffIndex],
      xeroEmployeeID: input.xeroEmployeeID,
      payrollCalendarID: input.payrollCalendarID || db.staff[staffIndex].payrollCalendarID || "",
      name: db.staff[staffIndex].name || (xeroEmployee && xeroEmployee.name) || "",
      email: db.staff[staffIndex].email || (xeroEmployee && xeroEmployee.email) || "",
      updatedAt: now
    };
  }

  await writeDb(db);
  return record;
}

async function listPositionMappings() {
  const db = await readDb();
  return [...db.positionMappings].sort((a, b) => a.position.localeCompare(b.position));
}

async function upsertPositionMapping(input) {
  return upsertCollectionRecord("positionMappings", "position", {
    position: input.position,
    earningsMappings: input.earningsMappings || {},
    updatedBy: input.updatedBy || "Prototype Admin"
  });
}

async function listEmployeeOverrides() {
  const db = await readDb();
  return [...db.employeeOverrides];
}

async function findEmployeeOverride(staffId) {
  const db = await readDb();
  return db.employeeOverrides.find((override) => override.staffId === staffId);
}

async function upsertEmployeeOverride(input) {
  return upsertCollectionRecord("employeeOverrides", "staffId", {
    staffId: input.staffId,
    earningsMappings: input.earningsMappings || {},
    updatedBy: input.updatedBy || "Prototype Admin"
  });
}

module.exports = {
  addAuditLog,
  addSubmissionLog,
  addSyncLog,
  createTimesheet,
  findEmployeeMappingByStaffId,
  findEmployeeOverride,
  findStaff,
  findStaffByXeroEmployeeId,
  findTimesheet,
  getSyncStatus,
  getXeroConnection,
  listCollection,
  listEmployeeMappings,
  listEmployeeOverrides,
  listPositionMappings,
  listStaff,
  listTimesheets,
  markTimesheetPublished,
  replaceCollection,
  updateSyncStatus,
  updateXeroConnection,
  upsertCollectionRecord,
  upsertEmployeeMapping,
  upsertEmployeeOverride,
  upsertPositionMapping,
  upsertStaff
};
