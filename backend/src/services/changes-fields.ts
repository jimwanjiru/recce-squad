import { sensitiveFields } from "../config/permissions.js";
export const changeTypes = [
  "TRANSFER_OUT",
  "DEATH",
  "RESIGNATION",
  "RETIREMENT",
  "STRUCK_OFF_STRENGTH",
  "TAKEN_ON_STRENGTH",
  "DISMISSAL",
  "SUSPENSION",
  "REINSTATEMENT",
  "REVERSION",
  "SUB_UNIT_TRANSFER",
] as const;
export const changeLabels: Record<string, string> = {
  TRANSFER_OUT: "Transfer out",
  DEATH: "Death",
  RESIGNATION: "Resignation",
  RETIREMENT: "Retirement",
  STRUCK_OFF_STRENGTH: "Struck off strength",
  TAKEN_ON_STRENGTH: "Taken on strength",
  DISMISSAL: "Dismissal",
  SUSPENSION: "Suspension",
  REINSTATEMENT: "Reinstatement",
  REVERSION: "Reversion",
  SUB_UNIT_TRANSFER: "Sub-unit transfer",
};
export const serviceExitStatuses = [
  "TRANSFERRED_OUT",
  "DECEASED",
  "RESIGNED",
  "RETIRED",
  "STRUCK_OFF_STRENGTH",
  "DISMISSED",
];
export const changeStatuses: Record<string, string> = {
  TRANSFER_OUT: "TRANSFERRED_OUT",
  DEATH: "DECEASED",
  RESIGNATION: "RESIGNED",
  RETIREMENT: "RETIRED",
  STRUCK_OFF_STRENGTH: "STRUCK_OFF_STRENGTH",
  TAKEN_ON_STRENGTH: "ACTIVE",
  DISMISSAL: "DISMISSED",
  SUSPENSION: "SUSPENDED",
  REINSTATEMENT: "ACTIVE",
};
export function columnLetter(n: number) {
  let result = "";
  while (n > 0) {
    n--;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}
export function changeColumns(type?: string) {
  if (type === "TRANSFER_OUT")
    return [
      [1, "S/NO"],
      [2, "Force number"],
      [3, "Rank 1"],
      [4, "Rank 2"],
      [5, "Name"],
      [6, "Station"],
      [7, "Sub-unit"],
      [8, "Transferred to"],
      [9, "GSU letter / signal reference"],
      [10, "GSU reference date"],
      [11, "Change type"],
      [14, "KPS letter / signal reference"],
      [15, "KPS reference date"],
    ].map(([column, label]) => ({
      column: Number(column),
      letter: columnLetter(Number(column)),
      label: String(label),
    }));
  const headers: Record<number, string> = {
    1: "Source serial",
    2: "Force number",
    3: "Rank 1",
    4: "Rank 2",
    5: "Name",
    6: "Station",
    7: "Sub-unit",
    11: "Change type",
  };
  if (type === "TRANSFER_OUT")
    Object.assign(headers, {
      8: "Transferred to",
      9: "GSU letter / signal reference",
      10: "GSU reference date",
      14: "KPS letter / signal reference",
      15: "KPS reference date",
    });
  else if (type === "DEATH")
    Object.assign(headers, {
      8: "Date of death",
      9: "Place of death",
      10: "Cause of death",
    });
  else if (type === "RESIGNATION" || type === "RETIREMENT")
    Object.assign(headers, {
      8: "Effective date",
      9: "Approval letter reference",
      10: "Notice",
    });
  else if (type === "STRUCK_OFF_STRENGTH")
    Object.assign(headers, {
      8: "Desertion date",
      9: "Our reference",
      10: "Struck-off-strength signal",
    });
  else if (
    [
      "TAKEN_ON_STRENGTH",
      "REINSTATEMENT",
      "REVERSION",
      "SUB_UNIT_TRANSFER",
    ].includes(type || "")
  )
    Object.assign(headers, {
      8: "Remarks",
      9: "Signal / letter reference",
      10: "Reference date",
      12: "Reinstated / reverted / transferred into sub-unit",
    });
  else if (type === "DISMISSAL" || type === "SUSPENSION")
    Object.assign(headers, {
      8:
        type === "DISMISSAL"
          ? "Dismissal with effect from"
          : "Suspension with effect from",
      9: "Our reference",
      10: "Reference date",
    });
  return Object.entries(headers)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([column, label]) => ({
      column: Number(column),
      letter: columnLetter(Number(column)),
      label,
    }));
}
// CHANGES has varying section layouts, including free text in otherwise sensitive columns.
export function changePermission(
  grants: Set<string>,
  action: "view" | "write",
) {
  return (
    grants.has("officers.view") &&
    Object.values(sensitiveFields).every((field) =>
      grants.has(`fields.${field}.${action}`),
    )
  );
}
export function sourceChangeType(row: number) {
  if (row >= 6 && row <= 8) return "TRANSFER_OUT";
  if (row >= 13 && row <= 14) return "DEATH";
  if (row === 17) return "RETIREMENT";
  if (row === 21) return "STRUCK_OFF_STRENGTH";
  if (row >= 25 && row <= 26) return "TAKEN_ON_STRENGTH";
  if (row === 30) return "DISMISSAL";
  if (row >= 34 && row <= 37) return "SUSPENSION";
  return null;
}

export function changeTypeValue(type: string) {
  return type === "TRANSFER_OUT" || type === "SUB_UNIT_TRANSFER"
    ? "Transfer"
    : changeLabels[type] || type;
}
export function rawChangeColumns() {
  return Array.from({ length: 38 }, (_, i) => ({
    column: i + 1,
    letter: columnLetter(i + 1),
    label: i === 6 ? "Sub-unit" : "Original source column",
  }));
}
