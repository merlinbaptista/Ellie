import { z } from "zod";

export const IdPrefix = { household: "hh", item: "itm", event: "evt", prediction: "prd", resolution: "res", diagnosis: "dgn" } as const;
export const zId = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[a-z0-9-]{3,64}$`));
export const zHouseholdId = z.string().regex(/^(hh_[a-z0-9-]{3,64}|demo-[a-z0-9-]{2,32})$/);
export const zItemId = zId("itm");
export const zEventId = zId("evt");
export const zIsoUtc = z.string().datetime({ offset: false });
export const zLocalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const zCountry = z.string().regex(/^[A-Z]{2}$/);
export const zRegionCode = z.union([zCountry, z.literal("DEFAULT")]);
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}
export const zTimeZone = z.string().refine(isValidTimeZone, "Invalid IANA time zone");
export const zLanguageTag = z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/);
export const zE164 = z.string().regex(/^\+[1-9]\d{7,14}$/);
export const zCurrency = z.string().regex(/^[A-Z]{3}$/);
export const zMoney = z.object({ amount: z.number().nonnegative(), currency: zCurrency });
export const zSourceRef = z.object({
  url: z.string().url().optional(),
  note: z.string().max(300),
  verified: z.boolean(),
  checkedOn: zLocalDate.optional(),
});
