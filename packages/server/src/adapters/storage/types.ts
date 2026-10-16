export interface StoredRecord {
  pk: string;
  sk: string;
  type: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  ttl?: number;
}
export interface QueryOptions {
  skPrefix?: string;
  limit?: number;
  descending?: boolean;
}
export interface StorageAdapter {
  readonly name: string;
  get(pk: string, sk: string): Promise<StoredRecord | null>;
  put(record: Omit<StoredRecord, "createdAt" | "updatedAt"> & Partial<Pick<StoredRecord, "createdAt">>): Promise<StoredRecord>;
  query(pk: string, opts?: QueryOptions): Promise<StoredRecord[]>;
  delete(pk: string, sk: string): Promise<void>;
  deletePartition(pk: string): Promise<number>;
  healthCheck(): Promise<{ ok: boolean; detail?: string }>;
}
