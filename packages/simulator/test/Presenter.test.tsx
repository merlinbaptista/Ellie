import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Presenter } from "../src/presenter/Presenter.js";
import { presenterAllowed } from "../src/presenter/types.js";

const step = { id: "due", title: "What's due this week?", household: "demo-blr" as const, action: { kind: "say" as const, text: "What's due this week?" }, presenterNote: "Your household history drives the answer." };
const nextStep = { ...step, id: "hero", title: "The hero" };
afterEach(cleanup);

describe("presenter controls", () => {
  it("offers voice and chip fallback and shows expectation results", () => {
    const onSpeak = vi.fn();
    const onChip = vi.fn();
    render(<Presenter steps={[step]} index={0} busy={false} result={{ ok: false, reason: "Missing due date" }} onNext={vi.fn()} onBack={vi.fn()} onRestart={vi.fn()} onSpeak={onSpeak} onChip={onChip} />);
    expect(screen.getByText("Your household history drives the answer.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Speak now" }));
    fireEvent.click(screen.getByRole("button", { name: "Use chip" }));
    expect(onSpeak).toHaveBeenCalledOnce();
    expect(onChip).toHaveBeenCalledOnce();
    expect(screen.getByRole("img", { name: "Step failed: Missing due date" })).toBeInTheDocument();
  });

  it("keeps presenter actions out of the Echo Show component tree", () => {
    const { container } = render(<Presenter steps={[step]} index={0} busy={false} onNext={vi.fn()} onBack={vi.fn()} onRestart={vi.fn()} onSpeak={vi.fn()} onChip={vi.fn()} />);
    expect(container.querySelector(".presenter-bar")).toBeInTheDocument();
    expect(container.querySelector(".echo-show")).toBeNull();
  });

  it("is hidden in production until a simulator access code is available", () => {
    expect(presenterAllowed(true, false)).toBe(false);
    expect(presenterAllowed(true, true)).toBe(true);
    expect(presenterAllowed(false, false)).toBe(true);
  });

  it("exposes back, next, and restart navigation callbacks", () => {
    const onNext = vi.fn();
    const onBack = vi.fn();
    const onRestart = vi.fn();
    render(<Presenter steps={[step, nextStep]} index={1} busy={false} onNext={onNext} onBack={onBack} onRestart={onRestart} onSpeak={vi.fn()} onChip={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    expect(onBack).toHaveBeenCalledOnce();
    expect(onNext).toHaveBeenCalledOnce();
    expect(onRestart).toHaveBeenCalledOnce();
  });
});
