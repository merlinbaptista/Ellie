import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { Clock } from "../../lib/clock.js";
import { MemoryStorage } from "./memory.js";
import type { QueryOptions, StorageAdapter, StoredRecord } from "./types.js";

export class FileStorage implements StorageAdapter {
  readonly name = "file-store";
  private readonly memory: MemoryStorage;
  private debounce: ReturnType<typeof setTimeout> | undefined;
  private writeQueue: Promise<void> = Promise.resolve();
  readonly filePath: string;

  private constructor(dataDir: string, clock: Clock) {
    this.memory = new MemoryStorage(clock);
    this.filePath = join(resolve(dataDir), "ellie-store.json");
  }

  static async open(dataDir: string, clock: Clock): Promise<FileStorage> {
    const store = new FileStorage(dataDir, clock);
    await mkdir(dirname(store.filePath), { recursive: true });
    try {
      const content = await readFile(store.filePath, "utf8");
      const records: unknown = JSON.parse(content);
      if (!Array.isArray(records)) throw new Error("Invalid data file format");
      store.memory.importRecords(records as StoredRecord[]);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return store;
  }

  async get(pk: string, sk: string) { return this.memory.get(pk, sk); }
  async query(pk: string, opts?: QueryOptions) { return this.memory.query(pk, opts); }
  async delete(pk: string, sk: string) { await this.memory.delete(pk, sk); this.scheduleFlush(); }
  async deletePartition(pk: string) { const count = await this.memory.deletePartition(pk); this.scheduleFlush(); return count; }
  async healthCheck() { return { ok: true, detail: this.filePath }; }

  async put(record: Omit<StoredRecord, "createdAt" | "updatedAt"> & Partial<Pick<StoredRecord, "createdAt">>) {
    const saved = await this.memory.put(record);
    this.scheduleFlush();
    return saved;
  }

  private scheduleFlush(): void {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.flush(), 200);
    this.debounce.unref();
  }

  async flush(): Promise<void> {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = undefined;
    const data = JSON.stringify(this.memory.exportRecords(), null, 2);
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
      await writeFile(temporaryPath, data, "utf8");
      await rename(temporaryPath, this.filePath);
    });
    await this.writeQueue;
  }
}

export async function createFileStorage(dataDir: string, clock: Clock): Promise<FileStorage> {
  return FileStorage.open(dataDir, clock);
}
