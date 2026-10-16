import { describe, expect, it } from "vitest";
import { cleanUtterance } from "../src/simulator/wake.js";

describe("simulator wake-word cleanup", () => {
  it.each([
    ["Alexa, what's due?", "what's due?"],
    ["Hey Alexa, um tell me what's due", "tell me what's due"],
    ["OK Alexa uh the gas changed", "the gas changed"],
    ["Ask Ellie to show my history", "show my history"],
    ["Tell Ellie that the purifier is beeping", "the purifier is beeping"],
  ])("cleans %s", (input, expected) => expect(cleanUtterance(input)).toBe(expected));
  it("returns empty after a wake word with no command", () => expect(cleanUtterance("Alexa, um uh")).toBe(""));
});
