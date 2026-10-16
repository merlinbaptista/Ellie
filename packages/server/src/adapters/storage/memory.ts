import type { Clock } from "../../lib/clock.js";
import type { QueryOptions, StorageAdapter, StoredRecord } from "./types.js";

type PutRecord = Omit<StoredRecord, "createdAt" | "updatedAt"> & Partial<Pick<StoredRecord, "createdAt">>;

export class MemoryStorage implements StorageAdapter {
  readonly name = "memory-store";
  private readonly partitions = new Map<string, Map<string, StoredRecord>>();

  constructor(private readonly clock: Clock) {}

  private isExpired(record: StoredRecord): boolean {
    const wallClockTtl = record.type === "phone-short-link" || record.type === "phone-action" || record.type === "scheduled-job-fired";
    const nowSeconds = wallClockTtl ? Math.floor(Date.now() / 1000) : Math.floor(this.clock.now().getTime() / 1000);
    return record.ttl !== undefined && record.ttl < nowSeconds;
  }

  async get(pk: string, sk: string): Promise<StoredRecord | null> {
    const partition = this.partitions.get(pk);
    const record = partition?.get(sk);
    if (record && this.isExpired(record)) {
      partition?.delete(sk);
      if (partition?.size === 0) this.partitions.delete(pk);
      return null;
    }
    return record ? structuredClone(record) : null;
  }

  async put(input: PutRecord): Promise<StoredRecord> {
    const now = this.clock.now().toISOString();
    const partition = this.partitions.get(input.pk) ?? new Map<string, StoredRecord>();
    const existing = partition.get(input.sk);
    const record: StoredRecord = {
      ...structuredClone(input),
      createdAt: input.createdAt ?? existing?.createdAt ?? now,
      updatedAt: now,
    };
    partition.set(input.sk, record);
    this.partitions.set(input.pk, partition);
    return structuredClone(record);
  }

  async query(pk: string, opts: QueryOptions = {}): Promise<StoredRecord[]> {
    const partition = this.partitions.get(pk);
    const records = [...(partition?.values() ?? [])];
    for (const record of records) if (this.isExpired(record)) partition?.delete(record.sk);
    let visible = records.filter((record) => !this.isExpired(record))
      .filter((record) => !opts.skPrefix || record.sk.startsWith(opts.skPrefix))
      .sort((a, b) => a.sk.localeCompare(b.sk));
    if (opts.descending) visible.reverse();
    if (opts.limit !== undefined) visible = visible.slice(0, Math.max(0, opts.limit));
    return structuredClone(visible);
  }

  async delete(pk: string, sk: string): Promise<void> {
    const partition = this.partitions.get(pk);
    partition?.delete(sk);
    if (partition?.size === 0) this.partitions.delete(pk);
  }

  async deletePartition(pk: string): Promise<number> {
    const count = this.partitions.get(pk)?.size ?? 0;
    this.partitions.delete(pk);
    return count;
  }

  async healthCheck(): Promise<{ ok: boolean }> {
    return { ok: true };
  }

  exportRecords(): StoredRecord[] {
    return [...this.partitions.values()].flatMap((partition) => [...partition.values()]);
  }

  importRecords(records: StoredRecord[]): void {
    this.partitions.clear();
    for (const record of records) {
      const partition = this.partitions.get(record.pk) ?? new Map<string, StoredRecord>();
      partition.set(record.sk, structuredClone(record));
      this.partitions.set(record.pk, partition);
    }
  }
}

export function createMemoryStorage(clock: Clock): MemoryStorage {
  return new MemoryStorage(clock);
}
