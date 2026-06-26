const { config } = require("../config");
const store = require("./store");
const xero = require("./xero");

function errorMessage(error) {
  return error && error.message ? error.message : String(error);
}

async function recordSuccess(syncType, count, details = {}) {
  const now = new Date().toISOString();
  await store.updateSyncStatus(syncType, {
    status: "success",
    lastSyncAt: now,
    count,
    lastError: null
  });
  await store.addSyncLog({ syncType, result: "success", count, details });
  await store.addAuditLog({
    action: `sync.${syncType}`,
    result: "success",
    referenceIds: { syncType },
    details: { count, ...details }
  });
}

async function recordFailure(syncType, error) {
  const message = errorMessage(error);
  await store.updateSyncStatus(syncType, {
    status: "failed",
    lastError: message
  });
  await store.addSyncLog({ syncType, result: "failed", errorMessage: message });
  await store.addAuditLog({
    action: `sync.${syncType}`,
    result: "failed",
    errorMessage: message,
    referenceIds: { syncType }
  });
}

async function syncCollection(syncType, collectionName, key, loader) {
  try {
    const records = await loader();
    for (const record of records) {
      await store.upsertCollectionRecord(collectionName, key, {
        ...record,
        syncedAt: new Date().toISOString()
      });
    }
    await recordSuccess(syncType, records.length);
    return { ok: true, syncType, count: records.length };
  } catch (error) {
    await recordFailure(syncType, error);
    throw error;
  }
}

async function testConnection() {
  try {
    const summary = await xero.getConnectionSummary();
    const connection = await store.updateXeroConnection({
      status: "Connected",
      organisationName: summary.organisationName || "Xero Custom Connection",
      tenantId: config.xero.tenantId || "",
      lastTestedAt: new Date().toISOString(),
      apiStatus: "OK",
      lastError: null
    });
    await store.addAuditLog({
      action: "xero.testConnection",
      result: "success",
      details: summary
    });
    return { ...summary, connection };
  } catch (error) {
    const message = errorMessage(error);
    await store.updateXeroConnection({
      status: "Error",
      tenantId: config.xero.tenantId || "",
      lastTestedAt: new Date().toISOString(),
      apiStatus: "Error",
      lastError: message
    });
    await store.addAuditLog({
      action: "xero.testConnection",
      result: "failed",
      errorMessage: message
    });
    throw error;
  }
}

async function syncEmployees() {
  return syncCollection("employees", "xeroEmployees", "xeroEmployeeID", () => xero.listEmployees());
}

async function syncPayrollCalendars() {
  return syncCollection("payrollCalendars", "payrollCalendars", "payrollCalendarID", () =>
    xero.listPayrollCalendars()
  );
}

async function syncPayItems() {
  return syncCollection("payItems", "payItems", "payItemID", async () => {
    const payItems = await xero.listPayItems();
    const items = Array.isArray(payItems) ? payItems : [payItems];
    return items.map((item, index) => ({
      payItemID: item.payItemID || `pay-item-${index + 1}`,
      name: item.name || "Payroll Pay Items",
      raw: item
    }));
  });
}

async function syncEarningsRates() {
  return syncCollection("earningsRates", "earningsRates", "earningsRateID", () => xero.listEarningsRates());
}

async function syncEverything() {
  await testConnection();
  const results = [];
  results.push(await syncEmployees());
  results.push(await syncPayrollCalendars());
  results.push(await syncPayItems());
  results.push(await syncEarningsRates());
  await store.updateXeroConnection({
    lastSyncAt: new Date().toISOString(),
    apiStatus: "OK",
    lastError: null
  });
  return results;
}

module.exports = {
  syncEarningsRates,
  syncEmployees,
  syncEverything,
  syncPayItems,
  syncPayrollCalendars,
  testConnection
};
