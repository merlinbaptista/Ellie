import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, describe, expect, it } from "vitest";
import { registerStaticPhone } from "../src/http/static.js";

const servers: Array<ReturnType<express.Express["listen"]>> = [];
afterAll(async () => { await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))); });

describe("static phone page", () => {
  it("serves the phone SPA with security headers, no-store HTML and immutable assets", async () => {
    const app = express();
    expect(registerStaticPhone(app)).toBe(true);
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await once(server, "listening");
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const response = await fetch(`${base}/phone/`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'self'");
    expect(await response.text()).toContain("Ellie");
    const asset = await fetch(`${base}/phone/manifest.webmanifest`);
    expect(asset.status).toBe(200);
  });
});
