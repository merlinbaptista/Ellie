import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Card } from "../src/Card.js";
import { StatusPill, type StatusKind } from "../src/StatusPill.js";

describe("Card", () => {
  it("renders every status with an icon and text label", () => {
    const statuses: StatusKind[] = ["ok", "due", "due_soon", "overdue", "warning", "info"];
    render(<>{statuses.map((status) => <StatusPill key={status} status={status} />)}</>);
    for (const label of ["OK", "Due", "Due soon", "Overdue", "Warning", "Information"]) expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getAllByText(/[✓◷!⚠i]/).length).toBeGreaterThanOrEqual(statuses.length);
  });

  it("renders external links and invokes tool actions without interpreting markup", () => {
    const onAction = vi.fn();
    render(<Card card={{ title: "<img src=x onerror=alert(1)>", items: [{ label: "Unsafe", value: "<b>text</b>", status: "info" }], actions: [{ label: "Open", url: "https://example.com" }, { label: "Predict", tool: "predict_next", args: { item: "AC" } }] }} onAction={onAction} />);
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("<b>text</b>")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Open" });
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    fireEvent.click(screen.getByRole("button", { name: "Predict" }));
    expect(onAction).toHaveBeenCalledWith({ label: "Predict", tool: "predict_next", args: { item: "AC" } });
  });
});
