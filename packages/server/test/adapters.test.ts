import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createClock } from "../src/lib/clock.js";
import { createMemoryStorage } from "../src/adapters/storage/memory.js";
import { createFileStorage } from "../src/adapters/storage/file.js";
import { ConsoleNotifier } from "../src/adapters/notifier/console.js";
import { LocalScheduler } from "../src/adapters/scheduler/local.js";
import { clearMockHandlers, MockLlm, registerMockHandler } from "../src/adapters/llm/mock.js";

const tempDirs: string[] = [];
afterEach(async () => {
  clearMockHandlers();
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("mock adapters", () => {
  it("supports sorted queries, prefix, limit, deletion, and partition deletion", async () => {
    const store = createMemoryStorage(createClock("2026-01-01T00:00:00.000Z"));
    for (const sk of ["EVENT#b", "ITEM#a", "EVENT#a"]) await store.put({ pk: "HH#1", sk, type: "x", data: {} });
    expect((await store.query("HH#1", { skPrefix: "EVENT#" })).map((row) => row.sk)).toEqual(["EVENT#a", "EVENT#b"]);
    expect((await store.query("HH#1", { descending: true, limit: 1 }))[0]?.sk).toBe("ITEM#a");
    await store.delete("HH#1", "ITEM#a");
    expect(await store.get("HH#1", "ITEM#a")).toBeNull();
    expect(await store.deletePartition("HH#1")).toBe(2);
  });

  it("persists file storage across reloads", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ellie-store-"));
    tempDirs.push(directory);
    const clock = createClock("2026-01-01T00:00:00.000Z");
    const first = await createFileStorage(directory, clock);
    await first.put({ pk: "HH#1", sk: "ITEM#1", type: "item", data: { label: "Purifier" } });
    await first.flush();
    const reopened = await createFileStorage(directory, clock);
    expect((await reopened.get("HH#1", "ITEM#1"))?.data.label).toBe("Purifier");
  });

  it("writes messages to the outbox", async () => {
    const store = createMemoryStorage(createClock("2026-01-01T00:00:00.000Z"));
    const notifier = new ConsoleNotifier(store, createClock("2026-01-01T00:00:00.000Z"));
    const result = await notifier.send({ householdId: "home", channel: "sms", to: "+15551234567", body: "Reminder", kind: "test" });
    expect(result.status).toBe("sent");
    expect((await notifier.listOutbox?.("home"))?.[0]?.body).toBe("Reminder");
  });

  it("fires due scheduler jobs and leaves future jobs queued", async () => {
    const clock = createClock("2026-01-01T00:00:00.000Z");
    const scheduler = new LocalScheduler(createMemoryStorage(clock), clock);
    const fired = vi.fn(async () => undefined);
    scheduler.onFire(fired);
    await scheduler.schedule({ id: "due", runAtUtc: "2026-01-02T00:00:00.000Z", timeZone: "UTC", payload: { kind: "reminder", householdId: "home", message: "Due" } });
    await scheduler.schedule({ id: "future", runAtUtc: "2026-02-01T00:00:00.000Z", timeZone: "UTC", payload: { kind: "reminder", householdId: "home", message: "Later" } });
    clock.set("2026-01-03T00:00:00.000Z");
    expect(await scheduler.tick?.()).toBe(1);
    expect(fired).toHaveBeenCalledTimes(1);
    expect((await scheduler.list()).map((job) => job.id)).toEqual(["future"]);
    scheduler.close();
  });

  it("uses registered mock LLM handlers before the fallback", async () => {
    const unregister = registerMockHandler((request) => request.system === "custom", () => "handled");
    try {
      const response = await new MockLlm().complete({ system: "custom", messages: [{ role: "user", content: "input" }] });
      expect(response.text).toBe("handled");
      expect(response.mock).toBe(true);
    } finally { unregister(); }
  });
});
