import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, ClipboardList, UserPlus } from "lucide-react";
import { api, dateLabel, Officer } from "../lib/api";
import { workbookValue } from "../lib/workbook-format";
import { Button } from "../components/ui/button";
import { Pagination } from "../components/Pagination";
import { Loading, ErrorNotice, Confirm } from "../components/shared";
type Column = { column: number; letter: string; label: string };
type Type = { code: string; label: string; columns: Column[] };
type Option = { id: string; code: string; name: string; unitId?: string };
type Options = {
  types: Type[];
  sourceColumns: Column[];
  years: number[];
  units: Option[];
  subUnits: Option[];
  ranks: Option[];
  canCreate: boolean;
  canApprove: boolean;
  canManageApprovers: boolean;
  canPrepareReferences: boolean;
  userId: string;
};
type Change = {
  id: string;
  officerId: string;
  eventType: string;
  effectiveDate: string | null;
  status: string;
  revision: number;
  cells: Record<string, string>;
  officer: { id: string; forceNumber: string; fullName: string };
  recordedById: string;
  recordedBy?: { name: string };
  approvedBy?: { name: string } | null;
  targetUnitId?: string | null;
  targetSubUnitId?: string | null;
  targetRankId?: string | null;
  amendsId?: string | null;
};
type Source = {
  id: string;
  row: number;
  cells: Record<string, string>;
  suggestedType: string | null;
  officer: { id: string; forceNumber: string; fullName: string } | null;
  change: { id: string; status: string } | null;
};
type FormState = {
  row?: Change;
  source?: Source;
  amend?: boolean;
  readOnly?: boolean;
  officer?: Change["officer"];
};
const currentYear = () =>
  new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    timeZone: "Africa/Nairobi",
  }).format(new Date());
