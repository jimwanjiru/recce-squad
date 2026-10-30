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
export function Dashboard() {
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
      <div className="dashboard-heading">
        <div>
          <p className="eyebrow">PERSONNEL OVERVIEW</p>
          <h1>Dashboard</h1>
          <p>Officer register and workbook group breakdown</p>
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
            label: "Workbook-linked officers",
            value: d.sourceLinked,
            note: "Officers included in the group breakdown",
            Icon: Building2,
          },
          {
            label: "Awaiting verification",
            value: d.needsVerification,
            note: "Register records marked unverified",
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
      <section className="card">
        <div className="panel-title">
          <h2>Teams and groups</h2>
          <Building2 size={19} />
        </div>
        <div className="dashboard-groups">
          {d.groups.map((group) => (
            <article className="dashboard-group" key={group.code}>
              <div>
                <span>{group.label}</span>
                <strong>{number(group.count)}</strong>
              </div>
              <div className="dashboard-bar" aria-hidden="true">
                <span style={{ width: (100 * group.count) / max + "%" }} />
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="card">
        <div className="panel-title">
          <h2>Sub-unit strength by police rank</h2>
        </div>
        <div className="dashboard-notes">
          Ranks follow your confirmed order, from S/AIG to PC. The table counts
          original workbook ranks; it does not infer rank from force number.
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
              {d.groups.map((group) => (
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
                <th scope="row">Workbook-linked total</th>
                {ranks.map((rank) => (
                  <td key={rank.code}>{number(rank.count)}</td>
                ))}
                <td>{number(d.sourceLinked)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
      <section className="card">
        <div className="panel-title">
          <h2>Rank strength and establishment comparison</h2>
        </div>
        <div className="dashboard-notes">
          Source establishment is the workbook's input for that rank, awaiting
          verification. A positive gap means fewer officers than the source
          establishment; a negative gap means more. Missing or erroneous cached
          values remain unavailable.
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
              {ranks.map((rank) => (
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
      </section>
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
              No imported SUB UNIT STRENGTH sheet is available yet. Import your
              workbook to populate its comparison values.
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
              {d.groups.map((group) => (
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
      </section>
      <p className="dashboard-footnote">
        {number(d.archivedOfficers)} archived · {number(d.withoutSource)}{" "}
        without a usable linked workbook row · {number(d.identityMismatches)}{" "}
        source identity mismatches. Counts refreshed on{" "}
        {dateLabel(d.generatedAt)}. Status-based nominal and operational
        strength rules remain separate.
      </p>
    </div>
  );
}
