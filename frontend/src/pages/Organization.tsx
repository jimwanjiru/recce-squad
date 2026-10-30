import { GroupRosters } from "../components/GroupRosters";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import {
  Building2,
  Plus,
  Pencil,
  Power,
  GitBranch,
  Search,
  ShieldCheck,
  SpellCheck,
} from "lucide-react";
import { api, dateLabel, Officer, Option } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import {
  Confirm,
  Empty,
  ErrorNotice,
  Loading,
  SearchSelect,
} from "../components/shared";
type Kind =
  | "ranks"
  | "units"
  | "sub-units"
  | "assignments"
  | "deployments"
  | "establishments";
type Ref = Option & { parentUnitId?: string | null };
type RecordRow = {
  id: string;
  code?: string;
  name?: string;
  isActive?: boolean;
  hierarchyLevel?: number;
  updatedAt?: string;
  unitId?: string;
  subUnitId?: string | null;
  parentUnitId?: string | null;
  parentUnit?: Ref | null;
  unit?: Ref;
  subUnit?: Ref | null;
  rank?: Ref;
  rankId?: string;
  aliases?: { id: string; alias: string }[];
  officer?: Officer;
  assignment?: {
    id: string;
    officer: Officer;
    unit: Ref;
    subUnit?: Ref | null;
  };
  authorizedStrength?: number;
  deploymentStatus?: string;
  locationLabel?: string | null;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  datesVerifiedAt?: string;
  dutyTitle?: string | null;
};
const tabs: {
  key: Kind;
  label: string;
  read: string;
  write: string;
  extraRead?: string;
}[] = [
  {
    key: "ranks",
    label: "Ranks",
    read: "organization.view",
    write: "ranks.manage",
  },
  {
    key: "units",
    label: "Units",
    read: "organization.view",
    write: "units.manage",
  },
  {
    key: "sub-units",
    label: "Sub-units",
    read: "organization.view",
    write: "sub_units.manage",
  },
  {
    key: "assignments",
    label: "Assignments",
    read: "fields.assignments.view",
    write: "assignments.baseline.manage",
    extraRead: "officers.view",
  },
  {
    key: "deployments",
    label: "Deployments",
    read: "fields.deployment_records.view",
    write: "fields.deployment_records.write",
    extraRead: "officers.view",
  },
  {
    key: "establishments",
    label: "Establishments",
    read: "establishments.view",
    write: "establishments.manage",
  },
];
export function Organization() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const allowed = [
    "organization.view",
    "officers.view",
    "fields.import_source.view",
    "fields.assignments.view",
    "fields.rank_history.view",
    "fields.service_profile.view",
  ].every((p) => can(p));
  const showGroups =
    allowed && params.get("view") !== "manage" && !params.has("tab");
  return (
    <>
      {allowed && (
        <div
          className="organization-view-switch"
          role="tablist"
          aria-label="Organization views"
        >
          <button
            role="tab"
            aria-selected={showGroups}
            onClick={() => setParams({ view: "groups" })}
          >
            Groups and officers
          </button>
          <button
            role="tab"
            aria-selected={!showGroups}
            onClick={() => setParams({ view: "manage" })}
          >
            Reference and history
          </button>
        </div>
      )}
      {showGroups ? <GroupRosters /> : <OrganizationManagement />}
    </>
  );
}
function OrganizationManagement() {
  const { can } = useAuth();
  const cache = useQueryClient();
  const [params, setParams] = useSearchParams();
  const available = tabs.filter(
    (t) =>
      can(t.read) &&
      (!t.extraRead || can(t.extraRead)) &&
      (t.key !== "deployments" || can("fields.assignments.view")),
  );
  const kind = (
    available.find((t) => t.key === params.get("tab")) ?? available[0]
  )?.key;
  const config = available.find((t) => t.key === kind);
  const dated =
    kind === "assignments" ||
    kind === "deployments" ||
    kind === "establishments";
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [asOf, setAsOf] = useState("");
  const [active, setActive] = useState("all");
  const [form, setForm] = useState<{
    mode: "create" | "edit" | "alias" | "close";
    row?: RecordRow;
  } | null>(null);
  const [toggle, setToggle] = useState<RecordRow | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    setPage(1);
    setSearch("");
    setAsOf("");
    setActive("all");
    setForm(null);
    setToggle(null);
  }, [kind]);
  const query = new URLSearchParams({
    page: String(page),
    pageSize: "25",
    ...(search ? { q: search } : {}),
    ...(dated ? (asOf ? { asOf } : {}) : { active }),
  });
  const records = useQuery({
    queryKey: ["organization", kind, query.toString()],
    queryFn: ({ signal }) =>
      api<{
        data: RecordRow[];
        meta: { total: number; page: number; pageSize: number };
      }>("/" + kind + "?" + query, { signal }),
    enabled: Boolean(kind),
  });
  const canWrite = Boolean(
    config &&
    can(config.write) &&
    (kind !== "assignments" || can("fields.assignments.write")) &&
    (kind !== "deployments" || can("fields.assignments.view")) &&
    can("organization.view"),
  );
  const changed = () => {
    void cache.invalidateQueries({ queryKey: ["organization"] });
    void cache.invalidateQueries({ queryKey: ["organization-options"] });
    void cache.invalidateQueries({ queryKey: ["officer-options"] });
    void cache.invalidateQueries({ queryKey: ["officer-section"] });
    void cache.invalidateQueries({ queryKey: ["officers"] });
    void cache.invalidateQueries({ queryKey: ["officer"] });
    setNotice(
      "Organization record saved. Existing service history is preserved.",
    );
  };
  const activation = useMutation({
    mutationFn: (row: RecordRow) => {
      const expected =
        kind === "ranks"
          ? { expectedUpdatedAt: row.updatedAt }
          : kind === "units"
            ? {
                expectedCode: row.code,
                expectedName: row.name,
                expectedIsActive: row.isActive,
                expectedParentUnitId: row.parentUnitId ?? null,
              }
            : {
                expectedCode: row.code,
                expectedName: row.name,
                expectedIsActive: row.isActive,
              };
      return api("/" + kind + "/" + row.id, {
        method: "PATCH",
        body: { ...expected, isActive: !row.isActive },
      });
    },
    onSuccess: () => {
      setToggle(null);
      changed();
    },
  });
  if (!kind)
    return (
      <section className="card panel-padding">
        <h1>Organization access not assigned</h1>
        <p className="muted">
          Your administrator can grant the relevant organization permissions.
        </p>
      </section>
    );
  const rows = records.data?.data ?? [],
    total = records.data?.meta.total ?? 0;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ORGANIZATION & STRUCTURE</p>
          <h1>Organization</h1>
          <p className="muted">
            Maintain reference values and verified organizational records.
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setForm({ mode: "create" })}>
            <Plus size={17} />
            {kind === "assignments"
              ? "Add verified baseline"
              : kind === "establishments"
                ? "Record approved establishment"
                : `Add ${kind === "sub-units" ? "sub-unit" : kind === "ranks" ? "rank" : kind === "units" ? "unit" : "deployment"}`}
          </Button>
        )}
      </div>
      {notice && (
        <div className="notice success" role="status">
          {notice}
          <button
            onClick={() => setNotice("")}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}
      <div className="organization-banner">
        <GitBranch size={22} />
        <div>
          <strong>Keep structure and service history consistent</strong>
          <p>
            {kind === "assignments"
              ? "Only an officer’s first verified assignment can be added here. Later changes belong to the personnel movement approval workflow."
              : kind === "establishments"
                ? "Record only staffing establishments already approved by the responsible authority. These values do not activate strength or promotion policies."
                : kind === "deployments"
                  ? "Deployment classifications do not determine nominal or operational inclusion. Record source-verified dates and classifications."
                  : "Enter reviewed codes and names. Deactivation stops new selections while preserving historical references."}
          </p>
        </div>
      </div>
      <div className="organization-tabs" aria-label="Organization modules">
        {available.map((t) => (
          <button
            key={t.key}
            aria-current={kind === t.key ? "page" : undefined}
            onClick={() => setParams({ tab: t.key })}
          >
            {t.label}
          </button>
        ))}
      </div>
      <section className="card">
        <div className="table-toolbar">
          {kind === "establishments" ? (
            <div className="toolbar-caption">
              <Building2 size={18} /> Approved staffing by rank and scope
            </div>
          ) : (
            <div className="search-field">
              <Search size={18} />
              <input
                aria-label="Search organization records"
                placeholder={
                  dated
                    ? "Search officer name or force number…"
                    : "Search code or name…"
                }
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          )}
          <div className="organization-filters">
            {dated ? (
              <label>
                Reporting date
                <input
                  type="date"
                  aria-label="Reporting date"
                  value={asOf}
                  onChange={(e) => {
                    setAsOf(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
            ) : (
              <select
                aria-label="Reference state"
                value={active}
                onChange={(e) => {
                  setActive(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All records</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            )}
          </div>
        </div>
        {records.isPending ? (
          <Loading />
        ) : records.error ? (
          <div className="panel-padding">
            <ErrorNotice error={records.error} />
            <Button variant="outline" onClick={() => void records.refetch()}>
              Try again
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <Empty
            title="No matching organization records"
            description={
              dated
                ? "Verified records will appear here for the selected reporting date."
                : "Add reviewed reference values when your organization confirms them."
            }
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>
                    {dated
                      ? kind === "establishments"
                        ? "Rank & scope"
                        : "Officer"
                      : "Code & name"}
                  </th>
                  <th>
                    {kind === "ranks"
                      ? "Order / spellings"
                      : kind === "units"
                        ? "Parent unit"
                        : kind === "sub-units"
                          ? "Unit"
                          : kind === "deployments"
                            ? "Classification"
                            : kind === "establishments"
                              ? "Authorized strength"
                              : "Assignment"}
                  </th>
                  <th>{dated ? "Effective dates" : "State"}</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong className="organization-name">
                        {dated
                          ? kind === "establishments"
                            ? `${row.rank?.code} · ${row.unit?.name}`
                            : (row.officer ?? row.assignment?.officer)?.fullName
                          : `${row.code} · ${row.name}`}
                      </strong>
                      <span className="organization-secondary">
                        {dated
                          ? kind === "establishments"
                            ? (row.subUnit?.name ?? "Whole unit")
                            : (row.officer ?? row.assignment?.officer)
                                ?.forceNumber
                          : kind === "ranks"
                            ? "Rank reference"
                            : "Organization reference"}
                      </span>
                    </td>
                    <td>
                      {kind === "ranks" ? (
                        <>
                          <span>Order {row.hierarchyLevel}</span>
                          <span className="organization-secondary">
                            {row.aliases?.map((a) => a.alias).join(", ") ||
                              "No additional spellings"}
                          </span>
                        </>
                      ) : kind === "units" ? (
                        (row.parentUnit?.name ?? "Top-level unit")
                      ) : kind === "sub-units" ? (
                        row.unit?.name
                      ) : kind === "deployments" ? (
                        <>
                          {row.deploymentStatus}
                          <span className="organization-secondary">
                            {row.locationLabel ?? "No location label"}
                          </span>
                        </>
                      ) : kind === "establishments" ? (
                        row.authorizedStrength
                      ) : (
                        <>
                          {row.unit?.name}
                          <span className="organization-secondary">
                            {row.subUnit?.name ?? "No sub-unit"}
                            {row.dutyTitle ? ` · ${row.dutyTitle}` : ""}
                          </span>
                        </>
                      )}
                    </td>
                    <td>
                      {dated ? (
                        <>
                          <span>{dateLabel(row.effectiveFrom)}</span>
                          <span className="organization-secondary">
                            {row.effectiveTo
                              ? `Until ${dateLabel(row.effectiveTo)}`
                              : "Open-ended"}
                          </span>
                        </>
                      ) : (
                        <span
                          className={`badge ${row.isActive ? "blue" : "neutral"}`}
                        >
                          {row.isActive ? "Active" : "Inactive"}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="organization-actions">
                        {canWrite && !dated && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Edit ${row.code}`}
                              onClick={() => setForm({ mode: "edit", row })}
                            >
                              <Pencil size={15} />
                            </Button>
                            {kind === "ranks" && row.isActive && (
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Add spelling for ${row.code}`}
                                onClick={() => setForm({ mode: "alias", row })}
                              >
                                <SpellCheck size={16} />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`${row.isActive ? "Deactivate" : "Reactivate"} ${row.code}`}
                              onClick={() => {
                                activation.reset();
                                setToggle(row);
                              }}
                            >
                              <Power size={15} />
                            </Button>
                          </>
                        )}
                        {canWrite &&
                          dated &&
                          kind !== "assignments" &&
                          !row.effectiveTo && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setForm({ mode: "close", row })}
                            >
                              Close interval
                            </Button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <span>
            {total} records{asOf ? ` · As of ${dateLabel(asOf)}` : ""}
          </span>
          <div>
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span>Page {page}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={page * 25 >= total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </section>
      <p className="privacy-note">
        <ShieldCheck size={14} /> No personnel policy is inferred from these
        records.
      </p>
      {form && (
        <OrganizationForm
          kind={kind}
          {...form}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            changed();
          }}
        />
      )}
      <Confirm
        open={Boolean(toggle)}
        onOpenChange={(open) => {
          if (!open) setToggle(null);
        }}
        title={`${toggle?.isActive ? "Deactivate" : "Reactivate"} this reference?`}
        description={
          toggle?.isActive
            ? "Existing histories remain intact. Inactive references cannot be used for new records."
            : "This reference will become available for new records. Its historical associations remain unchanged."
        }
        pending={activation.isPending}
        error={activation.error}
        onConfirm={() => {
          if (toggle) activation.mutate(toggle);
        }}
      />
    </>
  );
}
function OrganizationForm({
  kind,
  mode,
  row,
  onClose,
  onSaved,
}: {
  kind: Kind;
  mode: "create" | "edit" | "alias" | "close";
  row?: RecordRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { can } = useAuth();
  const [fields, setFields] = useState<Record<string, string>>({
    code: row?.code ?? "",
    name: row?.name ?? "",
    hierarchyLevel: String(row?.hierarchyLevel ?? ""),
    parentUnitId: row?.parentUnitId ?? "",
    unitId: row?.unitId ?? "",
    subUnitId: row?.subUnitId ?? "",
    rankId: row?.rankId ?? "",
    officerId: "",
    assignmentId: "",
    effectiveFrom: "",
    effectiveTo: "",
    deploymentStatus: "",
    locationLabel: "",
    authorizedStrength: "",
    alias: "",
    dutyTitle: "",
    remarks: "",
  });
  const [verified, setVerified] = useState(false),
    [approved, setApproved] = useState(false),
    [search, setSearch] = useState("");
  const [clientError, setClientError] = useState("");
  const options = useQuery({
    queryKey: ["organization-options"],
    queryFn: () =>
      api<{ data: { ranks: Ref[]; units: Ref[]; subUnits: Ref[] } }>(
        "/organization/options",
      ),
  });
  const officers = useQuery({
    queryKey: ["organization-officer-picker", search],
    queryFn: () =>
      api<{ data: Officer[] }>(
        "/officers?pageSize=20&q=" + encodeURIComponent(search),
      ),
    enabled:
      kind === "assignments" && mode === "create" && can("officers.view"),
  });
  const assignments = useQuery({
    queryKey: ["organization-assignment-picker", search],
    queryFn: () =>
      api<{ data: RecordRow[] }>(
        "/assignments?pageSize=100&q=" + encodeURIComponent(search),
      ),
    enabled:
      kind === "deployments" &&
      mode === "create" &&
      can("fields.assignments.view"),
  });
  const set = (key: string, value: string) => {
    setFields((old) => ({
      ...old,
      [key]: value,
      ...(key === "unitId" ? { subUnitId: "" } : {}),
    }));
  };
  const refs = options.data?.data ?? { ranks: [], units: [], subUnits: [] };
  const field = (
    key: string,
    label: string,
    type = "text",
    required = true,
  ) => (
    <div className="form-field" key={key}>
      <label htmlFor={"org-" + key}>
        {label}
        {required && <span className="required"> *</span>}
      </label>
      <input
        id={"org-" + key}
        value={fields[key]}
        onChange={(e) => set(key, e.target.value)}
        type={type}
        required={required}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? 1 : undefined}
        maxLength={type === "text" ? 191 : undefined}
      />
    </div>
  );
  const choice = (
    key: string,
    label: string,
    list: Option[],
    required = true,
  ) => (
    <div className="form-field">
      <label htmlFor={"org-" + key}>
        {label}
        {required && <span className="required"> *</span>}
      </label>
      <SearchSelect
        id={"org-" + key}
        options={list}
        value={fields[key] ?? ""}
        disabled={
          options.isFetching ||
          (key === "officerId" && officers.isFetching) ||
          (key === "assignmentId" && assignments.isFetching)
        }
        onChange={(value) => set(key, value)}
      />
    </div>
  );
  const save = useMutation({
    mutationFn: () => {
      setClientError("");
      let body: Record<string, unknown> = {},
        path = "/" + kind,
        method = "POST";
      if (mode === "alias") {
        body = { alias: fields.alias };
        path += `/${row!.id}/aliases`;
      } else if (mode === "close") {
        if (!verified)
          throw Error("Confirm that the interval end date is verified.");
        body = {
          effectiveTo: fields.effectiveTo,
          expectedVerifiedAt: row!.datesVerifiedAt,
          datesVerified: true,
        };
        path += `/${row!.id}/close`;
      } else if (kind === "ranks") {
        body = {
          code: fields.code,
          name: fields.name,
          hierarchyLevel: Number(fields.hierarchyLevel),
        };
        if (mode === "edit") body.expectedUpdatedAt = row!.updatedAt;
      } else if (kind === "units") {
        body = {
          code: fields.code,
          name: fields.name,
          parentUnitId: fields.parentUnitId || null,
        };
        if (mode === "edit")
          Object.assign(body, {
            expectedCode: row!.code,
            expectedName: row!.name,
            expectedIsActive: row!.isActive,
            expectedParentUnitId: row!.parentUnitId ?? null,
          });
      } else if (kind === "sub-units") {
        body = { code: fields.code, name: fields.name };
        if (mode === "create") {
          if (!fields.unitId) throw Error("Choose a unit from the list.");
          body.unitId = fields.unitId;
        } else
          Object.assign(body, {
            expectedCode: row!.code,
            expectedName: row!.name,
            expectedIsActive: row!.isActive,
          });
      } else {
        if (!verified)
          throw Error("Confirm that the source effective dates are verified.");
        body = {
          effectiveFrom: fields.effectiveFrom,
          effectiveTo: fields.effectiveTo || null,
          datesVerified: true,
        };
        if (kind === "assignments") {
          if (!fields.officerId || !fields.unitId)
            throw Error("Choose an officer and unit from the lists.");
          Object.assign(body, {
            officerId: fields.officerId,
            unitId: fields.unitId,
            subUnitId: fields.subUnitId || null,
            dutyTitle: fields.dutyTitle || null,
            remarks: fields.remarks || null,
          });
        }
        if (kind === "deployments") {
          if (!fields.assignmentId)
            throw Error("Choose an assignment from the list.");
          Object.assign(body, {
            assignmentId: fields.assignmentId,
            deploymentStatus: fields.deploymentStatus,
            locationLabel: fields.locationLabel || null,
            remarks: fields.remarks || null,
          });
        }
        if (kind === "establishments") {
          if (!approved || !fields.unitId || !fields.rankId)
            throw Error(
              "Choose the scope and rank, and confirm the establishment is already approved.",
            );
          Object.assign(body, {
            unitId: fields.unitId,
            subUnitId: fields.subUnitId || null,
            rankId: fields.rankId,
            authorizedStrength: Number(fields.authorizedStrength),
            approvalConfirmed: true,
          });
        }
      }
      if (mode === "edit") {
        path += "/" + row!.id;
        method = "PATCH";
      }
      return api(path, { method, body });
    },
    onSuccess: onSaved,
    onError: (error) => {
      if (error instanceof Error && error.name === "Error")
        setClientError(error.message);
    },
  });
  return (
    <AlertDialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="dialog organization-dialog">
          <AlertDialog.Title>
            {mode === "alias"
              ? "Add original rank spelling"
              : mode === "close"
                ? "Close verified interval"
                : mode === "edit"
                  ? "Edit organization reference"
                  : kind === "establishments"
                    ? "Record approved establishment"
                    : kind === "assignments"
                      ? "Add verified assignment baseline"
                      : "Add organization record"}
          </AlertDialog.Title>
          <AlertDialog.Description>
            {mode === "close"
              ? "Only the verified interval end is recorded. The original dates and details remain unchanged."
              : kind === "assignments"
                ? "This is for an officer’s first verified assignment. Later changes require the personnel movement workflow."
                : kind === "establishments"
                  ? "Record an establishment already approved by the responsible authority. No strength-inclusion rule is activated."
                  : "Enter reviewed reference values and preserve their original meaning."}
          </AlertDialog.Description>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <div className="form-grid">
              {mode === "alias" ? (
                field("alias", "Original rank spelling")
              ) : mode === "close" ? (
                field("effectiveTo", "Verified end date", "date")
              ) : kind === "ranks" ||
                kind === "units" ||
                kind === "sub-units" ? (
                <>
                  {field("code", "Code")}
                  {field("name", "Name")}
                  {kind === "ranks" &&
                    field("hierarchyLevel", "Hierarchy order", "number")}
                  {kind === "units" &&
                    choice(
                      "parentUnitId",
                      "Parent unit",
                      refs.units.filter((u) => u.id !== row?.id),
                      false,
                    )}
                  {kind === "sub-units" &&
                    mode === "create" &&
                    choice("unitId", "Unit", refs.units)}
                </>
              ) : (
                <>
                  {(kind === "assignments" || kind === "deployments") && (
                    <div className="form-field org-span">
                      <label htmlFor="org-officer-search">
                        Find officer by name or force number
                      </label>
                      <input
                        id="org-officer-search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search personnel records…"
                      />
                    </div>
                  )}
                  {kind === "assignments" &&
                    choice(
                      "officerId",
                      "Officer",
                      (officers.data?.data ?? []).map((o) => ({
                        id: o.id,
                        name: o.fullName,
                        code: o.forceNumber,
                      })),
                    )}
                  {kind === "deployments" &&
                    choice(
                      "assignmentId",
                      "Assignment",
                      (assignments.data?.data ?? []).map((a) => ({
                        id: a.id,
                        name: `${a.officer?.fullName} · ${a.unit?.name}${a.subUnit ? ` / ${a.subUnit.name}` : ""}`,
                        code: a.officer?.forceNumber,
                      })),
                    )}
                  {kind !== "deployments" && (
                    <>
                      {choice("unitId", "Unit", refs.units)}
                      {choice(
                        "subUnitId",
                        "Sub-unit",
                        refs.subUnits.filter((s) => s.unitId === fields.unitId),
                        false,
                      )}
                    </>
                  )}
                  {kind === "establishments" && (
                    <>
                      {choice("rankId", "Rank", refs.ranks)}
                      {field(
                        "authorizedStrength",
                        "Approved authorized strength",
                        "number",
                      )}
                    </>
                  )}
                  {kind === "deployments" && (
                    <>
                      {field(
                        "deploymentStatus",
                        "Reviewed deployment classification",
                      )}
                      {field("locationLabel", "Location label", "text", false)}
                    </>
                  )}
                  {kind === "assignments" &&
                    field("dutyTitle", "Duty title", "text", false)}
                  {field("effectiveFrom", "Verified effective date", "date")}
                  {field("effectiveTo", "Verified end date", "date", false)}
                  {kind !== "establishments" &&
                    field("remarks", "Remarks", "text", false)}
                </>
              )}
            </div>
            {(mode === "close" ||
              (mode === "create" &&
                ["assignments", "deployments", "establishments"].includes(
                  kind,
                ))) && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={verified}
                  onChange={(e) => setVerified(e.target.checked)}
                  required
                />
                I have verified these effective dates against an authoritative
                source.
              </label>
            )}
            {mode === "create" && kind === "establishments" && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={approved}
                  onChange={(e) => setApproved(e.target.checked)}
                  required
                />
                This staffing establishment has already been approved by the
                responsible authority.
              </label>
            )}
            {options.error && <ErrorNotice error={options.error} />}{" "}
            {officers.error && <ErrorNotice error={officers.error} />}{" "}
            {assignments.error && <ErrorNotice error={assignments.error} />}{" "}
            {clientError ? (
              <p className="field-error" role="alert">
                {clientError}
              </p>
            ) : (
              save.error && <ErrorNotice error={save.error} />
            )}
            <div className="dialog-actions">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={save.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  save.isPending ||
                  options.isFetching ||
                  officers.isFetching ||
                  assignments.isFetching
                }
              >
                {save.isPending ? "Saving…" : "Save record"}
              </Button>
            </div>
          </form>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
