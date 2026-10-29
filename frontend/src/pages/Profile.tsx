import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Pencil,
  Archive,
  RotateCcw,
  ShieldCheck,
  CalendarDays,
  Hash,
} from "lucide-react";
import { api, Officer, dateLabel } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Confirm, Empty, ErrorNotice, Loading } from "../components/shared";
const sections = [
  { key: "overview", label: "Overview" },
  {
    key: "service",
    label: "Service information",
    permission: "service_profile",
  },
  { key: "assignments", label: "Assignments", permission: "assignments" },
  { key: "ranks", label: "Rank history", permission: "rank_history" },
  {
    key: "movements",
    label: "Personnel movements",
    permission: "personnel_movements",
  },
  { key: "statuses", label: "Service status", permission: "status_history" },
  { key: "education", label: "Education", permission: "education" },
  { key: "courses", label: "Courses", permission: "courses" },
  { key: "awards", label: "Awards", permission: "awards" },
  {
    key: "discipline",
    label: "Disciplinary records",
    permission: "disciplinary_records",
  },
  { key: "examinations", label: "Examinations", permission: "examinations" },
];
const labels: Record<string, string> = {
  effectiveFrom: "Effective from",
  effectiveTo: "Effective until",
  promotionDate: "Promotion date",
  originalRankSpelling: "Original rank spelling",
  specialistDesignation: "Specialist designation",
  dutyTitle: "Duty title",
  disposition: "Disposition",
  dateJoinedUnit: "Joined unit",
  retirementDateOverride: "Confirmed retirement override",
  serviceRemarks: "Service remarks",
  referenceNumber: "Reference",
  educationLevel: "Education level",
  qualification: "Qualification",
  kcseGrade: "KCSE grade",
  institution: "Institution",
  completionDate: "Completed",
  awardName: "Award",
  awardDate: "Award date",
  recordType: "Record type",
  incidentDate: "Incident date",
  decisionDate: "Decision date",
  details: "Details",
  status: "Status",
  examName: "Examination",
  examDate: "Exam date",
  score: "Score",
  result: "Result",
  remarks: "Remarks",
  effectiveDate: "Effective date",
  approvalStatus: "Approval",
  reason: "Reason",
  startDate: "Started",
  datesVerifiedAt: "Dates verified",
  isPrimary: "Primary assignment",
};
function History({ id, section }: { id: string; section: string }) {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["officer-section", id, section, page],
    queryFn: () =>
      api<{ data: Record<string, unknown>[] | Record<string, unknown> | null }>(
        "/officers/" + id + "/sections/" + section + "?page=" + page,
      ),
  });
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorNotice error={query.error} />;
  const data = query.data.data;
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  return (
    <>
      {rows.length === 0 ? (
        <Empty
          title="No entries recorded"
          description="Verified entries will appear here when they are recorded."
        />
      ) : (
        <div className="history-list">
          {rows.map((row, index) => {
            const relation = (row.rank ??
              row.subUnit ??
              row.unit ??
              row.movementType ??
              row.course) as Record<string, string> | undefined;
            return (
              <article key={String(row.id ?? index)} className="history-entry">
                <div className="history-dot" />
                <h3>
                  {relation?.name ??
                    String(
                      row.awardName ??
                        row.educationLevel ??
                        row.examName ??
                        row.recordType ??
                        "Service record",
                    )}
                </h3>
                <dl className="detail-grid">
                  {Object.entries(row)
                    .filter(
                      ([key, value]) =>
                        key in labels && value !== null && value !== "",
                    )
                    .map(([key, value]) => (
                      <div key={key}>
                        <dt>{labels[key]}</dt>
                        <dd>
                          {typeof value === "boolean"
                            ? value
                              ? "Yes"
                              : "No"
                            : /Date$|From$|To$|At$/.test(key)
                              ? dateLabel(String(value))
                              : String(value)}
                        </dd>
                      </div>
                    ))}
                </dl>
              </article>
            );
          })}
        </div>
      )}
      {section !== "service" && (
        <div className="pagination">
          <span>Page {page} · Up to 25 entries per page</span>
          <div>
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={rows.length < 25}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
export function Profile() {
  const { id } = useParams();
  const { can } = useAuth();
  const location = useLocation();
  const cache = useQueryClient();
  const [tab, setTab] = useState("overview");
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState(
    (location.state as { notice?: string } | null)?.notice ?? "",
  );
  const query = useQuery({
    queryKey: ["officer", id],
    queryFn: () => api<{ data: Officer }>("/officers/" + id),
  });
  const o = query.data?.data;
  const action = useMutation({
    mutationFn: () =>
      api("/officers/" + id + (o?.deletedAt ? "/restore" : ""), {
        method: o?.deletedAt ? "POST" : "DELETE",
        body: { version: o!.version },
      }),
    onSuccess: () => {
      setConfirm(false);
      setNotice(
        o?.deletedAt
          ? "Officer record restored."
          : "Officer record archived. Service history is preserved.",
      );
      void cache.invalidateQueries({ queryKey: ["officer", id] });
      void cache.invalidateQueries({ queryKey: ["officers"] });
    },
  });
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorNotice error={query.error} />;
  if (!o) return null;
  const tabs = sections.filter(
    (s) => !s.permission || can(`fields.${s.permission}.view`),
  );
  return (
    <>
      <Link to="/officers" className="back-link">
        <ArrowLeft size={15} />
        Back to officers
      </Link>
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
      <section className="card profile-header">
        <div className="profile-avatar">
          {o.fullName
            .split(" ")
            .slice(0, 2)
            .map((x) => x[0])
            .join("")}
        </div>
        <div className="profile-identity">
          <p className="eyebrow">OFFICER PROFILE</p>
          <h1>{o.fullName}</h1>
          <div className="profile-meta">
            <span>
              <Hash size={14} />
              {o.forceNumber}
            </span>
            <span className={`badge ${o.deletedAt ? "neutral" : "amber"}`}>
              {o.deletedAt
                ? "Archived"
                : o.recordStatus === "UNVERIFIED"
                  ? "Needs verification"
                  : o.recordStatus}
            </span>
          </div>
        </div>
        <div className="profile-actions">
          {!o.deletedAt && can("officers.update") && (
            <Button variant="outline" asChild>
              <Link to={"/officers/" + id + "/edit"}>
                <Pencil size={15} />
                Edit record
              </Link>
            </Button>
          )}
          {can(o.deletedAt ? "officers.restore" : "officers.archive") && (
            <Button
              variant="outline"
              onClick={() => {
                action.reset();
                setConfirm(true);
              }}
            >
              {o.deletedAt ? <RotateCcw size={15} /> : <Archive size={15} />}{" "}
              {o.deletedAt ? "Restore" : "Archive"}
            </Button>
          )}
        </div>
      </section>
      <div className="profile-layout">
        <aside
          className="profile-tabs"
          role="tablist"
          aria-label="Officer profile sections"
          onKeyDown={(event) => {
            if (
              ![
                "ArrowRight",
                "ArrowLeft",
                "ArrowDown",
                "ArrowUp",
                "Home",
                "End",
              ].includes(event.key)
            )
              return;
            event.preventDefault();
            const current = tabs.findIndex((t) => t.key === tab);
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? tabs.length - 1
                  : (current +
                      (["ArrowRight", "ArrowDown"].includes(event.key)
                        ? 1
                        : -1) +
                      tabs.length) %
                    tabs.length;
            setTab(tabs[next].key);
            document.getElementById("tab-" + tabs[next].key)?.focus();
          }}
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              id={"tab-" + t.key}
              role="tab"
              aria-selected={tab === t.key}
              tabIndex={tab === t.key ? 0 : -1}
              aria-controls="profile-panel"
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </aside>
        <section
          id="profile-panel"
          role="tabpanel"
          aria-labelledby={"tab-" + tab}
          className="card profile-panel"
        >
          <div className="panel-title">
            <h2>{tabs.find((t) => t.key === tab)?.label}</h2>
            <ShieldCheck size={17} />
          </div>
          {tab === "overview" ? (
            <>
              <dl className="detail-grid overview-grid">
                {[
                  { label: "Full name", value: o.fullName },
                  { label: "Force number", value: o.forceNumber },
                  ...("payrollNumber" in o
                    ? [{ label: "Payroll number", value: o.payrollNumber }]
                    : []),
                  ...("nationalId" in o
                    ? [{ label: "National ID", value: o.nationalId }]
                    : []),
                  ...("gender" in o
                    ? [{ label: "Gender", value: o.gender }]
                    : []),
                  ...("dateOfBirth" in o
                    ? [
                        {
                          label: "Date of birth",
                          value: dateLabel(o.dateOfBirth),
                        },
                      ]
                    : []),
                  ...("phone" in o ? [{ label: "Phone", value: o.phone }] : []),
                  ...("dateEnlisted" in o
                    ? [{ label: "Enlisted", value: dateLabel(o.dateEnlisted) }]
                    : []),
                  { label: "Registered", value: dateLabel(o.createdAt) },
                  { label: "Last updated", value: dateLabel(o.updatedAt) },
                ].map((item) => (
                  <div key={item.label}>
                    <dt>{item.label}</dt>
                    <dd>{item.value ?? "Not recorded"}</dd>
                  </div>
                ))}
              </dl>
              <div className="profile-policy-note">
                <CalendarDays size={19} />
                <div>
                  <strong>
                    Service calculations require approved policies
                  </strong>
                  <p>
                    Registration and archiving do not determine operational
                    status. Retirement and strength calculations remain
                    unavailable until their policies are approved.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <History key={tab} id={id!} section={tab} />
          )}
        </section>
      </div>
      <Confirm
        open={confirm}
        onOpenChange={setConfirm}
        title={
          o.deletedAt
            ? "Restore this officer record?"
            : "Archive this officer record?"
        }
        description={
          o.deletedAt
            ? "The record will return to the register. This does not change the officer’s service status."
            : "This removes the record from the active register while preserving all service histories. Authorized users can restore it."
        }
        onConfirm={() => action.mutate()}
        pending={action.isPending}
        error={action.error}
      />
    </>
  );
}
