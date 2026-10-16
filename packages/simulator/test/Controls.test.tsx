import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HouseholdSwitcher } from "../src/controls/HouseholdSwitcher.js";
import { TimeControls } from "../src/controls/TimeControls.js";

describe("simulator controls", () => {
  it("switches between seeded households and a fresh home", () => {
    const change = vi.fn();
    render(<HouseholdSwitcher current="demo-blr" onChange={change} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Household" }), { target: { value: "demo-tx" } });
    expect(change).toHaveBeenCalledWith("demo-tx");
  });
  it("exposes time travel presets and reseed", () => {
    const travel = vi.fn(); const reseed = vi.fn();
    render(<TimeControls onTravel={travel} onReseed={reseed} />);
    fireEvent.click(screen.getByRole("button", { name: "+7 days" }));
    fireEvent.click(screen.getByRole("button", { name: /Day 30/ }));
    fireEvent.click(screen.getByRole("button", { name: "Reseed" }));
    expect(travel).toHaveBeenNthCalledWith(1, "week");
    expect(travel).toHaveBeenNthCalledWith(2, "day30");
    expect(reseed).toHaveBeenCalledOnce();
  });
});
