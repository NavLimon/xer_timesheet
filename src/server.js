const express = require("express");
const layouts = require("express-ejs-layouts");
const session = require("express-session");
const flash = require("connect-flash");
const methodOverride = require("method-override");
const path = require("path");

const { config } = require("./config");
const { todayMonday, weekDates } = require("./lib/dates");
const store = require("./services/store");
const xero = require("./services/xero");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(layouts);
app.set("layout", "layout");

app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "..", "public")));
app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false
  })
);
app.use(flash());

app.use((req, res, next) => {
  res.locals.path = req.path;
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  next();
});

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function parseHours(body, dates) {
  return dates.map((date) => ({
    date,
    hours: Math.max(0, Number(body[`hours_${date}`] || 0))
  }));
}

app.get(
  "/",
  asyncRoute(async (req, res) => {
    const [staff, timesheets] = await Promise.all([store.listStaff(), store.listTimesheets()]);
    res.render("dashboard", {
      title: "Xero Timesheet Prototype",
      staff,
      timesheets: timesheets.slice(0, 6)
    });
  })
);

app.post(
  "/xero/check",
  asyncRoute(async (req, res) => {
    const summary = await xero.getConnectionSummary();
    req.flash("success", `Xero connection is working. Payroll calendars found: ${summary.payrollCalendarCount}.`);
    res.redirect("/");
  })
);

app.get(
  "/staff",
  asyncRoute(async (req, res) => {
    const q = req.query.q || "";
    const [employees, linkedStaff, calendars, earningsRates] = await Promise.all([
      xero.listEmployees(q),
      store.listStaff(),
      xero.listPayrollCalendars(),
      xero.listEarningsRates()
    ]);
    const linkedByEmployee = new Map(linkedStaff.map((staff) => [staff.xeroEmployeeID, staff]));

    res.render("staff", {
      title: "Connect Staff",
      q,
      employees,
      linkedByEmployee,
      calendars,
      earningsRates
    });
  })
);

app.post(
  "/staff/link",
  asyncRoute(async (req, res) => {
    const required = ["xeroEmployeeID", "name", "payrollCalendarID", "earningsRateID"];
    const missing = required.filter((field) => !req.body[field]);
    if (missing.length) {
      req.flash("error", `Missing required fields: ${missing.join(", ")}.`);
      return res.redirect("/staff");
    }

    const staff = await store.upsertStaff({
      xeroEmployeeID: req.body.xeroEmployeeID,
      name: req.body.name,
      email: req.body.email,
      payrollCalendarID: req.body.payrollCalendarID,
      earningsRateID: req.body.earningsRateID
    });
    req.flash("success", `${staff.name} is connected to this system.`);
    res.redirect("/profiles");
  })
);

app.get(
  "/profiles",
  asyncRoute(async (req, res) => {
    const staff = await store.listStaff();
    res.render("profiles", { title: "Profiles", staff });
  })
);

app.get(
  "/timesheets",
  asyncRoute(async (req, res) => {
    const [timesheets, staff] = await Promise.all([store.listTimesheets(), store.listStaff()]);
    const staffById = new Map(staff.map((profile) => [profile.id, profile]));
    res.render("timesheets", { title: "Timesheets", timesheets, staffById });
  })
);

app.get(
  "/timesheets/new",
  asyncRoute(async (req, res) => {
    const staff = await store.listStaff();
    const selectedStaffId = req.query.staffId || (staff[0] && staff[0].id);
    const weekStart = req.query.weekStart || todayMonday();
    const dates = weekDates(weekStart);

    res.render("timesheet-form", {
      title: "New Timesheet",
      staff,
      selectedStaffId,
      weekStart,
      dates
    });
  })
);

app.post(
  "/timesheets",
  asyncRoute(async (req, res) => {
    const staff = await store.findStaff(req.body.staffId);
    if (!staff) {
      req.flash("error", "Select a connected staff profile before creating a timesheet.");
      return res.redirect("/timesheets/new");
    }

    const dates = weekDates(req.body.weekStart);
    const days = parseHours(req.body, dates);
    const totalHours = days.reduce((sum, day) => sum + Number(day.hours), 0);

    if (totalHours <= 0) {
      req.flash("error", "Enter at least one hour before saving the timesheet.");
      return res.redirect(`/timesheets/new?staffId=${staff.id}&weekStart=${req.body.weekStart}`);
    }

    const timesheet = await store.createTimesheet({
      staffId: staff.id,
      staffName: staff.name,
      weekStart: req.body.weekStart,
      weekEnd: dates[6],
      days,
      totalHours,
      notes: req.body.notes
    });

    req.flash("success", `Timesheet saved for ${staff.name}.`);
    res.redirect(`/timesheets/${timesheet.id}`);
  })
);

app.get(
  "/timesheets/:id",
  asyncRoute(async (req, res) => {
    const timesheet = await store.findTimesheet(req.params.id);
    if (!timesheet) return res.status(404).render("not-found", { title: "Not Found" });
    const staff = await store.findStaff(timesheet.staffId);
    res.render("timesheet-detail", { title: "Timesheet", timesheet, staff });
  })
);

app.post(
  "/timesheets/:id/publish",
  asyncRoute(async (req, res) => {
    const timesheet = await store.findTimesheet(req.params.id);
    if (!timesheet) return res.status(404).render("not-found", { title: "Not Found" });
    if (timesheet.status === "Published") {
      req.flash("error", "This timesheet has already been published.");
      return res.redirect(`/timesheets/${timesheet.id}`);
    }

    const staff = await store.findStaff(timesheet.staffId);
    const result = await xero.publishTimesheet(staff, timesheet);
    await store.markTimesheetPublished(timesheet.id, result);

    req.flash("success", "Timesheet published to Xero.");

    res.redirect(`/timesheets/${timesheet.id}`);
  })
);

app.use((err, req, res, next) => {
  console.error(err);
  req.flash("error", err.message || "Something went wrong.");
  res.redirect(req.get("referer") || "/");
});

app.listen(config.port, () => {
  console.log(`Xero timesheet prototype running at http://localhost:${config.port}`);
});
