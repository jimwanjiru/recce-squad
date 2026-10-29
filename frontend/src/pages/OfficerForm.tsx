import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, ShieldCheck } from "lucide-react";
import { api, Officer, Options } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { ErrorNotice, Loading, SearchSelect } from "../components/shared";
const schema = z
  .object({
    forceNumber: z.string().trim().min(1, "Enter a force number.").max(64),
    fullName: z.string().trim().min(2, "Enter the full name.").max(255),
    payrollNumber: z.string(),
    nationalId: z.string(),
    dateOfBirth: z.string(),
    gender: z.string(),
    countyId: z.string(),
    ethnicityId: z.string(),
    phone: z.string(),
    dateEnlisted: z.string(),
    dateJoinedUnit: z.string(),
    serviceRemarks: z.string(),
    rankId: z.string(),
    rankEffectiveFrom: z.string(),
    originalRankSpelling: z.string(),
    specialistDesignation: z.string(),
    rankVerified: z.boolean(),
    unitId: z.string(),
    subUnitId: z.string(),
    assignmentEffectiveFrom: z.string(),
    dutyTitle: z.string(),
    assignmentVerified: z.boolean(),
    educationLevel: z.string(),
    qualification: z.string(),
    kcseGrade: z.string(),
    institution: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.rankId && (!data.rankEffectiveFrom || !data.rankVerified))
      ctx.addIssue({
        code: "custom",
        path: ["rankEffectiveFrom"],
        message: "Provide and confirm the verified rank effective date.",
      });
    if (
      data.unitId &&
      (!data.assignmentEffectiveFrom || !data.assignmentVerified)
    )
      ctx.addIssue({
        code: "custom",
        path: ["assignmentEffectiveFrom"],
        message: "Provide and confirm the verified assignment effective date.",
      });
  });
