import {
  dashboardNumber as number,
  dashboardGap as gap,
  isDashboardNumber,
} from "../lib/dashboard-numbers";
import { PersonnelSummaries } from "../components/PersonnelSummaries";
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
  currentRankOrder: string[];
  totalOfficers: number;
  archivedOfficers: number;
  formerOfficers: number;
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
function Analytics({ data }: { data: Summary }) {
  const [selected, setSelected] = useState("ALL");
  const [rankGroup, setRankGroup] = useState("ALL");
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
  const rankFocus = data.groups.find((group) => group.code === rankGroup);
  const rankTotal =
    rankGroup === "RECCE"
      ? data.recce
      : (rankFocus?.count ?? data.sourceLinked);
  const rankLabel =
    rankGroup === "RECCE"
      ? "RECCE membership"
      : rankFocus?.label || "All covered officers";
  const currentRanks = data.currentRankOrder
    .map((code) => data.rankBreakdown.find((r) => r.code === code)!)
    .filter(Boolean);
  const otherRanks = data.rankBreakdown.filter(
    (r) => !data.currentRankOrder.includes(r.code),
  );
  const filled = [...currentRanks, ...otherRanks]
    .map((rank) => ({
      ...rank,
      count:
        rankGroup === "RECCE"
          ? rank.recceCount
          : rankFocus
            ? rankFocus.ranks[rank.code] || 0
            : rank.count,
    }))
    .filter((rank) => rank.count > 0);
  const maximum = Math.max(1, ...filled.map((rank) => rank.count));
  return (
    <div className="analytics-charts">
      <section className="card analytics-panel">
        <div className="analytics-title">
          <div>
            <p className="eyebrow">GROUP DISTRIBUTION</p>
            <h2>Where officers are placed</h2>
          </div>
          <span className="analytics-badge">Personnel records</span>
        </div>
        <div className="distribution-body">
          <div
            className="distribution-donut"
            role="img"
            aria-label={`Group distribution: ${data.sourceLinked} officers`}
            style={{
              background: data.sourceLinked
                ? `conic-gradient(${stops.join(",")})`
                : "#e8edf5",
            }}
          >
            <div>
              <strong>{number(value)}</strong>
              <span>{focus?.label || "Covered officers"}</span>
              {focus && (
                <small>
                  {data.sourceLinked
                    ? ((100 * value) / data.sourceLinked).toFixed(1)
                    : "0"}
                  % of register
                </small>
              )}
            </div>
          </div>
          <div className="distribution-legend">
            <button
              className={selected === "ALL" ? "selected" : ""}
              onClick={() => {
                setSelected("ALL");
                setRankGroup("ALL");
              }}
            >
              All groups <strong>{number(data.sourceLinked)}</strong>
            </button>
            {data.groups
              .filter((group) => group.count > 0)
              .map((group) => (
                <button
                  key={group.code}
                  className={selected === group.code ? "selected" : ""}
                  onClick={() => {
                    setSelected(group.code);
                    setRankGroup(group.code);
                  }}
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
      <section className="card analytics-panel" aria-label="Rank composition">
        <div className="analytics-title">
          <div>
            <p className="eyebrow">RANK COMPOSITION</p>
            <h2>Police ranks at a glance</h2>
          </div>
          <span className="analytics-badge">
            {filled.length} populated ranks
          </span>
        </div>
        <label className="rank-group-filter">
          Group
          <select
            aria-label="Rank composition group"
            value={rankGroup}
            onChange={(event) => setRankGroup(event.target.value)}
          >
            <option value="ALL">
              All covered officers ({number(data.sourceLinked)})
            </option>
            <option value="RECCE">
              RECCE membership ({number(data.recce)})
            </option>
            {data.groups.map((group) => (
              <option key={group.code} value={group.code}>
                {group.label} ({number(group.count)})
              </option>
            ))}
          </select>
        </label>
        <p className="rank-group-summary">
          {rankLabel} · {number(rankTotal)} officers
        </p>
        <div className="rank-chart">
          {filled.map((rank) => (
            <div className="rank-chart-row" key={rank.code}>
              <span>
                {rank.code === "UNKNOWN"
                  ? "Unmapped"
                  : data.currentRankOrder.includes(rank.code)
                    ? rank.code
                    : `${rank.code} (outside current order)`}
              </span>
              <div className="rank-chart-track">
                <i style={{ width: (100 * rank.count) / maximum + "%" }} />
              </div>
              <strong>{number(rank.count)}</strong>
              <small>
                {rankTotal ? ((100 * rank.count) / rankTotal).toFixed(1) : "0"}%
              </small>
            </div>
          ))}
          {!filled.length && (
            <p className="muted">
              {data.sourceLinked
                ? "No officers are recorded in this group."
                : "Import officer data to see rank composition."}
            </p>
          )}
        </div>
        <Link
          className="analytics-roster-link"
          to={
            "/organization?view=groups&group=" + encodeURIComponent(rankGroup)
          }
        >
          View selected group roster →
        </Link>
        <p className="analytics-chart-note">
          Percentages are shares of the selected group. Ranks follow the
          register; RECCE membership overlaps the placement groups.
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
    .every((rank) => isDashboardNumber(rank.workbookEstablishment));
  const establishmentTotal = completeEstablishment
    ? d.rankBreakdown.reduce(
        (sum, rank) => sum + (rank.workbookEstablishment || 0),
        0,
      )
    : null;
  const show = number;
  return (
    <div className="dashboard">
      <div className="dashboard-heading analytics-hero">
        <div>
          <p className="eyebrow">PERSONNEL OVERVIEW</p>
          <h1>Dashboard</h1>
          <p>Personnel analytics · groups, ranks and strength comparisons</p>
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
            note: "Serving register, excluding archives and recorded service exits",
            Icon: Users,
          },
          {
            label: "RECCE",
            value: d.recce,
            note: "Recce membership",
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
            note: "Not assigned / Not applicable",
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
        Team placement uses current assignments and recorded dispositions. RECCE
        membership overlaps these groups and should not be added to them. These
        are register counts, not approved operational strength.
      </div>
      <div
        className="analytics-view-tabs"
        role="tablist"
        aria-label="Dashboard views"
      >
        {[
          ["overview", "Overview"],
          ["strength", "Strength analysis"],
          ["comparison", "Strength comparison"],
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
              counts recorded ranks; it does not infer rank from force number.
              RECCE is a membership summary and overlaps the group rows.
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
                            {number(group.ranks?.[rank.code])}
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
              Recorded establishment is retained for comparison. A positive gap
              means fewer officers than the recorded establishment; a negative
              gap means more. Missing or erroneous cached values remain
              unavailable.
            </div>
            <div className="table-scroll">
              <table aria-label="Rank strength and establishment comparison">
                <thead>
                  <tr>
                    <th scope="col">Police rank</th>
                    <th scope="col">Register count</th>
                    <th scope="col">RECCE</th>
                    <th scope="col">Historical strength</th>
                    <th scope="col">Recorded establishment</th>
                    <th scope="col">Gap to recorded establishment</th>
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
              <h2>Sub-unit strength comparison</h2>
            </div>
            <div className="dashboard-notes">
              <p>
                Register counts are calculated from current database records.
                Historical comparison values are retained separately;
                unavailable totals are shown explicitly.
              </p>
              {d.workbook ? (
                <p>
                  Comparison recorded {dateLabel(d.workbook.importedAt)} ·
                  historical total:{" "}
                  {d.workbook.total === null
                    ? "Unavailable"
                    : number(d.workbook.total)}{" "}
                  · historical RECCE:{" "}
                  {d.workbook.recce === null
                    ? "Unavailable"
                    : number(d.workbook.recce)}
                </p>
              ) : (
                <p>No historical strength comparison has been recorded yet.</p>
              )}
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Group</th>
                    <th>Register count</th>
                    <th>Historical total</th>
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
                          {!isDashboardNumber(group.workbookCached)
                            ? "Unavailable"
                            : number(group.workbookCached)}
                        </td>
                        <td>
                          {!group.inStrengthSheet
                            ? "Not listed in comparison"
                            : !isDashboardNumber(group.workbookCached)
                              ? "Historical total unavailable"
                              : group.workbookCached === group.count
                                ? "Matches historical comparison"
                                : "Different from historical comparison"}
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
              label="Strength comparison pagination"
            />
          </section>
        </>
      )}
      {view === "comparison" && <PersonnelSummaries />}
      <p className="dashboard-footnote">
        {number(d.formerOfficers)} recorded service exits ·{" "}
        {number(d.archivedOfficers)} archived. Counts refreshed on{" "}
        {dateLabel(d.generatedAt)}. Status-based nominal and operational
        strength rules remain separate.
      </p>
    </div>
  );
}
