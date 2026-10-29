import { HttpError } from "./errors.js";
type Rule = {
  rankId: string | null;
  retirementAge: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  isActive: boolean;
  approvedAt: Date | null;
  approvedById: string | null;
};
export function retirementRule(rules: Rule[], rankId: string, on: Date) {
  const valid = rules.filter(
    (r) =>
      r.isActive &&
      r.approvedAt &&
      r.approvedById &&
      r.effectiveFrom <= on &&
      (!r.effectiveTo || on < r.effectiveTo),
  );
  const specific = valid.filter((r) => r.rankId === rankId);
  const selected = specific.length
    ? specific
    : valid.filter((r) => r.rankId === null);
  if (selected.length !== 1)
    throw new HttpError(
      409,
      selected.length
        ? "AMBIGUOUS_RETIREMENT_POLICY"
        : "RETIREMENT_POLICY_UNCONFIGURED",
    );
  return selected[0]!;
}
export function strengthDecision(
  rules: {
    status: string;
    deploymentStatus: string;
    includeNominal: boolean;
    includeOperational: boolean;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    isActive: boolean;
    approvedAt: Date | null;
    approvedById: string | null;
  }[],
  status: string,
  deployment: string,
  on: Date,
) {
  const eligible = rules.filter(
    (r) =>
      r.status === status &&
      r.isActive &&
      r.approvedAt &&
      r.approvedById &&
      r.effectiveFrom <= on &&
      (!r.effectiveTo || on < r.effectiveTo),
  );
  const exact = eligible.filter((r) => r.deploymentStatus === deployment);
  const matches = exact.length
    ? exact
    : eligible.filter((r) => r.deploymentStatus === "*");
  if (matches.length !== 1)
    throw new HttpError(
      409,
      matches.length
        ? "AMBIGUOUS_STRENGTH_POLICY"
        : "STRENGTH_POLICY_UNCONFIGURED",
    );
  return {
    nominal: matches[0]!.includeNominal,
    operational: matches[0]!.includeOperational,
  };
}
