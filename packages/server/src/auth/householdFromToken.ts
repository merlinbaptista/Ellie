import { createHash } from "node:crypto";
import type { JWTPayload } from "jose";
import type { AppContext } from "../context.js";
import { subjectPk, subjectSk } from "../data/keys.js";

export async function householdFromToken(ctx: AppContext, claims: JWTPayload): Promise<string> {
  const claimName = ctx.env.OAUTH_HOUSEHOLD_CLAIM;
  const claimed = claims[claimName];
  if (typeof claimed === "string" && /^(?:demo-[a-z0-9-]{2,32}|hh_[a-z0-9-]{3,64})$/.test(claimed)) return claimed;
  const subject = typeof claims.sub === "string" ? claims.sub : "";
  if (!subject) throw new Error("Token subject is required");
  const hash = createHash("sha256").update(subject).digest("hex").slice(0, 32);
  const existing = await ctx.storage.get(subjectPk(), subjectSk(hash));
  if (typeof existing?.data.householdId === "string") return existing.data.householdId;
  const householdId = `hh_${hash.slice(0, 20)}`;
  await ctx.storage.put({ pk: subjectPk(), sk: subjectSk(hash), type: "oauth-subject", data: { householdId } });
  return householdId;
}
