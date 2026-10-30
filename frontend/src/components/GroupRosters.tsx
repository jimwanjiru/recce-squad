import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Users, Search } from "lucide-react";
import { api } from "../lib/api";
import { Button } from "./ui/button";
import { Pagination } from "./Pagination";
import { Loading, ErrorNotice } from "./shared";
type Roster = {
  id: string;
  forceNumber: string;
  fullName: string;
  rank: string;
  originalRank: string;
  specialistDesignation?: string | null;
  group: string;
  recordStatus: string;
  verifiedRank: string | null;
  verifiedGroup: string | null;
};
type Result = {
  rankOrder: string[];
  data: Roster[];
  groups: { code: string; label: string; count: number }[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    identityMismatches: number;
  };
};
export function GroupRosters() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") || "");
  const submittedSearch = params.get("q") || "";
  useEffect(() => setSearch(submittedSearch), [submittedSearch]);
  const group = params.get("group") || "ALL",
    rank = params.get("rank") || "",
    page = Math.max(1, Number(params.get("page") || 1)),
    pageSize = Number(params.get("pageSize") || 10);
  const change = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    next.set("view", "groups");
    for (const [key, value] of Object.entries(patch))
      value ? next.set(key, value) : next.delete(key);
    setParams(next);
  };
  const query = new URLSearchParams({
    group,
    page: String(page),
    pageSize: String(pageSize),
    ...(rank ? { rank } : {}),
    ...(params.get("q") ? { q: params.get("q")! } : {}),
  });
  const result = useQuery({
    queryKey: ["group-rosters", query.toString()],
    queryFn: ({ signal }) =>
      api<Result>("/organization/groups?" + query, { signal }),
  });
  const selected = result.data?.groups.find((g) => g.code === group);
  return (
    <div className="group-rosters">
      <div className="page-heading">
        <div>
          <p className="eyebrow">GROUPS & PERSONNEL</p>
          <h1>Organization</h1>
          <p className="muted">
            Browse sub-units and their officers. Verified current records take
            precedence over workbook values.
          </p>
        </div>
      </div>
      <div className="roster-group-strip" aria-label="Officer groups">
        {result.data?.groups.map((g) => (
          <button
            key={g.code}
            aria-pressed={group === g.code}
            onClick={() => change({ group: g.code, page: "1" })}
          >
            <span>{g.code === "ALL" ? "All officers" : g.label}</span>
            <strong>{g.count.toLocaleString("en-GB")}</strong>
          </button>
        ))}
      </div>
      <section className="card">
        <div className="panel-title">
          <div>
            <h2>{selected?.label || "Officer roster"}</h2>
            <p className="muted">
              Current placements, with workbook values awaiting verification
            </p>
          </div>
          <Users size={20} />
        </div>
        <div className="roster-filters">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              change({ q: search, page: "1" });
            }}
          >
            <label className="sr-only" htmlFor="roster-search">
              Search group officers
            </label>
            <input
              id="roster-search"
              placeholder="Name or force number"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button variant="outline" type="submit">
              <Search size={15} />
              Search
            </Button>
          </form>
          <select
            aria-label="Filter roster by rank"
            value={rank}
            onChange={(e) => change({ rank: e.target.value, page: "1" })}
          >
            <option value="">All ranks</option>
            {[...(result.data?.rankOrder || []), "UNKNOWN"].map((r) => (
              <option key={r} value={r}>
                {r === "UNKNOWN" ? "Unmapped rank" : r}
              </option>
            ))}
          </select>
        </div>
        {result.isPending ? (
          <Loading />
        ) : result.error ? (
          <ErrorNotice error={result.error} />
        ) : (
          <>
            <div className="table-scroll">
              <table aria-label="Group officer roster">
                <thead>
                  <tr>
                    <th>Force number</th>
                    <th>Officer</th>
                    <th>Rank 1 · rank / specialization</th>
                    <th>Rank 2 · overall rank</th>
                    <th>Current / source sub-unit</th>
                    <th>Verified record</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.data.map((officer) => (
                    <tr key={officer.id}>
                      <td className="mono">{officer.forceNumber}</td>
                      <td>
                        <Link
                          className="roster-officer-link"
                          to={"/officers/" + officer.id}
                        >
                          {officer.fullName}
                        </Link>
                      </td>
                      <td>
                        {officer.originalRank || officer.verifiedRank || "—"}
                        {officer.specialistDesignation && (
                          <small className="roster-source-label">
                            {officer.specialistDesignation}
                          </small>
                        )}
                      </td>
                      <td>
                        <strong>
                          {officer.rank === "UNKNOWN"
                            ? "Unmapped"
                            : officer.rank}
                        </strong>
                      </td>
                      <td>
                        {result.data.groups.find(
                          (g) => g.code === officer.group,
                        )?.label || officer.group}
                      </td>
                      <td>
                        {officer.verifiedGroup || officer.verifiedRank ? (
                          <>
                            <span>
                              {officer.verifiedGroup || "No verified group"}
                            </span>
                            <small className="roster-source-label">
                              Rank: {officer.verifiedRank || "Not verified"}
                            </small>
                          </>
                        ) : (
                          <span className="roster-pending">
                            Awaiting verification
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!result.data.data.length && (
                <p className="panel-padding muted">
                  No officers match this group and filter.
                </p>
              )}
            </div>
            <Pagination
              page={page}
              pageSize={pageSize}
              total={result.data.meta.total}
              onPage={(p) => change({ page: String(p) })}
              onSize={(size) => change({ pageSize: String(size), page: "1" })}
              label="Group roster pagination"
            />
          </>
        )}
      </section>
      <p className="dashboard-footnote">
        Verified current placements are used first, with workbook values as a
        fallback. RECCE membership overlaps the other groups. Verified current
        assignments and ranks, when available, appear separately.{" "}
        {result.data?.meta.identityMismatches || 0} source identity mismatches
        are excluded.
      </p>
    </div>
  );
}