type Form = z.infer<typeof schema>;
const defaults: Form = {
  forceNumber: "",
  fullName: "",
  payrollNumber: "",
  nationalId: "",
  dateOfBirth: "",
  gender: "",
  countyId: "",
  ethnicityId: "",
  phone: "",
  dateEnlisted: "",
  dateJoinedUnit: "",
  serviceRemarks: "",
  rankId: "",
  rankEffectiveFrom: "",
  originalRankSpelling: "",
  specialistDesignation: "",
  rankVerified: false,
  unitId: "",
  subUnitId: "",
  assignmentEffectiveFrom: "",
  dutyTitle: "",
  assignmentVerified: false,
  educationLevel: "",
  qualification: "",
  kcseGrade: "",
  institution: "",
};
const personalPermissions = {
  payrollNumber: "payroll_number",
  nationalId: "national_id",
  dateOfBirth: "date_of_birth",
  gender: "gender",
  countyId: "county",
  ethnicityId: "ethnicity",
  phone: "phone",
  dateEnlisted: "date_enlisted",
} as const;
export function OfficerForm() {
  const { id } = useParams();
  const edit = Boolean(id);
  const { can } = useAuth();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const [error, setError] = useState<unknown>();
  const [initializedId, setInitializedId] = useState<string | null>(null);
  const [initialVersion, setInitialVersion] = useState<number | null>(null);
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });
  const {
    register,
    watch,
    setValue,
    reset,
    handleSubmit,
    formState: { errors, isSubmitting, dirtyFields, isDirty },
  } = form;
  const officer = useQuery({
    queryKey: ["officer", id],
    queryFn: () => api<{ data: Officer }>("/officers/" + id),
    enabled: edit,
  });
  const options = useQuery({
    queryKey: ["officer-options"],
    queryFn: () => api<{ data: Options }>("/officer-options"),
  });
  const service = useQuery({
    queryKey: ["officer-section", id, "service"],
    queryFn: () =>
      api<{
        data: {
          dateJoinedUnit: string | null;
          serviceRemarks: string | null;
        } | null;
      }>("/officers/" + id + "/sections/service"),
    enabled: edit && can("fields.service_profile.view"),
  });
  useEffect(() => {
    if (
      initializedId === id ||
      !officer.data ||
      officer.isFetching ||
      ((service.isPending || service.isFetching || Boolean(service.error)) &&
        can("fields.service_profile.view"))
    )
      return;
    const row = officer.data.data;
    const values = {
      ...defaults,
      forceNumber: row.forceNumber,
      fullName: row.fullName,
    };
    for (const key of Object.keys(
      personalPermissions,
    ) as (keyof typeof personalPermissions)[]) {
      const value = row[key];
      values[key] = value
        ? key === "dateOfBirth" || key === "dateEnlisted"
          ? String(value).slice(0, 10)
          : String(value)
        : "";
    }
    if (service.data?.data) {
      values.dateJoinedUnit =
        service.data.data.dateJoinedUnit?.slice(0, 10) ?? "";
      values.serviceRemarks = service.data.data.serviceRemarks ?? "";
    }
    reset(values);
    setInitialVersion(row.version);
    setInitializedId(id!);
  }, [
    officer.data,
    officer.isFetching,
    service.data,
    service.isPending,
    service.isFetching,
    service.error,
    reset,
    can,
    id,
    initializedId,
  ]);
  const allowed = (key: keyof typeof personalPermissions) =>
    can(`fields.${personalPermissions[key]}.write`) &&
    (!edit || can(`fields.${personalPermissions[key]}.view`));
  const field = (
    name: keyof Form,
    label: string,
    type = "text",
    required = false,
  ) => (
    <div className="form-field" key={name}>
      <label htmlFor={name}>
        {label}
        {required && <span className="required"> *</span>}
      </label>
      <input
        id={name}
        type={type}
        {...register(name)}
        aria-invalid={Boolean(errors[name])}
      />
      {errors[name] && (
        <span className="field-error" role="alert">
          {errors[name]?.message}
        </span>
      )}
    </div>
  );
  const choice = (
    name: "countyId" | "ethnicityId" | "rankId" | "unitId" | "subUnitId",
    label: string,
    list: Options[keyof Options],
  ) => (
    <div className="form-field">
      <label htmlFor={name}>{label}</label>
      <SearchSelect
        id={name}
        options={list}
        value={watch(name)}
        onChange={(value) => {
          setValue(name, value, { shouldDirty: true });
          if (name === "unitId")
            setValue("subUnitId", "", { shouldDirty: true });
        }}
      />
    </div>
  );
  if (!can(edit ? "officers.update" : "officers.create"))
    return (
      <div className="card panel-padding">
        You do not have permission to {edit ? "edit" : "register"} officers.
      </div>
    );
  if (edit && officer.isPending) return <Loading />;
  if (officer.error) return <ErrorNotice error={officer.error} />;
  if (edit && service.error) return <ErrorNotice error={service.error} />;
  if (edit && initializedId !== id) return <Loading />;
  if (officer.data?.data.deletedAt)
    return (
      <div className="card panel-padding">
        Restore this record before editing it.{" "}
        <Link to={"/officers/" + id}>Return to profile</Link>
      </div>
    );
  const refs = options.data?.data ?? {
    ranks: [],
    units: [],
    subUnits: [],
    counties: [],
    ethnicities: [],
  };
  return (
    <>
      <Link className="back-link" to={edit ? "/officers/" + id : "/officers"}>
        <ArrowLeft size={15} />
        {edit ? "Back to profile" : "Back to officers"}
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">OFFICER RECORD</p>
          <h1>{edit ? "Edit officer" : "Register an officer"}</h1>
          <p className="muted">
            Enter verified information. Leave unknown details blank.
          </p>
        </div>
        <span className="badge blue">
          {edit ? "Update record" : "New registration"}
        </span>
      </div>
      {options.error && <ErrorNotice error={options.error} />}
      <form
        onSubmit={handleSubmit(async (values) => {
          setError(undefined);
          try {
            const body: Record<string, unknown> = edit
              ? { version: initialVersion! }
              : { forceNumber: values.forceNumber, fullName: values.fullName };
            for (const key of ["forceNumber", "fullName"] as const)
              if (edit && dirtyFields[key]) body[key] = values[key];
            for (const key of Object.keys(
              personalPermissions,
            ) as (keyof typeof personalPermissions)[])
              if (
                allowed(key) &&
                (!edit || dirtyFields[key]) &&
                (edit || values[key])
              )
                body[key] = values[key] || null;
            if (can("fields.service_profile.write")) {
              const profile: Record<string, unknown> = {};
              if (
                (!edit && values.dateJoinedUnit) ||
                (edit && dirtyFields.dateJoinedUnit)
              )
                profile.dateJoinedUnit = values.dateJoinedUnit || null;
              if (
                (!edit && values.serviceRemarks) ||
                (edit && dirtyFields.serviceRemarks)
              )
                profile.serviceRemarks = values.serviceRemarks || null;
              if (Object.keys(profile).length) body.serviceProfile = profile;
            }
            if (!edit) {
              if (values.rankId)
                body.initialRank = {
                  rankId: values.rankId,
                  effectiveFrom: values.rankEffectiveFrom,
                  originalRankSpelling: values.originalRankSpelling || null,
                  specialistDesignation: values.specialistDesignation || null,
                  datesVerified: values.rankVerified,
                };
              if (values.unitId)
                body.initialAssignment = {
                  unitId: values.unitId,
                  subUnitId: values.subUnitId || null,
                  effectiveFrom: values.assignmentEffectiveFrom,
                  dutyTitle: values.dutyTitle || null,
                  datesVerified: values.assignmentVerified,
                };
              if (
                can("fields.education.write") &&
                [
                  values.educationLevel,
                  values.qualification,
                  values.institution,
                  values.kcseGrade,
                ].some(Boolean)
              )
                body.education = {
                  educationLevel: values.educationLevel || null,
                  qualification: values.qualification || null,
                  institution: values.institution || null,
                  kcseGrade: values.kcseGrade || null,
                };
            }
            const result = await api<{ data: Officer }>(
              edit ? "/officers/" + id : "/officers",
              { method: edit ? "PATCH" : "POST", body },
            );
            await cache.invalidateQueries({ queryKey: ["officers"] });
            await cache.invalidateQueries({
              queryKey: ["officer", result.data.id],
            });
            await cache.invalidateQueries({
              queryKey: ["officer-section", result.data.id],
            });
            navigate("/officers/" + result.data.id, {
              replace: true,
              state: {
                notice: edit
                  ? "Officer record updated."
                  : "Officer registered. Personnel status awaits verification.",
              },
            });
          } catch (error) {
            setError(error);
          }
        })}
      >
        <div className="form-layout">
          <div className="form-sections">
            <section className="card form-card">
              <div className="section-heading">
                <span>A</span>
                <div>
                  <h2>Personal information</h2>
                  <p>Core identity and contact details</p>
                </div>
              </div>
              <div className="form-grid">
                {field("forceNumber", "Force number", "text", true)}
                {field("fullName", "Full name", "text", true)}
                {allowed("nationalId") &&
                  field("nationalId", "National ID number")}
                {allowed("dateOfBirth") &&
                  field("dateOfBirth", "Date of birth", "date")}
                {allowed("gender") && field("gender", "Gender")}
                {allowed("phone") && field("phone", "Phone number", "tel")}
                {allowed("countyId") &&
                  choice("countyId", "County", refs.counties)}
                {allowed("ethnicityId") &&
                  choice("ethnicityId", "Ethnicity", refs.ethnicities)}
              </div>
            </section>
            <section className="card form-card">
              <div className="section-heading">
                <span>B</span>
                <div>
                  <h2>Service information</h2>
                  <p>Identifiers and confirmed service dates</p>
                </div>
              </div>
              <div className="form-grid">
                {allowed("payrollNumber") &&
                  field("payrollNumber", "Payroll number")}
                {allowed("dateEnlisted") &&
                  field("dateEnlisted", "Date enlisted", "date")}
                {can("fields.service_profile.write") &&
                  (!edit || can("fields.service_profile.view")) &&
                  field("dateJoinedUnit", "Date joined unit", "date")}
              </div>
              <p className="form-hint">
                A personnel status is not inferred from registration. Strength
                and retirement rules remain subject to approval.
              </p>
            </section>
            {!edit && (
              <section className="card form-card">
                <div className="section-heading">
                  <span>C</span>
                  <div>
                    <h2>Initial rank & assignment</h2>
                    <p>
                      Only enter a baseline when its effective date is verified
                    </p>
                  </div>
                </div>
                {can("fields.rank_history.write") && (
                  <>
                    <div className="form-grid">
                      {choice("rankId", "Rank", refs.ranks)}
                      {watch("rankId") && (
                        <>
                          {field(
                            "rankEffectiveFrom",
                            "Verified rank effective date",
                            "date",
                          )}
                          {field(
                            "originalRankSpelling",
                            "Original rank spelling",
                          )}
                          {field(
                            "specialistDesignation",
                            "Specialist designation",
                          )}
                        </>
                      )}
                    </div>
                    {watch("rankId") && (
                      <label className="checkbox-label">
                        <input type="checkbox" {...register("rankVerified")} />I
                        have verified this rank effective date against an
                        authoritative source.
                      </label>
                    )}
                  </>
                )}
                {can("fields.assignments.write") && (
                  <>
                    <div className="form-grid mt-5">
                      {choice("unitId", "Unit", refs.units)}
                      {watch("unitId") && (
                        <>
                          {choice(
                            "subUnitId",
                            "Sub-unit",
                            refs.subUnits.filter(
                              (o) => o.unitId === watch("unitId"),
                            ),
                          )}
                          {field(
                            "assignmentEffectiveFrom",
                            "Verified assignment effective date",
                            "date",
                          )}
                          {field("dutyTitle", "Duty title")}
                        </>
                      )}
                    </div>
                    {watch("unitId") && (
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          {...register("assignmentVerified")}
                        />
                        I have verified this assignment effective date against
                        an authoritative source.
                      </label>
                    )}
                  </>
                )}
                {!can("fields.assignments.write") &&
                  !can("fields.rank_history.write") && (
                    <p className="muted">
                      Rank and assignment entries require additional
                      authorization.
                    </p>
                  )}
                {(!refs.ranks.length || !refs.units.length) && (
                  <p className="form-hint">
                    Reference values may be unconfigured pending organizational
                    review. You can register the core record without assigning a
                    rank or unit.
                  </p>
                )}
              </section>
            )}
            {!edit && can("fields.education.write") && (
              <section className="card form-card">
                <div className="section-heading">
                  <span>D</span>
                  <div>
                    <h2>Education & training</h2>
                    <p>
                      Initial education details; courses appear in the officer
                      profile
                    </p>
                  </div>
                </div>
                <div className="form-grid">
                  {field("educationLevel", "Education level")}
                  {field("qualification", "Qualification")}
                  {field("institution", "Institution")}
                  {field("kcseGrade", "KCSE grade")}
                </div>
              </section>
            )}
            {can("fields.service_profile.write") &&
              (!edit || can("fields.service_profile.view")) && (
                <section className="card form-card">
                  <div className="section-heading">
                    <span>E</span>
                    <div>
                      <h2>Additional information</h2>
                      <p>Service remarks visible only to authorized users</p>
                    </div>
                  </div>
                  <label htmlFor="serviceRemarks">Service remarks</label>
                  <textarea
                    id="serviceRemarks"
                    rows={4}
                    maxLength={5000}
                    {...register("serviceRemarks")}
                  />
                </section>
              )}
          </div>
          <aside className="form-guidance">
            <ShieldCheck size={24} />
            <h3>A reliable personnel record</h3>
            <p>
              Force numbers are unique. Enter identifiers exactly as recorded,
              including leading zeroes.
            </p>
            <hr />
            <p>
              Unknown history belongs in staging. Do not substitute a letter
              date or today’s date for an unverified effective date.
            </p>
            <hr />
            <p>
              Only fields your role can read and write appear in the editor.
            </p>
          </aside>
        </div>
        {Boolean(error) && <ErrorNotice error={error} />}
        <div className="form-footer">
          <span>
            <span className="required">*</span> Required fields
          </span>
          <div>
            <Button variant="outline" asChild>
              <Link to={edit ? "/officers/" + id : "/officers"}>Cancel</Link>
            </Button>
            <Button type="submit" disabled={isSubmitting || (edit && !isDirty)}>
              <Save size={16} />
              {isSubmitting
                ? "Saving…"
                : edit
                  ? "Save changes"
                  : "Register officer"}
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}
