const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const dataDir = path.join(__dirname, "..", "..", "data");
const dbPath = path.join(dataDir, "db.json");

const initialState = {
  staff: [],
  timesheets: []
};

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
  return JSON.parse(raw);
}

async function writeDb(db) {
  await ensureDb();
  await fs.writeFile(dbPath, JSON.stringify(db, null, 2));
}

function makeId() {
  return crypto.randomUUID();
}

async function listStaff() {
  const db = await readDb();
  return db.staff.sort((a, b) => a.name.localeCompare(b.name));
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
  const existingIndex = db.staff.findIndex((staff) => staff.xeroEmployeeID === input.xeroEmployeeID);
  const now = new Date().toISOString();
  const record = {
    id: existingIndex >= 0 ? db.staff[existingIndex].id : makeId(),
    xeroEmployeeID: input.xeroEmployeeID,
    name: input.name,
    email: input.email || "",
    payrollCalendarID: input.payrollCalendarID,
    earningsRateID: input.earningsRateID,
    createdAt: existingIndex >= 0 ? db.staff[existingIndex].createdAt : now,
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
  return db.timesheets.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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

module.exports = {
  createTimesheet,
  findStaff,
  findStaffByXeroEmployeeId,
  findTimesheet,
  listStaff,
  listTimesheets,
  markTimesheetPublished,
  upsertStaff
};
