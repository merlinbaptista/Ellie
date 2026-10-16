import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PhoneView } from "@ellie/schema";
import { PhoneViewRenderer } from "../src/PhoneViewRenderer.js";

const base: PhoneView = { kind: "fix", title: "Purifier fix", language: "en-IN", sections: [{ heading: "Steps", list: ["Switch off", "Replace filter"], ordered: true, tone: "normal" }, { heading: "Call a professional if", body: "It still leaks", ordered: false, tone: "warning" }], actions: [{ id: "fixed", label: "Fixed it", method: "post" }], expiresAt: "2026-10-20T00:00:00.000Z", generatedAt: "2026-10-16T00:00:00.000Z" };

describe("PhoneViewRenderer", () => {
  it("renders ordered steps and warning sections as text", () => {
    render(<PhoneViewRenderer view={base} />);
    expect(screen.getByRole("list").tagName).toBe("OL");
    expect(screen.getByText("It still leaks").closest("section")).toHaveClass("ellie-section--warning");
  });

  it("shows only the safety banner and call action for safety views", () => {
    const view: PhoneView = { ...base, sections: [{ heading: "Safety", body: "Leave and call now.", ordered: false, tone: "safety" }, { heading: "Steps", list: ["Unsafe step"], ordered: true, tone: "normal" }], actions: [{ id: "call", label: "Call emergency services", url: "tel:1906", method: "link" }, { id: "fixed", label: "Fixed it", method: "post" }] };
    render(<PhoneViewRenderer view={view} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Leave and call now.");
    expect(screen.getByRole("link", { name: "Call emergency services" })).toHaveAttribute("href", "tel:1906");
    expect(screen.queryByText("Unsafe step")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fixed it" })).not.toBeInTheDocument();
  });
});
