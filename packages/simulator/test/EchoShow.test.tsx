import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EchoShow } from "../src/echo/EchoShow.js";

const household = { householdId: "demo-blr", name: "Merlin's home", country: "IN", region: "Bengaluru", timeZone: "Asia/Kolkata", language: "en-IN", phoneLanguage: "en-IN" };
const card = (title: string) => ({ title, items: [{ label: "Status", value: "Due today", status: "due" as const }] });
describe("Echo Show display", () => {
  it("announces captions and displays one or two cards with the light state", () => {
    const { rerender, container } = render(<EchoShow household={household} cards={[card("Cylinder")] } speech="Your cylinder is due today." state="speaking" listeningText="" muted={false} onMute={vi.fn()} onAction={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText("Your cylinder is due today.")).toHaveAttribute("aria-live", "polite");
    expect(container.querySelector(".echo-light--speaking")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cylinder" })).toBeInTheDocument();
    rerender(<EchoShow household={household} cards={[card("Cylinder"), card("Purifier")]} speech="Two things need attention." state="awaiting_answer" listeningText="" muted={false} onMute={vi.fn()} onAction={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Cylinder" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Purifier" })).toBeInTheDocument();
    expect(container.querySelector(".echo-light--awaiting_answer")).toBeInTheDocument();
  });
  it("exposes a carousel for three or more cards and routes tool actions", () => {
    const onAction = vi.fn();
    render(<EchoShow household={household} cards={[card("One"), card("Two"), { ...card("Three"), actions: [{ label: "See history", tool: "get_history", args: { item: "Gas" } }] }]} speech="Results" state="idle" listeningText="" muted={false} onMute={vi.fn()} onAction={onAction} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Show card 3" }));
    expect(screen.getByRole("heading", { name: "Three" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "See history" }));
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ tool: "get_history" }));
  });
});
