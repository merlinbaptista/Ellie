import {
  CreateTableCommand,
  DescribeTableCommand,
  DescribeTimeToLiveCommand,
  DynamoDBClient,
  ResourceNotFoundException,
  UpdateTimeToLiveCommand,
  waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";
import { env } from "../packages/server/src/config/env.js";

if (!env.DYNAMODB_TABLE_NAME) throw new Error("Set DYNAMODB_TABLE_NAME before creating a table.");
const local = Boolean(env.DYNAMODB_ENDPOINT);
const client = new DynamoDBClient({
  region: env.AWS_REGION ?? (local ? "local" : undefined),
  endpoint: env.DYNAMODB_ENDPOINT,
  ...(local ? { credentials: { accessKeyId: "local", secretAccessKey: "local" } } : {}),
  maxAttempts: 3,
});
const tableName = env.DYNAMODB_TABLE_NAME;
try {
  let exists = true;
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
  } catch (error) {
    if (error instanceof ResourceNotFoundException) exists = false;
    else throw error;
  }
  if (!exists) {
    await client.send(new CreateTableCommand({
      TableName: tableName,
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "sk", AttributeType: "S" },
      ],
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
      BillingMode: "PAY_PER_REQUEST",
      Tags: [{ Key: "project", Value: "ellie" }],
    }));
    await waitUntilTableExists({ client, maxWaitTime: 120 }, { TableName: tableName });
    console.log(`Created table ${tableName}.`);
  } else {
    console.log(`✔ ${tableName} exists.`);
  }
  const ttl = await client.send(new DescribeTimeToLiveCommand({ TableName: tableName }));
  if (ttl.TimeToLiveDescription?.TimeToLiveStatus !== "ENABLED" || ttl.TimeToLiveDescription.AttributeName !== "ttl") {
    await client.send(new UpdateTimeToLiveCommand({
      TableName: tableName,
      TimeToLiveSpecification: { AttributeName: "ttl", Enabled: true },
    }));
    console.log("Enabled TTL on ttl.");
  } else {
    console.log("✔ TTL on ttl is enabled.");
  }
  console.log("Next: run npm run seed:reset, then npm run dev.");
} finally {
  client.destroy();
}
