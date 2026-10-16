import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorPage } from "../src/pages/ErrorPage.js";
import { PhoneApiError } from "../src/api.js";

describe("phone error page", () => {
  it("distinguishes invalid, expired and offline states and allows retry", () => {
    render(<ErrorPage error={new PhoneApiError(410, "expired")} lang="en" onRetry={vi.fn()} />);
    expect(screen.getByText(/link has expired/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
  it("asks users without a session token to reopen their message link", () => {
    render(<ErrorPage noToken lang="en" />);
    expect(screen.getByText(/open the link from your message again/i)).toBeInTheDocument();
  });
});
