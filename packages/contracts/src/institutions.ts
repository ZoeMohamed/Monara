// The banks, cards, and wallets Monara recognizes in Gmail, shared by the web app
// (account choices and suggestions) and the agent (which senders to read and how
// a sender maps to a Financial Account). The list lives in institution-senders.json
// and is validated once when this module loads.
import { z } from "zod";
import { brands } from "./brand-registry.ts";
import registryFile from "./institutions/institution-senders.json" with { type: "json" };

export const institutionPlatformSchema = z.enum(["BANKING_APP", "CREDIT_CARD", "E_WALLET"]);

const senderEmailSchema = z.email().max(320);

const registryEntrySchema = z
  .object({
    key: z.string().regex(/^[A-Za-z0-9_]{1,60}$/),
    name: z.string().trim().min(1).max(100),
    provider: z.string().trim().min(1).max(100),
    platform: institutionPlatformSchema,
    senderEmails: z.array(senderEmailSchema).max(20),
    /**
     * Case-insensitive subject patterns of this sender's mail that is never a
     * transaction, such as promotions. Matching mail skips the model. Add a pattern
     * only after seeing that sender's real subjects.
     */
    skipSubjects: z
      .array(
        z
          .string()
          .min(1)
          .max(200)
          .refine(
            (pattern) => {
              try {
                new RegExp(pattern, "i");
                return true;
              } catch {
                return false;
              }
            },
            { message: "skipSubjects entries must be valid regular expressions." },
          ),
      )
      .max(20)
      .optional(),
  })
  .strict();

const registrySchema = z
  .object({
    source: z.string(),
    note: z.string(),
    withSenderEmails: z.array(
      registryEntrySchema.refine((entry) => entry.senderEmails.length > 0, {
        message: "Entries with sender emails need at least one.",
      }),
    ),
    noKnownSenderEmail: z.array(
      registryEntrySchema.refine((entry) => entry.senderEmails.length === 0, {
        message: "Entries without known senders must list none.",
      }),
    ),
    allSenderEmails: z.array(senderEmailSchema),
  })
  .strict()
  .superRefine((registry, context) => {
    const entries = [...registry.withSenderEmails, ...registry.noKnownSenderEmail];
    const keys = new Set<string>();
    const senders = new Map<string, string>();
    for (const entry of entries) {
      if (keys.has(entry.key)) {
        context.addIssue({ code: "custom", message: `Duplicate institution key ${entry.key}.` });
      }
      keys.add(entry.key);
      for (const sender of entry.senderEmails) {
        const address = sender.toLowerCase();
        // One sender must identify exactly one entry, or account mapping would be ambiguous.
        if (senders.has(address)) {
          context.addIssue({ code: "custom", message: `Sender ${sender} is listed twice.` });
        }
        senders.set(address, entry.key);
      }
    }
    const listed = new Set(registry.allSenderEmails.map((sender) => sender.toLowerCase()));
    if (listed.size !== senders.size || [...senders.keys()].some((sender) => !listed.has(sender))) {
      context.addIssue({
        code: "custom",
        message: "allSenderEmails must match the entries' sender emails.",
      });
    }
  });

const registry = registrySchema.parse(registryFile);

export type InstitutionPlatform = z.infer<typeof institutionPlatformSchema>;
export type Institution = z.infer<typeof registryEntrySchema>;

/** Every institution a Financial Account can belong to, detectable in Gmail or not. */
export const institutions: readonly Institution[] = [
  ...registry.withSenderEmails,
  ...registry.noKnownSenderEmail,
];

/** Institutions whose transaction emails Monara can recognize by sender. */
export const emailInstitutions: readonly Institution[] = registry.withSenderEmails;

const institutionsByKey = new Map(institutions.map((entry) => [entry.key, entry]));
const institutionsBySender = new Map(
  emailInstitutions.flatMap((entry) =>
    entry.senderEmails.map((sender) => [sender.toLowerCase(), entry] as const),
  ),
);

export const institutionKeySchema = z
  .string()
  .refine((key) => institutionsByKey.has(key) || /^custom_[a-f0-9]{32}$/.test(key), {
    message: "Unknown institution.",
  });

/** Syntax only. The backend and database must also enforce ownership. */
export const customInstitutionKeySchema = z.string().regex(/^custom_[a-f0-9]{32}$/);

export function customBankKey(id: string): string {
  return `custom_${z.uuid().parse(id).replaceAll("-", "").toLowerCase()}`;
}

export function customBankIdForKey(key: string | null | undefined): string | null {
  if (!key || !customInstitutionKeySchema.safeParse(key).success) return null;
  const id = key.slice(7);
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

export const bankLogoSchema = z
  .string()
  .max(100)
  .refine(
    (value) => {
      if (/^si:[a-z0-9]{1,60}$/.test(value)) return true;
      return value.startsWith("brand:") && Object.hasOwn(brands, value.slice(6));
    },
    { message: "Choose a logo from the search results." },
  );

/** Current, owner-resolved source configuration supplied to the Worker. */
export const resolvedInstitutionSchema = registryEntrySchema.extend({ key: institutionKeySchema });

export function institutionSources(
  keys: readonly string[],
  resolved: readonly Institution[] = [],
): Institution[] {
  const owned = new Map(resolved.map((entry) => [entry.key, entry]));
  return [...new Set(keys)].flatMap((key) => {
    const entry = owned.get(key) ?? findInstitution(key);
    return entry ? [entry] : [];
  });
}

export type InstitutionKey = z.infer<typeof institutionKeySchema>;

export function findInstitution(key: string): Institution | null {
  return institutionsByKey.get(key) ?? null;
}

/** The entry whose sender list contains this exact address, ignoring case. */
export function findInstitutionBySender(address: string): Institution | null {
  return institutionsBySender.get(address.trim().toLowerCase()) ?? null;
}

/** The domain part of a sender address, lowercased. */
export function senderDomain(address: string): string {
  return address.slice(address.lastIndexOf("@") + 1).toLowerCase();
}
