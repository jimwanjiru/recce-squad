import { useQuery } from "@tanstack/react-query";
import { Users, Building2, RefreshCw, ShieldCheck } from "lucide-react";
import { api, dateLabel } from "../lib/api";
import { Button } from "../components/ui/button";
import { Loading, ErrorNotice } from "../components/shared";
type Group = {
  code: string;
  label: string;
  count: number;
  workbookCached: number | null;
  inStrengthSheet: boolean;
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
