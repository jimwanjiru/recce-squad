import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUpRight,
  Archive,
  Users,
  ShieldCheck,
} from "lucide-react";
import { api, Officer, Options, dateLabel } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Confirm, Empty, ErrorNotice, Loading } from "../components/shared";
export function Officers() {
  const { can } = useAuth();
  const cache = useQueryClient();
  const [params, setParams] = useSearchParams();
  const archive = params.get("archive") === "archived" ? "archived" : "active";
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("fullName");
  const [direction, setDirection] = useState("asc");
  const [selected, setSelected] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [toast, setToast] = useState("");
  const [columns, setColumns] = useState<string[]>(() => {
    try {
      return JSON.parse(
        localStorage.getItem("officer-columns") ?? '["createdAt"]',
      );
    } catch {
      return ["createdAt"];
    }
  });
  useEffect(() => {
    const t = setTimeout(() => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (search) next.set("q", search);
          else next.delete("q");
          return next;
        },
        { replace: true },
      );
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search, setParams]);
  useEffect(() => {
    setPage(1);
    setSelected([]);
  }, [archive]);
  const options = useQuery({
    queryKey: ["officer-options"],
    queryFn: () => api<{ data: Options }>("/officer-options"),
  });
  const setFilter = (key: string, value: string) => {
    setPage(1);
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  };
  const query = new URLSearchParams({
    page: String(page),
    pageSize: "25",
    archive,
    sort,
    direction,
    ...(params.get("q") ? { q: params.get("q")! } : {}),
    ...(params.get("rankId") ? { rankId: params.get("rankId")! } : {}),
    ...(params.get("subUnitId") ? { subUnitId: params.get("subUnitId")! } : {}),
    ...(params.get("recordStatus")
      ? { recordStatus: params.get("recordStatus")! }
      : {}),
  });
  const result = useQuery({
    queryKey: ["officers", query.toString()],
    queryFn: ({ signal }) =>
      api<{
        data: Officer[];
        meta: { total: number; page: number; pageSize: number };
      }>("/officers?" + query, { signal }),
  });
  const rows = result.data?.data ?? [];
  const total = result.data?.meta.total ?? 0;
  useEffect(() => setSelected([]), [query.toString()]);
  const bulk = useMutation({
    mutationFn: () =>
      api("/officers/bulk-archive", {
        method: "POST",
        body: {
          officers: rows
            .filter((o) => selected.includes(o.id))
            .map((o) => ({ id: o.id, version: o.version })),
        },
      }),
    onSuccess: () => {
      setConfirm(false);
      setSelected([]);
      setToast(
        "Selected records archived. Service histories have been preserved.",
      );
      void cache.invalidateQueries({ queryKey: ["officers"] });
    },
  });
  const sortBy = (field: string) => {
    setSort(field);
    setDirection(sort === field && direction === "asc" ? "desc" : "asc");
    setPage(1);
  };
  const toggleColumn = (key: string) => {
    const next = columns.includes(key)
      ? columns.filter((k) => k !== key)
      : [...columns, key];
    setColumns(next);
    localStorage.setItem("officer-columns", JSON.stringify(next));
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">PERSONNEL DIRECTORY</p>
          <h1>{archive === "archived" ? "Archived records" : "Officers"}</h1>
          <p className="muted">
            {archive === "archived"
              ? "Preserved records, ready to restore when authorized."
              : "Manage officer records and keep service information up to date."}
          </p>
        </div>
        {can("officers.create") && (
          <Button asChild>
            <Link to="/officers/new">
              <Plus size={18} /> Register officer
            </Link>
          </Button>
        )}
      </div>
      {toast && (
        <div className="notice success" role="status">
          {toast}
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}
      <div className="register-banner">
        <div className="banner-icon">
          {archive === "archived" ? <Archive size={25} /> : <Users size={25} />}
        </div>
        <div>
          <strong>{result.isPending ? "…" : total.toLocaleString()}</strong>
          <span>
            {params.get("q")
              ? "Matching records"
              : archive === "archived"
                ? "Archived officer records"
                : "Officer records in this register"}
          </span>
        </div>
        <div className="banner-note">
          <ShieldCheck size={17} />
          <span>
            Administrative records
            <br />
            <small>
              Strength totals depend on approved personnel policies.
            </small>
          </span>
        </div>
      </div>
      <section className="card">
        <div className="table-toolbar">
          <div className="search-field">
            <Search size={18} />
            <input
              aria-label="Search officers"
              placeholder="Search by name or force number…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="toolbar-actions">
            <span className="table-count">{total} records</span>
            <details className="column-menu">
              <summary>
                <SlidersHorizontal size={16} /> Columns
              </summary>
              <div>
                {[
                  { key: "createdAt", label: "Date registered" },
                  {
                    key: "payrollNumber",
                    label: "Payroll number",
                    permission: "fields.payroll_number.view",
                  },
                  {
                    key: "phone",
                    label: "Phone",
                    permission: "fields.phone.view",
                  },
                ]
                  .filter((c) => !c.permission || can(c.permission))
                  .map((c) => (
                    <label key={c.key}>
                      <input
                        type="checkbox"
                        checked={columns.includes(c.key)}
                        onChange={() => toggleColumn(c.key)}
                      />
                      {c.label}
                    </label>
                  ))}
              </div>
            </details>
          </div>
        </div>
        <div className="table-filters">
          <select
            aria-label="Verification filter"
            value={params.get("recordStatus") ?? ""}
            onChange={(e) => setFilter("recordStatus", e.target.value)}
          >
            <option value="">All record states</option>
            <option value="UNVERIFIED">Needs verification</option>
          </select>
          {can("fields.rank_history.view") && (
            <select
              aria-label="Rank filter"
              value={params.get("rankId") ?? ""}
              onChange={(e) => setFilter("rankId", e.target.value)}
              disabled={!options.data?.data.ranks.length}
            >
              <option value="">All ranks</option>
              {options.data?.data.ranks.map((rank) => (
                <option key={rank.id} value={rank.id}>
                  {rank.code} · {rank.name}
                </option>
              ))}
            </select>
          )}
          {can("fields.assignments.view") && (
            <select
              aria-label="Sub-unit filter"
              value={params.get("subUnitId") ?? ""}
              onChange={(e) => setFilter("subUnitId", e.target.value)}
              disabled={!options.data?.data.subUnits.length}
            >
              <option value="">All sub-units</option>
              {options.data?.data.subUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.code} · {unit.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {selected.length > 0 && (
          <div className="selection-bar">
            <span>{selected.length} selected</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                bulk.reset();
                setConfirm(true);
              }}
            >
              <Archive size={14} />
              Archive selected
            </Button>
          </div>
        )}
        {result.isPending ? (
          <Loading />
        ) : result.error ? (
          <div className="panel-padding">
            <ErrorNotice error={result.error} />
            <Button variant="outline" onClick={() => void result.refetch()}>
              Try again
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <Empty
            title={
              search
                ? "No matching officers"
                : archive === "archived"
                  ? "No archived records"
                  : "Your register is ready"
            }
            description={
              search
                ? "Try another name or force number."
                : archive === "archived"
                  ? "Archived records will appear here."
                  : "Register an officer to create the first personnel record."
            }
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {can("officers.archive") && archive === "active" && (
                    <th className="check-cell">
                      <input
                        type="checkbox"
                        aria-label="Select all officers on this page"
                        checked={
                          rows.length > 0 && selected.length === rows.length
                        }
                        onChange={(e) =>
                          setSelected(
                            e.target.checked ? rows.map((o) => o.id) : [],
                          )
                        }
                      />
                    </th>
                  )}
                  <th>
                    <button onClick={() => sortBy("fullName")}>
                      Officer <ArrowUpDown size={13} />
                    </button>
                  </th>
                  <th>
                    <button onClick={() => sortBy("forceNumber")}>
                      Force number <ArrowUpDown size={13} />
                    </button>
                  </th>
                  <th>Record state</th>
                  {columns.includes("payrollNumber") &&
                    can("fields.payroll_number.view") && (
                      <th>Payroll number</th>
                    )}
                  {columns.includes("phone") && can("fields.phone.view") && (
                    <th>Phone</th>
                  )}
                  {columns.includes("createdAt") && (
                    <th>
                      <button onClick={() => sortBy("createdAt")}>
                        Registered <ArrowUpDown size={13} />
                      </button>
                    </th>
                  )}
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id}>
                    {can("officers.archive") && archive === "active" && (
                      <td className="check-cell">
                        <input
                          type="checkbox"
                          aria-label={`Select ${o.forceNumber}`}
                          checked={selected.includes(o.id)}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...selected, o.id]
                                : selected.filter((id) => id !== o.id),
                            )
                          }
                        />
                      </td>
                    )}
                    <td>
                      <Link to={"/officers/" + o.id} className="officer-link">
                        <span className="officer-avatar">
                          {o.fullName
                            .split(" ")
                            .slice(0, 2)
                            .map((x) => x[0])
                            .join("")}
                        </span>
                        <span>
                          {o.fullName}
                          <small>Personnel record</small>
                        </span>
                      </Link>
                    </td>
                    <td className="mono" title={o.forceNumber}>
                      {o.forceNumber}
                    </td>
                    <td>
                      <span
                        className={`badge ${o.deletedAt ? "neutral" : "amber"}`}
                      >
                        {o.deletedAt
                          ? "Archived"
                          : o.recordStatus === "UNVERIFIED"
                            ? "Needs verification"
                            : o.recordStatus}
                      </span>
                    </td>
                    {columns.includes("payrollNumber") &&
                      can("fields.payroll_number.view") && (
                        <td className="mono">{o.payrollNumber ?? "—"}</td>
                      )}
                    {columns.includes("phone") && can("fields.phone.view") && (
                      <td>{o.phone ?? "—"}</td>
                    )}
                    {columns.includes("createdAt") && (
                      <td className="muted">{dateLabel(o.createdAt)}</td>
                    )}
                    <td>
                      <Link
                        className="row-action"
                        to={"/officers/" + o.id}
                        aria-label={`View ${o.forceNumber}`}
                      >
                        <ArrowUpRight size={18} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <span>
            {total
              ? `${(page - 1) * 25 + 1}–${Math.min(page * 25, total)} of ${total}`
              : "0 records"}
          </span>
          <div>
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft size={16} />
            </Button>
            <span>Page {page}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={page * 25 >= total}
              onClick={() => setPage(page + 1)}
              aria-label="Next page"
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      </section>
      <p className="privacy-note">
        <ShieldCheck size={14} /> Sensitive fields are shown only when your role
        permits access.
      </p>
      <Confirm
        open={confirm}
        onOpenChange={setConfirm}
        title={`Archive ${selected.length} records?`}
        description="The selected records will leave the active register. Their service histories will be preserved, and authorized users can restore them."
        onConfirm={() => bulk.mutate()}
        pending={bulk.isPending}
        error={bulk.error}
      />
    </>
  );
}
