require("dotenv").config();

const config = {
  port: Number(process.env.PORT || 3000),
  sessionSecret: process.env.SESSION_SECRET || "dev-session-secret",
  xero: {
    clientId: process.env.XERO_CLIENT_ID,
    clientSecret: process.env.XERO_CLIENT_SECRET,
    tenantId: process.env.XERO_TENANT_ID || "",
    timesheetStatus: process.env.XERO_TIMESHEET_STATUS || "Draft",
    defaultAccountCode: process.env.XERO_DEFAULT_ACCOUNT_CODE,
    defaultTaxType: process.env.XERO_DEFAULT_TAX_TYPE
  }
};

function assertConfig() {
  const missing = [];
  if (!config.xero.clientId) missing.push("XERO_CLIENT_ID");
  if (!config.xero.clientSecret) missing.push("XERO_CLIENT_SECRET");
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

module.exports = { config, assertConfig };
