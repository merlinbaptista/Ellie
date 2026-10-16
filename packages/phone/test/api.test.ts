import { afterEach, describe, expect, it, vi } from "vitest";
import { getPhoneView, PhoneApiError } from "../src/api.js";

afterEach(() => vi.unstubAllGlobals());
describe("phone API client", () => {
  it("sends the token only as a Bearer header and requests the selected language", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ kind: "fix" }) });
    vi.stubGlobal("fetch", fetchMock);
    await getPhoneView("secret.token", "kn");
    expect(fetchMock).toHaveBeenCalledWith("/api/phone/view?lang=kn", expect.objectContaining({ headers: { authorization: "Bearer secret.token" } }));
  });
  it("maps expiry and offline errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 410, json: async () => ({ message: "expired", error: "expired" }) }));
    await expect(getPhoneView("token")).rejects.toMatchObject<Partial<PhoneApiError>>({ status: 410 });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(getPhoneView("token")).rejects.toMatchObject({ status: 0, code: "offline" });
  });
});
