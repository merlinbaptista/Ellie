import { existsSync, statSync } from "node:fs";
import express, { type Express } from "express";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { timingSafeEqual } from "node:crypto";

const phoneDist = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../packages/phone/dist");
const simulatorDist = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../packages/simulator/dist");
export function hasPhoneBuild(): boolean { return existsSync(resolve(phoneDist, "index.html")); }
export function hasSimulatorBuild(): boolean { return existsSync(resolve(simulatorDist, "index.html")); }
function simulatorCookie(req: express.Request): string | undefined {
  const value = req.headers.cookie?.split(";").map((entry) => entry.trim()).find((entry) => entry.startsWith("ellie_sim_access="))?.slice("ellie_sim_access=".length);
  if (!value) return undefined;
  try { return decodeURIComponent(value); } catch { return undefined; }
}
export function registerStaticPhone(app: Express): boolean {
  if (!hasPhoneBuild()) return false;
  app.use("/phone", (req, res, next) => {
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'self'");
    if (req.path === "/" || req.path.endsWith(".html")) res.setHeader("Cache-Control", "no-store");
    else if (/\.[a-f0-9]{8,}\./i.test(req.path)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    next();
  });
  app.use("/phone", express.static(phoneDist, { index: false, fallthrough: true }));
  app.get("/phone", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(resolve(phoneDist, "index.html"));
  });
  app.get("/phone/{*path}", (_req, res, next) => {
    const index = resolve(phoneDist, "index.html");
    if (!existsSync(index) || !statSync(index).isFile()) { next(); return; }
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(index);
  });
  app.get("/phone/", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(resolve(phoneDist, "index.html"));
  });
  return true;
}

export function registerStaticSimulator(app: Express, enabled: boolean, accessCode?: string, production = false): boolean {
  if (!enabled) return false;
  const built = hasSimulatorBuild();
  if (built) {
    app.use("/sim", (req, res, next) => {
      if (production) {
        const expected = Buffer.from(accessCode ?? "");
        const header = req.header("x-sim-access-code");
        const query = typeof req.query.access === "string" ? req.query.access : undefined;
        const supplied = [header, query, simulatorCookie(req)].find((value) => {
          if (!value) return false;
          const candidate = Buffer.from(value);
          return candidate.length === expected.length && timingSafeEqual(expected, candidate);
        });
        if (expected.length < 12 || !supplied) { res.status(404).end(); return; }
        if (header || query) res.cookie("ellie_sim_access", accessCode!, { httpOnly: true, sameSite: "strict", secure: true, path: "/sim", maxAge: 30 * 60 * 1000 });
      }
      next();
    });
  app.use("/sim", (req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; media-src 'self'");
    if (req.path === "/" || req.path.endsWith(".html")) res.setHeader("Cache-Control", "no-store");
    else if (/\.[a-f0-9]{8,}\./i.test(req.path)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    next();
  });
    app.use("/sim", express.static(simulatorDist, { index: false, fallthrough: true }));
    app.get("/sim", (_req, res) => { res.setHeader("Cache-Control", "no-store"); res.sendFile(resolve(simulatorDist, "index.html")); });
    app.get("/sim/{*path}", (_req, res) => { res.setHeader("Cache-Control", "no-store"); res.sendFile(resolve(simulatorDist, "index.html")); });
  }
  app.get("/", (req, res) => res.redirect(302, `/sim/${production && typeof req.query.access === "string" ? `?access=${encodeURIComponent(req.query.access)}` : ""}`));
  return built;
}