export function Changes() {
  const cache = useQueryClient(),
    [params, setParams] = useSearchParams();
  const [view, setView] = useState("register"),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(10),
    [search, setSearch] = useState(""),
    [type, setType] = useState("TRANSFER_OUT"),
    [status, setStatus] = useState("");
  const [form, setForm] = useState<FormState | null>(null),
    [details, setDetails] = useState<Change | null>(null),
    [confirm, setConfirm] = useState<{ row: Change; action: string } | null>(
      null,
    ),
    [approver, setApprover] = useState(false),
    [notice, setNotice] = useState("");
  const year = params.get("year") || currentYear();
  const options = useQuery({
    queryKey: ["changes-options"],
    queryFn: () => api<{ data: Options }>("/changes/options"),
  });
  const pickedOfficer = useQuery({
    queryKey: ["changes-officer", params.get("officerId")],
    queryFn: () =>
      api<{ data: Officer }>("/officers/" + params.get("officerId")),
    enabled: params.get("new") === "1" && !!params.get("officerId"),
  });
  useEffect(() => {
    if (
      params.get("new") === "1" &&
      pickedOfficer.data &&
      options.data?.data.canCreate
    ) {
      setForm({ officer: pickedOfficer.data.data });
      setParams({ year });
    }
  }, [params, pickedOfficer.data, options.data, year, setParams]);
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    ...(view === "register"
      ? {
          year,
          ...(type ? { eventType: type } : {}),
          ...(status ? { status } : {}),
          ...(search ? { q: search } : {}),
        }
      : {}),
  });
  const list = useQuery({
    queryKey: ["changes-list", view, query.toString()],
    queryFn: () =>
      api<{
        data: (Change | Source)[];
        meta: { total: number };
        columns: Column[];
      }>("/changes" + (view === "source" ? "/source" : "") + "?" + query),
    enabled: !!options.data,
  });
  const refresh = () => {
    cache.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "session" });
  };
  const examples = useMutation({
    mutationFn: (remove: boolean) =>
      api("/changes/examples" + (remove ? "/remove" : ""), { method: "POST" }),
    onSuccess: () => {
      setNotice(
        "Fictional examples updated. They are drafts only and can be deleted.",
      );
      refresh();
    },
  });
  const references = useMutation({
    mutationFn: () => api("/changes/references", { method: "POST" }),
    onSuccess: () => {
      setNotice(
        "RECCE sub-unit and police-rank references prepared. Existing references were preserved.",
      );
      refresh();
    },
  });
  const action = useMutation({
    mutationFn: ({ row, action }: { row: Change; action: string }) =>
      api("/changes/" + row.id + (action === "delete" ? "" : "/" + action), {
        method: action === "delete" ? "DELETE" : "POST",
        body: {
          revision: row.revision,
          ...(action === "approve" ? { datesVerified: true } : {}),
        },
      }),
    onSuccess: () => {
      setConfirm(null);
      setNotice("Change record updated.");
      refresh();
    },
  });
  if (options.isPending) return <Loading />;
  if (options.error) return <ErrorNotice error={options.error} />;
  const meta = options.data.data,
    columns = list.data?.columns || meta.types[0]!.columns;
  const years = [
    ...new Set([
      Number(currentYear()),
      Number(currentYear()) - 1,
      ...meta.years,
      ...(year !== "undated" ? [Number(year)] : []),
    ]),
  ].sort((a, b) => b - a);
  const rows = list.data?.data || [];
  return (
    <div className="changes-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">PERSONNEL EVENTS</p>
          <h1>Changes</h1>
          <p className="muted">
            Officer-linked events, grouped by effective year. COY is shown as
            Sub-unit.
          </p>
        </div>
        <div className="changes-header-actions">
          {meta.canCreate && (
            <>
              <Button
                variant="outline"
                disabled={examples.isPending}
                onClick={() => examples.mutate(false)}
              >
                Add fictional examples
              </Button>
              <Button
                variant="outline"
                disabled={examples.isPending}
                onClick={() => examples.mutate(true)}
              >
                Remove fictional examples
              </Button>
            </>
          )}
          {meta.canPrepareReferences && (
            <Button
              variant="outline"
              onClick={() => references.mutate()}
              disabled={references.isPending}
            >
              Prepare RECCE references
            </Button>
          )}
          {meta.canManageApprovers && (
            <Button variant="outline" onClick={() => setApprover(true)}>
              <UserPlus size={16} />
              Set up approver
            </Button>
          )}
          {meta.canCreate && (
            <Button onClick={() => setForm({})}>
              <Plus size={16} />
              Record change
            </Button>
          )}
        </div>
      </div>
      {notice && (
        <div className="notice success" role="status">
          {notice}
        </div>
      )}
      {examples.error && <ErrorNotice error={examples.error} />}
      {references.error && <ErrorNotice error={references.error} />}
      <div
        className="analytics-view-tabs"
        role="tablist"
        aria-label="Changes views"
      >
        <button
          role="tab"
          aria-selected={view === "register"}
          onClick={() => {
            setView("register");
            setPage(1);
          }}
        >
          Yearly register
        </button>
        <button
          role="tab"
          aria-selected={view === "source"}
          onClick={() => {
            setView("source");
            setPage(1);
          }}
        >
          Workbook source
        </button>
      </div>
      <div className="notice" role="note">
        An officer must already exist. Drafts can be edited and deleted;
        approval requires a different authorized officer. Approved changes are
        permanent history and can be amended by a linked corrective event.
      </div>
      {view === "register" ? (
        <div className="changes-filters">
          <label>
            Effective year
            <select
              aria-label="Change effective year"
              value={year}
              onChange={(e) => {
                setParams({ year: e.target.value });
                setPage(1);
              }}
            >
              {years.map((y) => (
                <option key={y}>{y}</option>
              ))}
              <option value="undated">
                Undated / awaiting date verification
              </option>
            </select>
          </label>
          <label>
            Event type
            <select
              aria-label="Change event filter"
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All event types</option>
              {meta.types.map((t) => (
                <option value={t.code} key={t.code}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Approval
            <select
              aria-label="Change status filter"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All approval states</option>
              {["DRAFT", "SUBMITTED", "APPLIED"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Find officer
            <input
              aria-label="Search changes"
              placeholder="Force number or name"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>
      ) : (
        <p className="muted">
          All original CHANGES source columns are retained, including headings
          and summaries. Source rows have no verified event year yet. Only
          matching officer-detail rows can become draft changes; choose and
          verify their effective dates before applying them.
        </p>
      )}
      <section className="card">
        <div className="panel-title">
          <h2>
            {view === "source"
              ? "Original workbook CHANGES"
              : year === "undated"
                ? "Undated review queue"
                : "Changes in " + year}
          </h2>
          <ClipboardList size={18} />
        </div>
        <p className="changes-table-note">
          {view === "source"
            ? "Original workbook columns are retained here for provenance."
            : "Transfers out uses the agreed 13 columns. Reference dates remain separate from the effective year."}
        </p>
        {list.isPending ? (
          <Loading />
        ) : list.error ? (
          <ErrorNotice error={list.error} />
        ) : (
          <>
            <div className="table-scroll">
              <table
                className="changes-table"
                aria-label="Changes workbook table"
              >
                <thead>
                  <tr>
                    <th>Actions</th>
                    {view === "register" ? (
                      <>
                        <th>Event</th>
                        <th>Effective date</th>
                        <th>Officer</th>
                        <th>Approval</th>
                      </>
                    ) : (
                      <th>Source row</th>
                    )}
                    {columns.map((c) => (
                      <th key={c.column}>
                        {view === "source" ? c.letter + " · " : ""}
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => {
                    const row = item as Change,
                      source = item as Source;
                    return (
                      <tr key={item.id}>
                        <td className="changes-row-actions">
                          {view === "source" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setForm({
                                  source,
                                  officer: source.officer || undefined,
                                  readOnly: true,
                                })
                              }
                            >
                              View source
                            </Button>
                          )}
                          {view === "source" ? (
                            source.change ? (
                              <span>Linked: {source.change.status}</span>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={
                                  !meta.canCreate ||
                                  !source.officer ||
                                  !source.suggestedType
                                }
                                onClick={() =>
                                  setForm({ source, officer: source.officer! })
                                }
                              >
                                {source.officer && source.suggestedType
                                  ? "Create draft"
                                  : source.suggestedType
                                    ? "Officer not found"
                                    : "Source / summary"}
                              </Button>
                            )
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setDetails(row)}
                              >
                                View
                              </Button>
                              {row.status === "DRAFT" && meta.canCreate && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setForm({ row })}
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      setConfirm({ row, action: "submit" })
                                    }
                                  >
                                    Submit
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="danger"
                                    onClick={() =>
                                      setConfirm({ row, action: "delete" })
                                    }
                                  >
                                    Delete draft
                                  </Button>
                                </>
                              )}
                              {row.status === "SUBMITTED" && meta.canCreate && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setConfirm({ row, action: "return" })
                                  }
                                >
                                  Return to draft
                                </Button>
                              )}
                              {row.status === "SUBMITTED" &&
                                meta.canApprove && (
                                  <Button
                                    size="sm"
                                    disabled={row.recordedById === meta.userId}
                                    onClick={() =>
                                      setConfirm({ row, action: "approve" })
                                    }
                                  >
                                    Approve and apply
                                  </Button>
                                )}
                              {row.status === "APPLIED" && meta.canCreate && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setForm({ row, amend: true })}
                                >
                                  Create amendment
                                </Button>
                              )}
                            </>
                          )}
                        </td>
                        {view === "register" ? (
                          <>
                            <td>
                              {meta.types.find((t) => t.code === row.eventType)
                                ?.label || row.eventType}
                              {row.amendsId && <small>Linked amendment</small>}
                            </td>
                            <td>
                              {row.effectiveDate
                                ? dateLabel(row.effectiveDate)
                                : "Undated"}
                            </td>
                            <td>
                              <Link to={"/officers/" + row.officer.id}>
                                {row.officer.forceNumber} ·{" "}
                                {row.officer.fullName}
                              </Link>
                            </td>
                            <td>
                              <span
                                className={
                                  "change-status change-status-" +
                                  row.status.toLowerCase()
                                }
                              >
                                {row.status}
                              </span>
                              <small>Recorded: {row.recordedBy?.name}</small>
                              {row.approvedBy && (
                                <small>Approved: {row.approvedBy.name}</small>
                              )}
                            </td>
                          </>
                        ) : (
                          <td>{source.row}</td>
                        )}
                        {columns.map((c) => (
                          <td key={c.column}>
                            <div
                              className="change-cell-value"
                              title={item.cells[String(c.column)]}
                            >
                              {view === "register" && c.label === "Change type"
                                ? row.eventType === "TRANSFER_OUT" ||
                                  row.eventType === "SUB_UNIT_TRANSFER"
                                  ? "Transfer"
                                  : meta.types.find(
                                      (t) => t.code === row.eventType,
                                    )?.label || row.eventType
                                : workbookValue(
                                    item.cells[String(c.column)] || "",
                                  ) || "—"}
                            </div>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!rows.length && (
                <p className="panel-padding muted">
                  No changes in this year or filter.
                </p>
              )}
            </div>
            <Pagination
              page={page}
              pageSize={pageSize}
              total={list.data.meta.total}
              onPage={setPage}
              onSize={(size) => {
                setPageSize(size);
                setPage(1);
              }}
              label="Changes pagination"
            />
          </>
        )}
      </section>
      {details && (
        <ChangeDetails
          row={details}
          options={meta}
          close={() => setDetails(null)}
        />
      )}
      {form && (
        <ChangeForm
          state={form}
          options={meta}
          close={() => setForm(null)}
          saved={(savedYear) => {
            setForm(null);
            setView("register");
            setPage(1);
            setParams({ year: String(savedYear) });
            setNotice("Draft saved. No personnel history has been changed.");
            refresh();
          }}
        />
      )}
      {approver && <ApproverForm close={() => setApprover(false)} />}
      <Confirm
        open={!!confirm}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={
          confirm?.action === "approve"
            ? "Approve and apply this change?"
            : confirm?.action === "delete"
              ? "Delete this draft?"
              : confirm?.action === "submit"
                ? "Submit for independent approval?"
                : "Return this record to draft?"
        }
        description={
          confirm?.action === "approve"
            ? "I have verified the effective date and intended officer, status, rank and sub-unit. This applies the dated change atomically; the original officer record and history are retained."
            : confirm?.action === "delete"
              ? "Only this unapplied draft will be deleted. Its source workbook and audit trail remain."
              : "Applied records cannot be edited or deleted. Letter dates are separate from effective dates."
        }
        onConfirm={() => confirm && action.mutate(confirm)}
        pending={action.isPending}
        error={action.error}
      />
    </div>
  );
}
function ChangeDetails({
  row,
  options,
  close,
}: {
  row: Change;
  options: Options;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const officer = useQuery({
    queryKey: ["officer", row.officerId],
    queryFn: () => api<{ data: Officer }>("/officers/" + row.officerId),
  });
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const event = options.types.find((t) => t.code === row.eventType)!;
  const current = officer.data?.data;
  const personalFields: [keyof Officer, string, boolean?][] = [
    ["payrollNumber", "Payroll number"],
    ["nationalId", "National ID"],
    ["dateOfBirth", "Birth date", true],
    ["gender", "Gender"],
    ["phone", "Phone"],
    ["dateEnlisted", "Enlistment date", true],
  ];
  const changeType =
    row.eventType === "TRANSFER_OUT" || row.eventType === "SUB_UNIT_TRANSFER"
      ? "Transfer"
      : event.label;
  const dismiss = () => {
    dialog.current?.close();
    close();
  };
  return (
    <dialog
      ref={dialog}
      className="changes-dialog changes-details-dialog"
      aria-label="Officer change details"
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
    >
      <div className="changes-dialog-heading">
        <h2>
          {event.label} — {row.officer.fullName}
        </h2>
        <Button variant="outline" onClick={dismiss}>
          Close
        </Button>
      </div>
      <section aria-label="Change summary">
        <h3>Change summary</h3>
        <dl className="detail-grid">
          <div>
            <dt>Change type</dt>
            <dd>{event.label}</dd>
          </div>
          <div>
            <dt>Approval status</dt>
            <dd>{row.status}</dd>
          </div>
          <div>
            <dt>Effective date</dt>
            <dd>{dateLabel(row.effectiveDate)}</dd>
          </div>
          <div>
            <dt>Effective year</dt>
            <dd>
              {row.effectiveDate?.slice(0, 4) ||
                "Undated — awaiting date verification"}
            </dd>
          </div>
          <div>
            <dt>Recorded by</dt>
            <dd>{row.recordedBy?.name || "Not recorded"}</dd>
          </div>
          <div>
            <dt>Approved by</dt>
            <dd>{row.approvedBy?.name || "Not yet approved"}</dd>
          </div>
          {row.targetUnitId && (
            <div>
              <dt>Receiving unit</dt>
              <dd>
                {options.units.find((u) => u.id === row.targetUnitId)?.name ||
                  "Reference unavailable"}
              </dd>
            </div>
          )}
          {row.targetSubUnitId && (
            <div>
              <dt>Receiving sub-unit</dt>
              <dd>
                {options.subUnits.find((s) => s.id === row.targetSubUnitId)
                  ?.name || "Reference unavailable"}
              </dd>
            </div>
          )}
          {row.targetRankId && (
            <div>
              <dt>Resulting rank</dt>
              <dd>
                {options.ranks.find((r) => r.id === row.targetRankId)?.name ||
                  "Reference unavailable"}
              </dd>
            </div>
          )}
        </dl>
      </section>
      <section aria-label="Officer details">
        <h3>Officer details</h3>
        <p>
          Current registered details. The details recorded with this change are
          shown below.
        </p>
        {officer.isPending && <Loading />}
        {officer.error && <ErrorNotice error={officer.error} />}
        {current && (
          <dl className="detail-grid">
            <div>
              <dt>Force number</dt>
              <dd>{current.forceNumber}</dd>
            </div>
            <div>
              <dt>Name</dt>
              <dd>{current.fullName}</dd>
            </div>
            <div>
              <dt>Personnel status</dt>
              <dd>{current.recordStatus.replaceAll("_", " ")}</dd>
            </div>
            <div>
              <dt>Record state</dt>
              <dd>{current.deletedAt ? "Archived" : "Not archived"}</dd>
            </div>
            {personalFields
              .filter(([key]) => key in current)
              .map(([key, label, date]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>
                    {date
                      ? dateLabel(current[key] as string | null)
                      : String(current[key] || "Not recorded")}
                  </dd>
                </div>
              ))}
          </dl>
        )}
        <p>
          <Link to={"/officers/" + row.officerId}>
            Open full officer record
          </Link>
        </p>
      </section>
      <section aria-label="Recorded change details">
        <h3>Recorded change details</h3>
        <dl className="detail-grid">
          {event.columns.map((c) => (
            <div key={c.column}>
              <dt>{c.label}</dt>
              <dd>
                {c.label === "Change type"
                  ? changeType
                  : workbookValue(row.cells[String(c.column)] || "") ||
                    "Not recorded"}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <div className="changes-dialog-actions">
        <Button variant="outline" onClick={dismiss}>
          Done
        </Button>
      </div>
    </dialog>
  );
}
function ChangeForm({
  state,
  options,
  close,
  saved,
}: {
  state: FormState;
  options: Options;
  close: () => void;
  saved: (year: string | number) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    initial = state.row;
  const [officer, setOfficer] = useState<Change["officer"] | null>(
      state.officer || initial?.officer || null,
    ),
    [search, setSearch] = useState("");
  const [type, setType] = useState(
      initial?.eventType ||
        state.source?.suggestedType ||
        options.types[0]!.code,
    ),
    [date, setDate] = useState(
      state.amend ? "" : initial?.effectiveDate?.slice(0, 10) || "",
    );
  const [cells, setCells] = useState<Record<string, string>>({
    ...initial?.cells,
    ...state.source?.cells,
    "2":
      (state.officer || initial?.officer)?.forceNumber ||
      state.source?.cells["2"] ||
      "",
    "5":
      state.source?.cells["5"] ||
      initial?.cells["5"] ||
      (state.officer || initial?.officer)?.fullName ||
      "",
  });
  const [unit, setUnit] = useState(initial?.targetUnitId || ""),
    [sub, setSub] = useState(initial?.targetSubUnitId || ""),
    [rank, setRank] = useState(initial?.targetRankId || "");
  const lookup = useQuery({
    queryKey: ["change-officer-search", search],
    queryFn: () =>
      api<{ data: Officer[] }>(
        "/officers?archive=active&pageSize=25&q=" + encodeURIComponent(search),
      ),
    enabled: !initial && !state.source && !state.officer,
  });
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const mutation = useMutation({
    mutationFn: () => {
      if (!officer) throw new Error("Select an existing officer first.");
      const body = {
        officerId: officer.id,
        eventType: type,
        effectiveDate: date || null,
        cells: { ...cells, "2": officer.forceNumber },
        targetUnitId: unit || null,
        targetSubUnitId: sub || null,
        targetRankId: rank || null,
        ...(state.source ? { sourceImportRowId: state.source.id } : {}),
        ...(state.amend ? { amendsId: initial!.id } : {}),
        ...(initial && !state.amend ? { revision: initial.revision } : {}),
      };
      return api<{ data: { year?: string | number } }>(
        "/changes" + (initial && !state.amend ? "/" + initial.id : ""),
        { method: initial && !state.amend ? "PATCH" : "POST", body },
      );
    },
    onSuccess: () => saved(date ? Number(date.slice(0, 4)) : "undated"),
  });
  const columns =
      state.source && state.readOnly
        ? options.sourceColumns
        : options.types.find((t) => t.code === type)!.columns,
    readOnly = state.readOnly;
  return (
    <dialog
      ref={dialog}
      className="changes-dialog"
      aria-label="Officer change record"
      onCancel={(e) => {
        if (mutation.isPending) e.preventDefault();
        else close();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="changes-dialog-heading">
          <h2>
            {state.amend
              ? "New corrective amendment"
              : initial
                ? "Officer change record"
                : "Record an officer change"}
          </h2>
          <Button
            type="button"
            variant="outline"
            onClick={close}
            disabled={mutation.isPending}
          >
            Close
          </Button>
        </div>
        <p>
          {state.amend
            ? "The original applied event stays unchanged. Choose the corrective event and its true effective date."
            : "The transfer form uses the agreed 13 columns. Rank 1 preserves specifications such as C.I(W); Rank 2 is the overall rank CI. Unknown effective dates stay Undated."}
        </p>
        {mutation.error && <ErrorNotice error={mutation.error} />}
        {!initial && !state.source && !state.officer && (
          <div className="changes-officer-lookup">
            <label>
              Search an existing officer
              <input
                aria-label="Find existing officer"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or force number"
              />
            </label>
            {lookup.error && <ErrorNotice error={lookup.error} />}
            <label>
              Officer
              <select
                aria-label="Select existing officer"
                value={officer?.id || ""}
                onChange={(e) => {
                  const selected = lookup.data?.data.find(
                    (o) => o.id === e.target.value,
                  );
                  if (selected) {
                    setOfficer(selected);
                    setCells((old) => ({
                      ...old,
                      "2": selected.forceNumber,
                      "5": selected.fullName,
                    }));
                  }
                }}
              >
                <option value="">Choose an existing officer</option>
                {lookup.data?.data.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.forceNumber} · {o.fullName}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {officer && (
          <p>
            <strong>
              {officer.forceNumber} · {officer.fullName}
            </strong>
          </p>
        )}
        <div className="changes-plan-grid">
          <label>
            Change type
            <select
              aria-label="Change type"
              value={type}
              disabled={readOnly}
              onChange={(e) => setType(e.target.value)}
            >
              {options.types.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Effective date
            <input
              aria-label="Change effective date"
              type="date"
              value={date}
              disabled={readOnly}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          {["TAKEN_ON_STRENGTH", "REINSTATEMENT", "SUB_UNIT_TRANSFER"].includes(
            type,
          ) && (
            <>
              <label>
                Receiving unit
                <select
                  aria-label="Receiving unit"
                  value={unit}
                  disabled={readOnly}
                  onChange={(e) => {
                    setUnit(e.target.value);
                    setSub("");
                  }}
                >
                  <option value="">Choose a verified reference unit</option>
                  {options.units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.code} · {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Receiving sub-unit
                <select
                  aria-label="Receiving sub-unit"
                  value={sub}
                  disabled={readOnly}
                  onChange={(e) => setSub(e.target.value)}
                >
                  <option value="">Not assigned / Not applicable (NA)</option>
                  {options.subUnits
                    .filter((s) => s.unitId === unit)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} · {s.name}
                      </option>
                    ))}
                </select>
              </label>
            </>
          )}
          {type === "REVERSION" && (
            <label>
              Resulting rank
              <select
                aria-label="Resulting rank"
                value={rank}
                disabled={readOnly}
                onChange={(e) => setRank(e.target.value)}
              >
                <option value="">Choose the confirmed rank</option>
                {options.ranks.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code} · {r.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <h3>
          {type === "TRANSFER_OUT"
            ? "Transfer details — agreed columns"
            : "Event details"}
        </h3>
        <div className="changes-column-grid">
          {columns.map((c) => (
            <label key={c.column}>
              {c.label}
              <textarea
                aria-label={c.label}
                rows={2}
                value={
                  c.label === "Change type"
                    ? type === "TRANSFER_OUT" || type === "SUB_UNIT_TRANSFER"
                      ? "Transfer"
                      : options.types.find((t) => t.code === type)?.label ||
                        type
                    : cells[String(c.column)] || ""
                }
                maxLength={20000}
                disabled={
                  readOnly || c.column === 2 || c.label === "Change type"
                }
                onChange={(e) =>
                  setCells((old) => ({
                    ...old,
                    [String(c.column)]: e.target.value,
                  }))
                }
              />
            </label>
          ))}
        </div>
        <div className="changes-dialog-actions">
          {!readOnly && (
            <Button type="submit" disabled={mutation.isPending || !officer}>
              {mutation.isPending ? "Saving…" : "Save draft"}
            </Button>
          )}
          <Button
            variant="outline"
            type="button"
            onClick={close}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
        </div>
      </form>
    </dialog>
  );
}
function ApproverForm({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const create = useMutation({
    mutationFn: () =>
      api("/changes/approvers", {
        method: "POST",
        body: { name, email, password },
      }),
  });
  return (
    <dialog
      ref={dialog}
      className="changes-dialog changes-small-dialog"
      aria-label="Set up change approver"
      onCancel={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <h2>Set up independent approver</h2>
        <p>
          This account can read all CHANGES source columns and approve personnel
          events, but receives no account/role administration permission. It
          must sign in separately; creators cannot approve their own changes.
        </p>
        {create.error && <ErrorNotice error={create.error} />}{" "}
        {create.isSuccess ? (
          <p role="status">
            Approver account created. Keep its password private and sign in
            separately to approve.
          </p>
        ) : (
          <div className="changes-column-grid">
            <label>
              Name
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Email
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Password (14+ characters)
              <input
                required
                type="password"
                autoComplete="new-password"
                minLength={14}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          </div>
        )}
        <div className="changes-dialog-actions">
          {!create.isSuccess && (
            <Button disabled={create.isPending} type="submit">
              Create approver
            </Button>
          )}
          <Button type="button" variant="outline" onClick={close}>
            Close
          </Button>
        </div>
      </form>
    </dialog>
  );
}
