import { useState } from "react";
import { Link } from "react-router-dom";
import { Pagination } from "../components/Pagination";
import { useQuery } from "@tanstack/react-query";
import { Users, Building2, RefreshCw, ShieldCheck } from "lucide-react";
import { api, dateLabel } from "../lib/api";
import { Button } from "../components/ui/button";
import { Loading, ErrorNotice } from "../components/shared";
type Group = {
  code: string;
  label: string;
  count: number;
  ranks: Record<string, number>;
  workbookCached: number | null;
  inStrengthSheet: boolean;
};
type RankStrength = {
  code: string;
  label: string;
  count: number;
  recceCount: number;
  workbookCurrent: number | null;
  workbookEstablishment: number | null;
  differenceToEstablishment: number | null;
};
type Summary = {
  totalOfficers: number;
  archivedOfficers: number;
  needsVerification: number;
  recce: number;
  sourceLinked: number;
  withoutSource: number;
  identityMismatches: number;
  groups: Group[];
  rankBreakdown: RankStrength[];
  workbook: {
    importedAt: string;
    total: number | null;
    recce: number | null;
  } | null;
  generatedAt: string;
};
const number = (n: number) => n.toLocaleString("en-GB");
function Analytics({ data }: { data: Summary }) {
  const [selected, setSelected] = useState("ALL");
  const colors = [
    "#235bd6",
    "#14a3a5",
    "#8559db",
    "#ec9a38",
    "#3a83dd",
    "#d95e89",
    "#47a985",
    "#a57b50",
    "#578391",
    "#cf6f4b",
    "#73849b",
    "#989fb0",
    "#c4cbd6",
  ];
  let angle = 0;
  const stops = data.groups.map((group, index) => {
    const start = angle;
    angle += data.sourceLinked ? (group.count / data.sourceLinked) * 360 : 0;
    return `${colors[index % colors.length]} ${start}deg ${angle}deg`;
  });
  const focus = data.groups.find((group) => group.code === selected),
    value = focus?.count ?? data.sourceLinked;
  const filled = data.rankBreakdown.filter((rank) => rank.count > 0),
    maximum = Math.max(1, ...filled.map((rank) => rank.count));
  return (
    <div className="analytics-charts">
      <section className="card analytics-panel">
        <div className="analytics-title">
          <div>
            <p className="eyebrow">GROUP DISTRIBUTION</p>
            <h2>Where officers are placed</h2>
          </div>
          <span className="analytics-badge">Workbook source</span>
        </div>
        <div className="distribution-body">
          <div
            className="distribution-donut"
            role="img"
            aria-label={`Group distribution: ${data.sourceLinked} workbook-linked officers`}
            style={{
              background: data.sourceLinked
                ? `conic-gradient(${stops.join(",")})`
                : "#e8edf5",
            }}
          >
            <div>
              <strong>{number(value)}</strong>
              <span>{focus?.label || "Linked officers"}</span>
              {focus && (
                <small>
                  {data.sourceLinked
                    ? ((100 * value) / data.sourceLinked).toFixed(1)
                    : "0"}
                  % of source
                </small>
              )}
            </div>
          </div>
          <div className="distribution-legend">
            <button
              className={selected === "ALL" ? "selected" : ""}
              onClick={() => setSelected("ALL")}
            >
              All groups <strong>{number(data.sourceLinked)}</strong>
            </button>
            {data.groups
              .filter((group) => group.count > 0)
              .map((group) => (
                <button
                  key={group.code}
                  className={selected === group.code ? "selected" : ""}
                  onClick={() => setSelected(group.code)}
                >
                  <i
                    style={{
                      background:
                        colors[data.groups.indexOf(group) % colors.length],
                    }}
                  />
                  <span>{group.label}</span>
                  <strong>{number(group.count)}</strong>
                </button>
              ))}
          </div>
        </div>
        {focus && (
          <Link
            className="analytics-roster-link"
            to={
              "/organization?view=groups&group=" +
              encodeURIComponent(focus.code)
            }
          >
            View {focus.label} roster →
          </Link>
        )}
      </section>
      <section className="card analytics-panel">
        <div className="analytics-title">
          <div>
            <p className="eyebrow">RANK COMPOSITION</p>
            <h2>Police ranks at a glance</h2>
          </div>
          <span className="analytics-badge">
            {filled.length} populated ranks
          </span>
        </div>
        <div className="rank-chart">
          {filled.map((rank) => (
            <div className="rank-chart-row" key={rank.code}>
              <span>{rank.code === "UNKNOWN" ? "Unmapped" : rank.code}</span>
              <div className="rank-chart-track">
                <i style={{ width: (100 * rank.count) / maximum + "%" }} />
              </div>
              <strong>{number(rank.count)}</strong>
              <small>
                {data.sourceLinked
                  ? ((100 * rank.count) / data.sourceLinked).toFixed(1)
                  : "0"}
                %
              </small>
            </div>
          ))}
          {!filled.length && (
            <p className="muted">
              Import officer data to see rank composition.
            </p>
          )}
        </div>
        <p className="analytics-chart-note">
          Counts follow recorded workbook ranks. Percentages are shares of
          linked officers; force numbers do not determine rank.
        </p>
      </section>
    </div>
  );
}

