import { z } from "zod";

// The shape of rules.json, from the plan's "Rules data model". A file that breaks any
// rule here is rejected whole, and the app keeps its last good copy (see decisions.md).
// Imports only zod, so the visa-copilot-rules repo's CI can run this same file.

export const categories = ["identity", "forms", "fees", "money", "travel", "purpose", "ties", "interview"] as const;

const text = z.string().trim().min(1);
const httpsUrl = z.url({ protocol: /^https$/ });
const countryCodes = z.array(z.string().regex(/^[A-Z]{2}$/)).min(1);

function hasUniqueIds(items: { id: string }[]) {
  return new Set(items.map((item) => item.id)).size === items.length;
}

export const requirementSchema = z.object({
  id: z.string().min(1),
  revision: z.int().min(1),
  category: z.enum(categories),
  title: text,
  detail: text,
  mandatory: z.boolean(),
  appliesTo: countryCodes.nullable(),
  source: z.object({ title: text, url: httpsUrl }),
  sourceQuote: text,
  effectiveDate: z.iso.date().nullable(),
  lastVerified: z.iso.date(),
});

export const corridorSchema = z.object({
  id: z.string().min(1),
  destination: text,
  visaType: text,
  nationalities: countryCodes,
  officialUrl: httpsUrl,
  requirements: z.array(requirementSchema).refine(hasUniqueIds, { error: "Requirement ids must be unique in a corridor" }),
});

export const rulesFileSchema = z.object({
  schemaVersion: z.literal(1),
  version: text,
  corridors: z.array(corridorSchema).min(1).refine(hasUniqueIds, { error: "Corridor ids must be unique" }),
});

export type Category = (typeof categories)[number];
export type Requirement = z.infer<typeof requirementSchema>;
export type Corridor = z.infer<typeof corridorSchema>;
export type RulesFile = z.infer<typeof rulesFileSchema>;
