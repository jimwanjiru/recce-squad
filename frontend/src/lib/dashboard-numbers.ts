// API responses can omit newer metrics when an older server is still running.
// Missing figures are unknown, not zero; never call number methods on them.
export const isDashboardNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
export const dashboardNumber = (value: unknown): string =>
  isDashboardNumber(value) ? value.toLocaleString("en-GB") : "Unavailable";
export const dashboardGap = (value: unknown): string =>
  !isDashboardNumber(value)
    ? "Unavailable"
    : (value > 0 ? "+" : "") + dashboardNumber(value);
