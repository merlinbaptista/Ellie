import { describe, expect, it } from "vitest";
import { signPhoneLink } from "../src/links/sign.js";
import { createShortLink, deleteForHousehold, getShortLink } from "../src/links/shortLinks.js";
import { createTestContext } from "./helpers.js";

describe("phone short links", () => {
  it("creates 8-character unambiguous codes and deletes links by household", async () => {
    const ctx = await createTestContext();
    const signed = signPhoneLink({ householdId: "hh_short-1", kind: "summary", env: ctx.env });
    const first = await createShortLink(ctx, { token: signed.token, householdId: "hh_short-1", kind: "summary", exp: signed.payload.exp });
    const second = await createShortLink(ctx, { token: signed.token, householdId: "hh_short-1", kind: "summary", exp: signed.payload.exp });
    expect(first.code).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]{8}$/);
    expect(new URL(first.url).pathname).toBe(`/l/${first.code}`);
    await expect(getShortLink(ctx, first.code)).resolves.toMatchObject({ householdId: "hh_short-1", kind: "summary" });
    expect(await deleteForHousehold(ctx, "hh_short-1")).toBe(2);
    await expect(getShortLink(ctx, second.code)).resolves.toBeNull();
  });
});
