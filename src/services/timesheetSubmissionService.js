const store = require("./store");
const xero = require("./xero");
const payrollValidationService = require("./payrollValidationService");

function errorMessage(error) {
  return error && error.message ? error.message : String(error);
}

async function validateAndLog(timesheet, staff) {
  const report = await payrollValidationService.validateTimesheet(timesheet, staff);
  await store.addSubmissionLog({
    timesheetId: timesheet.id,
    staffId: timesheet.staffId,
    action: "validate",
    result: report.ok ? "success" : "failed",
    errorMessage: report.ok ? "" : "Timesheet is not ready for Xero submission.",
    payload: report.payload
  });
  await store.addAuditLog({
    action: "timesheet.validate",
    result: report.ok ? "success" : "failed",
    referenceIds: { timesheetId: timesheet.id, staffId: timesheet.staffId }
  });
  return report;
}

async function submit(timesheet, staff) {
  const report = await payrollValidationService.validateTimesheet(timesheet, staff);
  if (!report.ok) {
    await store.addSubmissionLog({
      timesheetId: timesheet.id,
      staffId: timesheet.staffId,
      action: "submit",
      result: "blocked",
      errorMessage: "Validation failed.",
      payload: report.payload
    });
    throw new Error("Timesheet is not ready for Xero. Review the validation report before submitting.");
  }

  try {
    const result = await xero.publishTimesheetPayload(report.payload);
    const updated = await store.markTimesheetPublished(timesheet.id, result);
    await store.addSubmissionLog({
      timesheetId: timesheet.id,
      staffId: timesheet.staffId,
      action: "submit",
      result: "success",
      referenceIds: {
        xeroTimesheetID: updated ? updated.xeroTimesheetID : ""
      },
      payload: report.payload
    });
    await store.addAuditLog({
      action: "timesheet.submit",
      result: "success",
      referenceIds: {
        timesheetId: timesheet.id,
        staffId: timesheet.staffId,
        xeroTimesheetID: updated ? updated.xeroTimesheetID : ""
      }
    });
    return updated;
  } catch (error) {
    const message = errorMessage(error);
    await store.addSubmissionLog({
      timesheetId: timesheet.id,
      staffId: timesheet.staffId,
      action: "submit",
      result: "failed",
      errorMessage: message,
      payload: report.payload
    });
    await store.addAuditLog({
      action: "timesheet.submit",
      result: "failed",
      errorMessage: message,
      referenceIds: { timesheetId: timesheet.id, staffId: timesheet.staffId }
    });
    throw error;
  }
}

module.exports = {
  submit,
  validateAndLog
};
