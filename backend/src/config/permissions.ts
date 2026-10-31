// Permission existence never grants access: only explicit persisted role membership does.
export const basePermissions = [
  "officers.view",
  "officers.create",
  "officers.update",
  "officers.archive",
  "officers.restore",
  "movements.create",
  "movements.approve",
  "reports.view",
  "reports.export",
  "users.manage",
  "roles.manage",
  "audit_logs.view",
  "imports.preview",
  "imports.commit",
  "policies.manage",
  "organization.view",
  "ranks.manage",
  "units.manage",
  "sub_units.manage",
  "assignments.baseline.manage",
  "establishments.view",
  "establishments.manage",
] as const;
export const sensitiveFields = {
  payrollNumber: "payroll_number",
  nationalId: "national_id",
  dateOfBirth: "date_of_birth",
  gender: "gender",
  countyId: "county",
  ethnicityId: "ethnicity",
  phone: "phone",
  dateEnlisted: "date_enlisted",
  deployments: "deployment_records",
  movementDocuments: "movement_documents",
  financialDetail: "financial_details",
  disciplinaryRecords: "disciplinary_records",
  education: "education",
  courses: "courses",
  examinations: "examinations",
  awards: "awards",
  serviceProfile: "service_profile",
  assignments: "assignments",
  rankHistories: "rank_history",
  statusHistories: "status_history",
  movements: "personnel_movements",
  importRows: "import_source",
} as const;
export const permissions = [
  ...basePermissions,
  ...Object.values(sensitiveFields).flatMap((field) =>
    ["view", "write", "export"].map((action) => `fields.${field}.${action}`),
  ),
];
export function fieldPermission(
  field: keyof typeof sensitiveFields,
  action: "view" | "write" | "export",
) {
  return `fields.${sensitiveFields[field]}.${action}`;
}
export function permittedOfficerSelect(
  grants: ReadonlySet<string>,
  mode: "view" | "export" = "view",
) {
  const select: Record<string, boolean> = {
    id: true,
    forceNumber: true,
    fullName: true,
    recordStatus: true,
    verificationStatus: true,
    verifiedAt: true,
    createdAt: true,
    updatedAt: true,
  };
  // Relations require separate, paginated services; never include raw imports or encrypted finance in profiles.
  for (const key of [
    "payrollNumber",
    "nationalId",
    "dateOfBirth",
    "gender",
    "countyId",
    "ethnicityId",
    "phone",
  ] as const) {
    if (
      grants.has(fieldPermission(key, "view")) &&
      (mode === "view" || grants.has(fieldPermission(key, "export")))
    )
      select[key] = true;
  }
  if (
    grants.has("fields.assignments.view") &&
    (mode === "view" || grants.has("fields.assignments.export"))
  )
    select.assignedDuties = true;
  return select;
}
