import type { Clock } from "../lib/clock.js";
import type { StorageAdapter } from "../adapters/storage/types.js";
import { AliasRepository } from "./aliasRepo.js";
import { EventRepository } from "./eventRepo.js";
import { HouseholdRepository } from "./householdRepo.js";
import { ItemRepository } from "./itemRepo.js";
import { PendingRepository } from "./pendingRepo.js";
import { PredictionRepository } from "./predictionRepo.js";
import { DiagnosisRepository } from "./diagnosisRepo.js";
import { ResolutionRepository } from "./resolutionRepo.js";

export function createRepositories(storage: StorageAdapter, clock: Clock) {
  return {
    households: new HouseholdRepository(storage, clock),
    items: new ItemRepository(storage, clock),
    events: new EventRepository(storage),
    aliases: new AliasRepository(storage),
    pending: new PendingRepository(storage, clock),
    predictions: new PredictionRepository(storage, clock),
    diagnoses: new DiagnosisRepository(storage, clock),
    resolutions: new ResolutionRepository(storage),
  };
}
export type Repositories = ReturnType<typeof createRepositories>;
