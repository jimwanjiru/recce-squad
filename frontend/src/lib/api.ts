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
      INVALID_CREDENTIALS: "The email or password is incorrect.",
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
};
export type Option = {
  id: string;
  name: string;
  code?: string;
  unitId?: string;
};
export type Options = {
  ranks: Option[];
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
