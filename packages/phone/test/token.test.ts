import { afterEach, describe, expect, it, vi } from "vitest";
import { captureToken, clearToken, readLinkClaims } from "../src/token.js";

describe("phone token handling", () => {
  afterEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); });
  it("stores the query token and removes it from the browser URL", () => {
    const location = { pathname: "/phone/", search: "?t=eyJ2IjoxfQ.sig&x=1", hash: "#guide" } as Location;
    const history = { replaceState: vi.fn() } as unknown as History;
    expect(captureToken(location, sessionStorage, history)).toBe("eyJ2IjoxfQ.sig");
    expect(sessionStorage.getItem("ellie.t")).toBe("eyJ2IjoxfQ.sig");
    expect(history.replaceState).toHaveBeenCalledWith(null, "", "/phone/?x=1#guide");
    expect(captureToken({ ...location, search: "" } as Location, sessionStorage, history)).toBe("eyJ2IjoxfQ.sig");
  });
  it("reads unsigned token claims only for page routing", () => {
    const payload = btoa(JSON.stringify({ v: 1, hh: "demo-blr", kind: "fix", ref: "dgn_route-1", exp: 1, nonce: "abcdefghij" })).replace(/=/g, "");
    expect(readLinkClaims(`${payload}.signature`)?.kind).toBe("fix");
    expect(readLinkClaims("bad")).toBeNull();
    clearToken();
    expect(sessionStorage.getItem("ellie.t")).toBeNull();
  });
});
