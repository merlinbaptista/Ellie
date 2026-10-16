import { existsSync, statSync } from "node:fs";
import express, { type Express } from "express";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const phoneDist = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../packages/phone/dist");
export function hasPhoneBuild(): boolean { return existsSync(resolve(phoneDist, "index.html")); }
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
