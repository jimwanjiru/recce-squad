import { dateLabel } from "./api";
const dateColumns = new Set([8, 11, 13, 14, 15, 33]);
export function workbookValue(value: string, column?: number) {
  const code = value.trim().toUpperCase();
  if (column === 20 && code === "MO") return `${value} — Main Office`;
  if (column === 20 && code === "NA")
    return `${value} — Not applicable / not deployed to a team or group`;
  if (column === 22 && code === "R") return `${value} — Recce`;
  if (column !== undefined && !dateColumns.has(column)) return value;
  if (!/^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.000)?Z)?$/.test(value)) return value;
  const date = new Date(value);
  if (
    !Number.isFinite(+date) ||
    date.toISOString().slice(0, 10) !== value.slice(0, 10)
  )
    return value;
  return dateLabel(value);
}
export function reviewTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(+date)) return "Review date unavailable";
  return (
    new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Nairobi",
    }).format(date) + " EAT"
  );
}
