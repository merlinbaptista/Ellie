# Dependency advisory triage (Gate A item A-05)

Date: 2026-10-17. Command: `npm audit --json` at the repository root, plus `npm ls` to confirm where each package is installed.

**Totals: 10 advisories — 3 critical, 4 high, 3 moderate. 0 affect the shipped runtime.**

## Decision summary

`npm audit` reports a fix for every one of the ten, and **every one of those fixes is `isSemVerMajor: true`**:

| Fix npm proposes | From | Breaking? |
| --- | --- | --- |
| `vitest` / `@vitest/coverage-v8` 2.1.9 → 5.0.5 | `^2` | Yes, three majors |
| `vite` 5.4.21 → 8.3.4 | `^5` | Yes, three majors |
| `vite-plugin-singlefile` 2.3.3 → 0.9.0 | `^2` | Yes, and a downgrade |

Module 12 authorises **non-breaking upgrades only**, and forbids `npm audit fix --force`. There is therefore **no upgrade to apply**: the declared ranges (`vite ^5`, `vitest ^2`, `vite-plugin-singlefile ^2`) are already resolved to the newest version inside those ranges (`vite@5.4.21`, `vitest@2.1.9`, `vite-plugin-singlefile@2.3.3`). All ten are **accepted** with the reasons below.

## Full table

| Package | Severity | Runtime or dev-only | Path | Advisory | Fix available | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| `vitest` | critical | dev-only (test runner) | direct devDependency of `@ellie/{schema,server,ui,phone,simulator}` | [GHSA-5xrq-8626-4rwp](https://github.com/advisories/GHSA-5xrq-8626-4rwp) (Vitest UI server reads/executes arbitrary files), [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) | 5.0.5, semver-major | **Accept.** Breaking. Ellie never starts the Vitest UI server (`--ui` is not used anywhere, including CI). |
| `@vitest/coverage-v8` | critical | dev-only (coverage) | direct devDependency of `@ellie/schema` | inherits `vitest` | 5.0.5, semver-major | **Accept.** Breaking, and must move in lockstep with `vitest`. |
| `tinypool` | critical | dev-only (worker pool) | `vitest` → `tinypool@1.1.1` | [GHSA-5gmw-xhrv-c9v3](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3), [GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr) (prototype-pollution gadget to RCE in worker/run options) | via `vitest` 5.0.5, semver-major | **Accept.** Exploitable only through attacker-controlled worker options; Ellie's pool options are static and in-repo. |
| `vite` | high | dev-only (bundler and dev server) | direct devDependency of `@ellie/{mcp-app,phone,simulator,ui}` | [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) (`server.fs.deny` bypass on Windows), [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9), [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3) | 8.3.4, semver-major | **Accept.** All three need a reachable Vite **dev server**. Ellie ships pre-built static assets served by Express; `vite dev` is only used locally on `127.0.0.1`. |
| `vite-plugin-singlefile` | high | dev-only (build plugin) | direct devDependency of `@ellie/mcp-app` | inherits `micromatch`/`braces` | 0.9.0, semver-major **downgrade** | **Accept.** The proposed "fix" is a downgrade to a two-year-old major; it would break the MCP Apps single-file card build. |
| `micromatch` | high | dev-only | `vite-plugin-singlefile` → `micromatch@4.0.8` | inherits `braces` | via `vite-plugin-singlefile` 0.9.0 | **Accept.** Build-time glob matching over in-repo paths only. |
| `braces` | high | dev-only | `micromatch` → `braces@3.0.3` | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) (stack exhaustion on deeply nested patterns) | via `vite-plugin-singlefile` 0.9.0 | **Accept.** Denial of service against our own build, driven by our own glob strings. |
| `esbuild` | moderate | dev-only | `vite@5` → `esbuild@0.21.5` | [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) (any website can query the dev server) | via `vite` 8.3.4, semver-major | **Accept.** Dev-server-only. Note `tsx@4` already carries a patched `esbuild@0.28.2`. |
| `@vitest/mocker` | moderate | dev-only | `vitest` → `@vitest/mocker@2.1.9` | [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) (path traversal via redirect mock) | via `vitest` 5.0.5 | **Accept.** Requires a reachable Vitest dev/mock server. |
| `vite-node` | moderate | dev-only | `vitest` → `vite-node@2.1.9` | inherits `vite` | via `vitest` 5.0.5 | **Accept.** Inherited only. |

## Why none of this reaches a user

The server's production dependency set is `@modelcontextprotocol/sdk`, `express`, `zod`, `pino`, `dotenv`, `cors`, `jose` and the `@aws-sdk/*` clients. **None of them appears in the advisory list.** `npm audit --omit=dev` reports no advisories. The browser packages (`@ellie/phone`, `@ellie/ui`, `@ellie/simulator`, `@ellie/mcp-app`) ship pre-built static assets; Vite and Vitest are build and test tools that never run in the deployed container.

## Standing mitigations

- Never run `vitest --ui`, and never expose a Vite dev server beyond `127.0.0.1`.
- Never run the test suite against untrusted test input or untrusted glob patterns.
- The Dockerfile installs production dependencies only, so none of these packages is in the image.

## Recommended follow-up (not in this module's scope)

A single coordinated `vitest@5` + `@vitest/coverage-v8@5` + `vite@8` upgrade clears nine of the ten. It is semver-major across three majors and needs its own branch, a full green suite, a coverage re-run and a pack/schema stability check. It would also let `packages/server/vitest.config.ts` use the native `test.projects` option instead of the workspace file added in `defeb9f`. The tenth (`vite-plugin-singlefile`) has no forward fix and should be re-checked at release time.

The separate seven-advisory result in the extracted standalone `home-event-schema` package is triaged in [final-audit.md](final-audit.md#c6-standalone-schema-dependency-triage); it is the same dev toolchain, and its only production dependency is Zod.
