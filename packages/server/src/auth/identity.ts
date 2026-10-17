import { AsyncLocalStorage } from "node:async_hooks";

export interface AuthIdentity { householdId: string; subject: string }
const identityStorage = new AsyncLocalStorage<AuthIdentity>();
export function withAuthIdentity<T>(identity: AuthIdentity, callback: () => T): T { return identityStorage.run(identity, callback); }
export function currentAuthIdentity(): AuthIdentity | undefined { return identityStorage.getStore(); }
