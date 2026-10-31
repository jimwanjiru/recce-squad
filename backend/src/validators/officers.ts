import { z } from "zod";
import { verifiedDate } from "../services/history.js";
const nullableText = (max = 191) => z.string().trim().max(max).nullable();
const date = z
  .string()
  .refine((value) => {
    try {
      verifiedDate(value);
      return true;
    } catch {
      return false;
    }
  }, "Enter a complete valid date (YYYY-MM-DD)")
  .transform(verifiedDate);
const profile = z
  .object({
    dateJoinedUnit: date.nullable().optional(),
    serviceRemarks: nullableText(5000).optional(),
  })
  .strict();
export const initialRank = z
  .object({
    rankId: z.string().min(1),
    effectiveFrom: date,
    originalRankSpelling: nullableText().optional(),
    specialistDesignation: nullableText().optional(),
    referenceNumber: nullableText().optional(),
    datesVerified: z.literal(true),
  })
  .strict();
const initialAssignment = z
  .object({
    unitId: z.string().min(1),
    subUnitId: nullableText().optional(),
    effectiveFrom: date,
    dutyTitle: nullableText().optional(),
    disposition: nullableText().optional(),
    datesVerified: z.literal(true),
  })
  .strict();
const education = z
  .object({
    educationLevel: nullableText().optional(),
    qualification: nullableText().optional(),
    kcseGrade: nullableText().optional(),
    institution: nullableText().optional(),
    completionDate: date.nullable().optional(),
  })
  .strict();
export const officerFields = {
  forceNumber: z.string().trim().min(1).max(64),
  fullName: z.string().trim().min(2).max(255),
  payrollNumber: nullableText(64),
  nationalId: nullableText(64),
  dateOfBirth: date.nullable(),
  gender: nullableText(32),
  countyId: nullableText(),
  ethnicityId: nullableText(),
  phone: nullableText(255),
  assignedDuties: z
    .string()
    .max(65535)
    .refine(
      (v) => Buffer.byteLength(v, "utf8") <= 65535,
      "Assigned duties is too long",
    )
    .nullable(),
  dateEnlisted: date.nullable(),
};
export const createOfficer = z
  .object({
    ...officerFields,
    serviceProfile: profile.optional(),
    initialRank: initialRank.optional(),
    initialAssignment: initialAssignment.optional(),
    education: education.optional(),
  })
  .partial({
    payrollNumber: true,
    nationalId: true,
    dateOfBirth: true,
    gender: true,
    countyId: true,
    ethnicityId: true,
    phone: true,
    assignedDuties: true,
    dateEnlisted: true,
  })
  .strict();
export const updateOfficer = z
  .object(officerFields)
  .partial()
  .extend({
    version: z.number().int().min(0),
    serviceProfile: profile.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 1, "Provide at least one change");
export const revision = z.object({ version: z.number().int().min(0) }).strict();
