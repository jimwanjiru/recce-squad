export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    public fields?: { path: string; message: string }[],
  ) {
    super(code);
  }
}
let csrf: string | undefined;
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
  retry = true,
): Promise<T> {
  const method = options.method ?? "GET";
  const mutate = !["GET", "HEAD"].includes(method);
  if (mutate && path !== "/auth/login" && !csrf) {
    const token = await api<{ data: { csrfToken: string } }>("/auth/csrf");
    csrf = token.data.csrfToken;
  }
  const response = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    signal: options.signal,
    headers: {
      ...(options.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
      ...(mutate && csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
  const body = response.status === 204 ? undefined : await response.json();
  if (!response.ok) {
    if (body?.error?.code === "CSRF_REJECTED" && retry) {
      csrf = undefined;
      return api(path, options, false);
    }
    if (
      response.status === 401 &&
      path !== "/auth/login" &&
      path !== "/auth/me"
    )
      window.dispatchEvent(new Event("auth-expired"));
    throw new ApiError(
      body?.error?.code ?? "REQUEST_FAILED",
      response.status,
      body?.error?.fields,
    );
  }
  if (path === "/auth/login") csrf = body.data.csrfToken;
  if (path === "/auth/logout") csrf = undefined;
  return body as T;
}
export function message(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === "VALIDATION_ERROR" && error.fields?.length)
      return error.fields
        .map((field) => `${field.path}: ${field.message}`)
        .join(" · ");
    const messages: Record<string, string> = {
      MOVEMENT_WORKFLOW_REQUIRED:
        "This officer already has history. Use the personnel movement approval workflow for subsequent assignments.",
      RANK_BASELINE_REQUIRES_HISTORY_REVIEW:
        "This officer already has rank or movement history. Review that history and use Changes for subsequent rank changes; an initial rank cannot replace it.",
      FUTURE_RANK_BASELINE:
        "An initial verified rank cannot start in the future. Enter the actual confirmed effective date.",
      UNIT_CYCLE: "A unit cannot become its own ancestor.",
      ACTIVE_CHILDREN_EXIST:
        "Deactivate active child units and sub-units first.",
      REFERENCED_HIERARCHY_IMMUTABLE:
        "This hierarchy is referenced by existing records. Reorganization requires a dated, reviewed change.",
      REFERENCED_TAXONOMY_IMMUTABLE:
        "This rank is already referenced. Its code and hierarchy order must be preserved.",
      RANK_ALIAS_CONFLICT: "This spelling is assigned to another rank.",
      DEPLOYMENT_OUTSIDE_ASSIGNMENT:
        "Deployment dates must fit inside the assignment's verified dates.",
      OVERLAPPING_HISTORY: "These dates overlap an existing verified record.",
      OVERLAPPING_ESTABLISHMENT:
        "An approved establishment already covers this rank, scope and period.",
      INVALID_PARENT_UNIT: "Choose an active parent unit.",
      INACTIVE_PARENT_UNIT: "Reactivate the parent unit first.",
      INVALID_CREDENTIALS: "The email or password is incorrect.",
      WORKBOOK_SOURCE_KEY_UNAVAILABLE_OR_INVALID:
        "The workbook source cannot be opened. Restore the matching .local/workbook-import.key from your protected backup.",
      APPROVER_EMAIL_EXISTS:
        "That email is already registered. Use the existing account or choose another approver email.",
      CHANGE_SOURCE_ALREADY_LINKED:
        "This workbook row already has a change record. Refresh the source view to see its status.",
      CHANGE_REVISION_CONFLICT:
        "This change was updated or is no longer editable. Refresh the register.",
      CHANGE_SELF_APPROVAL_FORBIDDEN:
        "A different authorized user must approve this change.",
      VERIFIED_DATE_REQUIRED:
        "Enter and verify the actual effective date. Letter dates are not automatically effective dates.",
      FUTURE_CHANGE_NOT_DUE:
        "This event is future-dated. It must stay submitted until its effective date.",
      BACKDATED_OR_SAME_DAY_CHANGE_REQUIRES_REVIEW:
        "This date conflicts with a later or same-day verified history. Keep the event for retrospective review; no histories were changed.",
      CHANGE_TARGET_RANK_REQUIRED:
        "Choose an active resulting rank before applying a reversion.",
      WORKBOOK_OFFICER_IDENTITY_MISMATCH:
        "The source force number does not match the selected officer.",
      OFFICER_NOT_CURRENTLY_SERVING:
        "This officer has left service. Record a verified taken-on-strength or reinstatement event first.",
      PERMISSION_DENIED: "You do not have permission for this action.",
      RECORD_CHANGED:
        "This record changed since you opened it. Refresh it before trying again.",
      DUPLICATE_RECORD: "That force number is already registered.",
      RESTORE_BEFORE_EDIT: "Restore this archived record before editing it.",
      INVALID_INTERVAL: "The end date must follow the start date.",
      ENLISTMENT_BEFORE_BIRTH: "Enlistment must be after the date of birth.",
      UNIT_JOIN_BEFORE_ENLISTMENT:
        "The unit joining date cannot precede enlistment.",
      FUTURE_PERSONAL_DATE:
        "Birth, enlistment and unit joining dates cannot be in the future.",
      LOGIN_RATE_LIMIT: "Too many sign-in attempts. Please try again later.",
      ORIGIN_REJECTED:
        "The application address does not match the server configuration.",
      SESSION_EXPIRED: "Your session has expired. Please sign in again.",
    };
    return (
      messages[error.code] ??
      "The request could not be completed. Check your entries and try again."
    );
  }
  return "Unable to reach the server. Please try again.";
}
export type User = {
  id: string;
  name: string;
  email: string;
  permissions: string[];
};
export type Officer = {
  id: string;
  forceNumber: string;
  fullName: string;
  recordStatus: string;
  version: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  payrollNumber?: string | null;
  nationalId?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  countyId?: string | null;
  ethnicityId?: string | null;
  phone?: string | null;
  dateEnlisted?: string | null;
  rank1?: string;
  rank2?: string;
  rankSource?: "VERIFIED" | "DATABASE" | "WORKBOOK" | "UNRECORDED";
  specialistDesignation?: string | null;
};
export type Option = {
  id: string;
  name: string;
  code?: string;
  unitId?: string;
};
export type Options = {
  ranks: Option[];
  rankGroups?: string[];
  units: Option[];
  subUnits: Option[];
  counties: Option[];
  ethnicities: Option[];
};
export function dateLabel(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Africa/Nairobi",
      }).format(new Date(value))
    : "Not recorded";
}
