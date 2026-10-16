import {
  DynamoDBClient,
  DescribeTableCommand,
  type AttributeValue,
} from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import type { Logger } from "pino";
import type { Clock } from "../../lib/clock.js";
import { ExternalServiceError } from "../../lib/errors.js";
import type { QueryOptions, StorageAdapter, StoredRecord } from "./types.js";

export interface DynamoStorageOptions {
  tableName: string;
  region?: string;
  endpoint?: string;
  local?: boolean;
}

export class DynamoDbStorage implements StorageAdapter {
  readonly name: string;
  private readonly client: DynamoDBClient;
  private readonly documentClient: DynamoDBDocumentClient;
  private healthCache?: { checkedAt: number; value: { ok: boolean; detail?: string } };

  constructor(
    private readonly options: DynamoStorageOptions,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {
    this.name = options.local ? "dynamodb-local" : "dynamodb";
    this.client = new DynamoDBClient({
      region: options.region ?? (options.local ? "local" : undefined),
      endpoint: options.endpoint,
      ...(options.local ? { credentials: { accessKeyId: "local", secretAccessKey: "local" } } : {}),
      maxAttempts: 3,
      requestHandler: new NodeHttpHandler({ requestTimeout: 2_000 }),
    });
    this.documentClient = DynamoDBDocumentClient.from(this.client, {
      marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: false },
    });
  }

  private async operation<T>(op: string, run: () => Promise<T>): Promise<T> {
    const started = performance.now();
    try {
      return await run();
    } catch (error) {
      const awsError = error as { name?: string; $metadata?: { httpStatusCode?: number; requestId?: string } };
      this.logger.error({
        op,
        name: awsError.name,
        statusCode: awsError.$metadata?.httpStatusCode,
        requestId: awsError.$metadata?.requestId,
      }, "DynamoDB operation failed");
      throw new ExternalServiceError("DynamoDB operation failed", "I couldn't reach my memory just now. Please try again in a moment.");
    } finally {
      this.logger.debug({ op, ms: Math.round(performance.now() - started) }, "DynamoDB operation timing");
    }
  }

  private expired(record: StoredRecord | undefined): boolean {
    return Boolean(record?.ttl !== undefined && record.ttl < Math.floor(this.clock.now().getTime() / 1000));
  }

  async get(pk: string, sk: string): Promise<StoredRecord | null> {
    return this.operation("get", async () => {
      const result = await this.documentClient.send(new GetCommand({
        TableName: this.options.tableName,
        Key: { pk, sk },
      }));
      const record = result.Item as StoredRecord | undefined;
      if (!record) return null;
      if (this.expired(record)) {
        await this.documentClient.send(new DeleteCommand({ TableName: this.options.tableName, Key: { pk, sk } }));
        return null;
      }
      return record;
    });
  }

  async put(input: Omit<StoredRecord, "createdAt" | "updatedAt"> & Partial<Pick<StoredRecord, "createdAt">>): Promise<StoredRecord> {
    return this.operation("put", async () => {
      const now = this.clock.now().toISOString();
      const existing = input.createdAt ? null : await this.documentClient.send(new GetCommand({
        TableName: this.options.tableName,
        Key: { pk: input.pk, sk: input.sk },
        ProjectionExpression: "createdAt",
      }));
      const record: StoredRecord = {
        ...input,
        createdAt: input.createdAt ?? (existing?.Item?.createdAt as string | undefined) ?? now,
        updatedAt: now,
      };
      await this.documentClient.send(new PutCommand({ TableName: this.options.tableName, Item: record }));
      return record;
    });
  }

  async query(pk: string, opts: QueryOptions = {}): Promise<StoredRecord[]> {
    return this.operation("query", async () => {
      const records: StoredRecord[] = [];
      let exclusiveStartKey: Record<string, AttributeValue> | undefined;
      do {
        const page = await this.documentClient.send(new QueryCommand({
          TableName: this.options.tableName,
          KeyConditionExpression: opts.skPrefix ? "pk = :pk AND begins_with(sk, :prefix)" : "pk = :pk",
          ExpressionAttributeValues: opts.skPrefix ? { ":pk": pk, ":prefix": opts.skPrefix } : { ":pk": pk },
          ScanIndexForward: !opts.descending,
          ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
          ...(opts.limit === undefined ? {} : { Limit: Math.max(1, opts.limit - records.length) }),
        }));
        for (const item of (page.Items ?? []) as StoredRecord[]) {
          if (!this.expired(item)) records.push(item);
          else await this.documentClient.send(new DeleteCommand({ TableName: this.options.tableName, Key: { pk: item.pk, sk: item.sk } }));
          if (opts.limit !== undefined && records.length >= opts.limit) break;
        }
        exclusiveStartKey = page.LastEvaluatedKey as Record<string, AttributeValue> | undefined;
      } while (exclusiveStartKey && (opts.limit === undefined || records.length < opts.limit));
      return records;
    });
  }

  async delete(pk: string, sk: string): Promise<void> {
    await this.operation("delete", async () => {
      await this.documentClient.send(new DeleteCommand({ TableName: this.options.tableName, Key: { pk, sk } }));
    });
  }

  async deletePartition(pk: string): Promise<number> {
    return this.operation("deletePartition", async () => {
      const keys: Array<{ pk: string; sk: string }> = [];
      let exclusiveStartKey: Record<string, AttributeValue> | undefined;
      do {
        const page = await this.documentClient.send(new QueryCommand({
          TableName: this.options.tableName,
          KeyConditionExpression: "pk = :pk",
          ExpressionAttributeValues: { ":pk": pk },
          ProjectionExpression: "pk, sk",
          ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
        }));
        keys.push(...(page.Items as Array<{ pk: string; sk: string }> | undefined ?? []));
        exclusiveStartKey = page.LastEvaluatedKey as Record<string, AttributeValue> | undefined;
      } while (exclusiveStartKey);
      let deleted = 0;
      for (let offset = 0; offset < keys.length; offset += 25) {
        let unprocessed: Record<string, unknown> | undefined = {
          [this.options.tableName]: keys.slice(offset, offset + 25).map((Key) => ({ DeleteRequest: { Key } })),
        };
        for (let attempt = 0; attempt < 5 && unprocessed; attempt++) {
          const result = await this.documentClient.send(new BatchWriteCommand({ RequestItems: unprocessed as never }));
          unprocessed = result.UnprocessedItems as Record<string, unknown> | undefined;
          if (unprocessed && Object.values(unprocessed).some((requests) => Array.isArray(requests) && requests.length)) {
            await new Promise((resolve) => setTimeout(resolve, 50 * (2 ** attempt)));
          } else unprocessed = undefined;
        }
        if (unprocessed) throw new Error("DynamoDB left items unprocessed after five batch-delete attempts");
        deleted += Math.min(25, keys.length - offset);
      }
      return deleted;
    });
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    if (this.healthCache && Date.now() - this.healthCache.checkedAt < 30_000) return this.healthCache.value;
    const value = await this.operation("healthCheck", async () => {
      const result = await this.client.send(new DescribeTableCommand({ TableName: this.options.tableName }));
      const status = result.Table?.TableStatus ?? "UNKNOWN";
      return { ok: status === "ACTIVE", detail: `${this.options.tableName} ${status} · ${result.Table?.ItemCount ?? 0} items` };
    });
    this.healthCache = { checkedAt: Date.now(), value };
    return value;
  }

  async close(): Promise<void> { this.client.destroy(); }
}