export function Dashboard() {
  const [view, setView] = useState("overview");
  const [matrixPage, setMatrixPage] = useState(1),
    [matrixSize, setMatrixSize] = useState(5);
  const [rankPage, setRankPage] = useState(1),
    [rankSize, setRankSize] = useState(10);
  const [workbookPage, setWorkbookPage] = useState(1),
    [workbookSize, setWorkbookSize] = useState(5);
  const query = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<{ data: Summary }>("/dashboard"),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorNotice error={query.error} />;
  const d = query.data.data,
    max = Math.max(1, ...d.groups.map((g) => g.count));
  const ranks = d.rankBreakdown.filter(
    (rank) => rank.code !== "UNKNOWN" || rank.count > 0,
  );
  const completeEstablishment = d.rankBreakdown
    .filter((rank) => rank.code !== "UNKNOWN")
    .every((rank) => rank.workbookEstablishment !== null);
  const establishmentTotal = completeEstablishment
    ? d.rankBreakdown.reduce(
        (sum, rank) => sum + (rank.workbookEstablishment || 0),
        0,
      )
    : null;
  const show = (value: number | null) =>
    value === null ? "Unavailable" : number(value);
  const gap = (value: number | null) =>
    value === null
      ? "Unavailable"
      : value === 0
        ? "0"
        : (value > 0 ? "+" : "") + number(value);
  return (
    <div className="dashboard">
      <div className="dashboard-heading analytics-hero">
        <div>
          <p className="eyebrow">PERSONNEL OVERVIEW</p>
          <h1>Dashboard</h1>
          <p>Personnel analytics · groups, ranks and workbook reconciliation</p>
        </div>
        <Button
          variant="outline"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw size={16} /> Refresh
        </Button>
      </div>
      <div className="dashboard-stats">
        {[
          {
            label: "Total officers",
            value: d.totalOfficers,
            note: "Registered officers, excluding archived records",
            Icon: Users,
          },
          {
            label: "RECCE",
            value: d.recce,
            note: "Officers marked R in the workbook",
            Icon: ShieldCheck,
          },
          {
            label: "Populated teams",
            value: d.groups.filter(
              (group) =>
                !["NA", "OTHER", "UNSPECIFIED"].includes(group.code) &&
                group.count > 0,
            ).length,
            note: "Excludes NA, other and blank dispositions",
            Icon: Building2,
          },
          {
            label: "Not assigned / Not applicable",
            value: d.groups.find((group) => group.code === "NA")?.count || 0,
            note: "Officers marked NA in the workbook",
            Icon: ShieldCheck,
          },
        ].map(({ label, value, note, Icon }) => (
          <section className="card dashboard-stat" key={label}>
            <div>
              <span>{label}</span>
              <Icon size={18} />
            </div>
            <strong>{number(value)}</strong>
            <p>{note}</p>
          </section>
        ))}
      </div>
      <div className="notice" role="note">
        Counts include unverified register records. Team placement follows
        workbook disposition; RECCE membership overlaps these groups and should
        not be added to them. These are register/source counts, not approved
        operational strength.
      </div>
      <div
        className="analytics-view-tabs"
        role="tablist"
        aria-label="Dashboard views"
      >
        {[
          ["overview", "Overview"],
          ["strength", "Strength analysis"],
          ["comparison", "Workbook comparison"],
        ].map(([key, label]) => (
          <button
            role="tab"
            aria-selected={view === key}
            key={key}
            onClick={() => setView(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {view === "overview" && (
        <>
          <Analytics data={d} />
          <section className="card">
            <div className="panel-title">
              <h2>Teams and groups</h2>
              <Building2 size={19} />
            </div>
            <div className="dashboard-groups">
              {d.groups.map((group) => (
                <Link
                  className="dashboard-group"
                  key={group.code}
                  to={
                    "/organization?view=groups&group=" +
                    encodeURIComponent(group.code)
                  }
                >
                  <div>
                    <span>{group.label}</span>
                    <strong>{number(group.count)}</strong>
                  </div>
                  <div className="dashboard-bar" aria-hidden="true">
                    <span style={{ width: (100 * group.count) / max + "%" }} />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
      {view === "strength" && (
        <>
          <section className="card">
            <div className="panel-title">
              <h2>Sub-unit strength by police rank</h2>
            </div>
            <div className="dashboard-notes">
              Ranks follow your confirmed order, from S/AIG to PC. The table
              counts original workbook ranks; it does not infer rank from force
              number. RECCE is a membership summary and overlaps the group rows.
            </div>
            <div className="table-scroll">
              <table
                className="rank-strength-table"
                aria-label="Sub-unit strength by police rank"
              >
                <thead>
                  <tr>
                    <th scope="col">Sub-unit / membership</th>
                    {ranks.map((rank) => (
                      <th scope="col" key={rank.code}>
                        {rank.code === "UNKNOWN" ? "Unmapped" : rank.code}
                      </th>
                    ))}
                    <th scope="col">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="rank-membership-row">
                    <th scope="row">RECCE (membership)</th>
                    {ranks.map((rank) => (
                      <td key={rank.code}>{number(rank.recceCount)}</td>
                    ))}
                    <td>{number(d.recce)}</td>
                  </tr>
                  {d.groups
                    .slice(
                      (matrixPage - 1) * matrixSize,
                      matrixPage * matrixSize,
                    )
                    .map((group) => (
                      <tr key={group.code}>
                        <th scope="row">{group.label}</th>
                        {ranks.map((rank) => (
                          <td key={rank.code}>
                            {number(group.ranks[rank.code] || 0)}
                          </td>
                        ))}
                        <td>{number(group.count)}</td>
                      </tr>
                    ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">All groups total</th>
                    {ranks.map((rank) => (
                      <td key={rank.code}>{number(rank.count)}</td>
                    ))}
                    <td>{number(d.sourceLinked)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <Pagination
              page={matrixPage}
              pageSize={matrixSize}
              total={d.groups.length}
              onPage={setMatrixPage}
              onSize={(size) => {
                setMatrixSize(size);
                setMatrixPage(1);
              }}
              label="Rank matrix pagination"
            />
          </section>
          <section className="card">
            <div className="panel-title">
              <h2>Rank strength and establishment comparison</h2>
            </div>
            <div className="dashboard-notes">
              Source establishment is the workbook's input for that rank,
              awaiting verification. A positive gap means fewer officers than
              the source establishment; a negative gap means more. Missing or
              erroneous cached values remain unavailable.
            </div>
            <div className="table-scroll">
              <table aria-label="Rank strength and establishment comparison">
                <thead>
                  <tr>
                    <th scope="col">Police rank</th>
                    <th scope="col">Register count</th>
                    <th scope="col">RECCE</th>
                    <th scope="col">Workbook current strength</th>
                    <th scope="col">Source establishment</th>
                    <th scope="col">Gap to source establishment</th>
                  </tr>
                </thead>
                <tbody>
                  {ranks
                    .slice((rankPage - 1) * rankSize, rankPage * rankSize)
                    .map((rank) => (
                      <tr key={rank.code}>
                        <th scope="row">{rank.label}</th>
                        <td>{number(rank.count)}</td>
                        <td>{number(rank.recceCount)}</td>
                        <td>{show(rank.workbookCurrent)}</td>
                        <td>{show(rank.workbookEstablishment)}</td>
                        <td>{gap(rank.differenceToEstablishment)}</td>
                      </tr>
                    ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    <td>{number(d.sourceLinked)}</td>
                    <td>{number(d.recce)}</td>
                    <td>{show(d.workbook?.total ?? null)}</td>
                    <td>{show(establishmentTotal)}</td>
                    <td>
                      {gap(
                        establishmentTotal === null
                          ? null
                          : establishmentTotal - d.sourceLinked,
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <Pagination
              page={rankPage}
              pageSize={rankSize}
              total={ranks.length}
              onPage={setRankPage}
              onSize={(size) => {
                setRankSize(size);
                setRankPage(1);
              }}
              label="Rank comparison pagination"
            />
          </section>
        </>
      )}
      {view === "comparison" && (
        <>
          <section className="card">
            <div className="panel-title">
              <h2>SUB UNIT STRENGTH comparison</h2>
            </div>
            <div className="dashboard-notes">
              <p>
                Group categories follow SUB UNIT STRENGTH. Register counts are
                recalculated from linked NAMES rows. Workbook values below are
                cached source totals; external references and formula errors can
                make them incomplete.
              </p>
              {d.workbook ? (
                <p>
                  Workbook imported {dateLabel(d.workbook.importedAt)} · cached
                  total:{" "}
                  {d.workbook.total === null
                    ? "Unavailable"
                    : number(d.workbook.total)}{" "}
                  · cached RECCE:{" "}
                  {d.workbook.recce === null
                    ? "Unavailable"
                    : number(d.workbook.recce)}
                </p>
              ) : (
                <p>
                  No imported SUB UNIT STRENGTH sheet is available yet. Import
                  your workbook to populate its comparison values.
                </p>
              )}
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Group</th>
                    <th>Register count</th>
                    <th>Workbook cached total</th>
                    <th>Comparison</th>
                  </tr>
                </thead>
                <tbody>
                  {d.groups
                    .slice(
                      (workbookPage - 1) * workbookSize,
                      workbookPage * workbookSize,
                    )
                    .map((group) => (
                      <tr key={group.code}>
                        <td>{group.label}</td>
                        <td>{number(group.count)}</td>
                        <td>
                          {group.workbookCached === null
                            ? "Unavailable"
                            : number(group.workbookCached)}
                        </td>
                        <td>
                          {!group.inStrengthSheet
                            ? "Not listed in sheet"
                            : group.workbookCached === null
                              ? "Source total unavailable"
                              : group.workbookCached === group.count
                                ? "Matches source snapshot"
                                : "Different from source snapshot"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={workbookPage}
              pageSize={workbookSize}
              total={d.groups.length}
              onPage={setWorkbookPage}
              onSize={(size) => {
                setWorkbookSize(size);
                setWorkbookPage(1);
              }}
              label="Workbook comparison pagination"
            />
          </section>
        </>
      )}
      <p className="dashboard-footnote">
        {number(d.needsVerification)} awaiting verification ·{" "}
        {number(d.archivedOfficers)} archived · {number(d.withoutSource)}{" "}
        without a usable linked workbook row · {number(d.identityMismatches)}{" "}
        source identity mismatches. Counts refreshed on{" "}
        {dateLabel(d.generatedAt)}. Status-based nominal and operational
        strength rules remain separate.
      </p>
    </div>
  );
}
