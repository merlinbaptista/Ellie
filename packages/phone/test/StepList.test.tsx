import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StepList } from "../src/components/StepList.js";

afterEach(cleanup);
beforeEach(() => localStorage.clear());
describe("StepList", () => {
  it("persists checked progress by diagnosis across rerenders", () => {
    const { unmount } = render(<StepList steps={["First", "Second", "Third"]} refId="dgn_steps" lang="en" />);
    fireEvent.click(screen.getByLabelText("First"));
    expect(screen.getByText("1 of 3 done")).toBeInTheDocument();
    unmount();
    render(<StepList steps={["First", "Second", "Third"]} refId="dgn_steps" lang="en" />);
    expect(screen.getByLabelText("First")).toBeChecked();
    expect(localStorage.getItem("ellie.steps.dgn_steps")).toBe("[0]");
  });
});
