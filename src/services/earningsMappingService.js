const store = require("./store");
const { earningCategories, positions } = require("./payrollConfig");

function normalizeMappings(input) {
  return earningCategories.reduce((result, category) => {
    result[category.key] = input[category.key] || "";
    return result;
  }, {});
}

async function listPayrollSettings() {
  const [positionMappings, employeeOverrides, staff, earningsRates] = await Promise.all([
    store.listPositionMappings(),
    store.listEmployeeOverrides(),
    store.listStaff(),
    store.listCollection("earningsRates")
  ]);
  const positionByName = new Map(positionMappings.map((mapping) => [mapping.position, mapping]));
  const overridesByStaffId = new Map(employeeOverrides.map((override) => [override.staffId, override]));

  return {
    positions: positions.map((position) => ({
      position,
      mapping: positionByName.get(position) || { position, earningsMappings: {} }
    })),
    staff: staff.map((profile) => ({
      ...profile,
      override: overridesByStaffId.get(profile.id) || { staffId: profile.id, earningsMappings: {} }
    })),
    earningsRates
  };
}

async function savePositionMapping(position, body) {
  if (!positions.includes(position)) {
    throw new Error("Unknown position.");
  }
  const mapping = await store.upsertPositionMapping({
    position,
    earningsMappings: normalizeMappings(body)
  });
  await store.addAuditLog({
    action: "positionMapping.save",
    result: "success",
    referenceIds: { position }
  });
  return mapping;
}

async function saveEmployeeOverride(staffId, body) {
  const staff = await store.findStaff(staffId);
  if (!staff) throw new Error("Unknown staff profile.");
  const override = await store.upsertEmployeeOverride({
    staffId,
    earningsMappings: normalizeMappings(body)
  });
  await store.addAuditLog({
    action: "employeeOverride.save",
    result: "success",
    referenceIds: { staffId }
  });
  return override;
}

async function resolveMappingsForStaff(staff) {
  const [positionMappings, override] = await Promise.all([
    store.listPositionMappings(),
    store.findEmployeeOverride(staff.id)
  ]);
  const positionMapping = positionMappings.find((mapping) => mapping.position === staff.position);
  const defaults = positionMapping ? positionMapping.earningsMappings || {} : {};
  const overrides = override ? override.earningsMappings || {} : {};

  return earningCategories.reduce((result, category) => {
    result[category.key] = overrides[category.key] || defaults[category.key] || "";
    return result;
  }, {});
}

module.exports = {
  listPayrollSettings,
  resolveMappingsForStaff,
  saveEmployeeOverride,
  savePositionMapping
};
