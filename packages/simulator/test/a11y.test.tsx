import { axe, toHaveNoViolations } from "jest-axe";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../src/App.js";

expect.extend(toHaveNoViolations);
afterEach(() => vi.unstubAllGlobals());

describe("simulator accessibility", () => {
  it("has no axe violations on its main screen", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const value = url.includes("/api/sim/session")
        ? { sessionId: "session-a11y-1234", household: { householdId: "demo-blr", name: "Merlin's home", country: "IN", region: "Bengaluru", timeZone: "Asia/Kolkata", language: "en-IN", phoneLanguage: "en-IN" }, suggestions: ["What's due this week?"], voiceLang: "en-IN", controlsEnabled: true }
        : url.includes("/api/outbox") ? [] : { production: false };
      return { ok: true, status: 200, json: async () => value, text: async () => "" } as Response;
    }));
    const { container } = render(<App />);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Say something to Ellie" })).toBeInTheDocument());
    expect(await axe(container)).toHaveNoViolations();
  });
});
