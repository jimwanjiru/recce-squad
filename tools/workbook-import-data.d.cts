import type { Prisma } from "@prisma/client";
export type SourceRow = {
  sheet: string;
  row: number;
  raw: Record<string, unknown>;
  dates: Record<string, unknown>;
  originalRank: string | null;
  errors: string[];
  candidate: null | {
    eligible: boolean;
    data: Pick<
      Prisma.OfficerUncheckedCreateInput,
      | "forceNumber"
      | "fullName"
      | "recordStatus"
      | "payrollNumber"
      | "gender"
      | "nationalId"
      | "phone"
      | "dateOfBirth"
      | "dateEnlisted"
    >;
    education: null | {
      educationLevel: string | null;
      kcseGrade: string | null;
    };
  };
};
export function readWorkbook(
  file: string,
): Promise<{
  sha256: string;
  rows: SourceRow[];
  summary: {
    sourceRows: number;
    candidateOfficers: number;
    eligibleOfficers: number;
    heldOfficers: number;
    rowsWithReviewFlags: number;
    sheets: string[];
  };
}>;
export function seal(
  raw: unknown,
  key: Buffer,
  context: string,
): Prisma.InputJsonObject;
