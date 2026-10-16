import type { Prediction } from "@ellie/schema";
import type { Clock } from "../lib/clock.js";
import type { StorageAdapter } from "../adapters/storage/types.js";
import { householdPk, predictionPrefix, predictionSk } from "./keys.js";

export class PredictionRepository {
  constructor(private readonly storage: StorageAdapter, private readonly clock: Clock) {}
  async put(householdId: string, prediction: Prediction): Promise<Prediction> {
    const previous = await this.get(householdId, prediction.itemId, prediction.component);
    const value = { ...prediction, computedAt: prediction.computedAt ?? this.clock.now().toISOString() };
    await this.storage.put({
      pk: householdPk(householdId), sk: predictionSk(prediction.itemId, prediction.component),
      type: "prediction", data: value as unknown as Record<string, unknown>,
      ...(previous ? { createdAt: previous.computedAt } : {}),
    });
    return value;
  }
  async get(householdId: string, itemId: string, component?: string): Promise<Prediction | null> {
    const row = await this.storage.get(householdPk(householdId), predictionSk(itemId, component));
    return row ? row.data as unknown as Prediction : null;
  }
  async getForItem(householdId: string, itemId: string): Promise<Prediction[]> {
    return (await this.storage.query(householdPk(householdId), { skPrefix: predictionPrefix(itemId) }))
      .map((row) => row.data as unknown as Prediction)
      .filter((prediction) => prediction.itemId === itemId);
  }
  async listForHousehold(householdId: string): Promise<Prediction[]> {
    return (await this.storage.query(householdPk(householdId), { skPrefix: predictionPrefix() }))
      .map((row) => row.data as unknown as Prediction);
  }
  async deleteForItem(householdId: string, itemId: string): Promise<number> {
    const predictions = await this.getForItem(householdId, itemId);
    for (const prediction of predictions) await this.storage.delete(householdPk(householdId), predictionSk(itemId, prediction.component));
    return predictions.length;
  }
}
