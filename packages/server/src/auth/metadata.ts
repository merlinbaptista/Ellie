import { metadataHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/metadata.js";
import type { AppContext } from "../context.js";
import { protectedResourceMetadata } from "./oauth.js";

export function protectedResourceMetadataHandler(ctx: AppContext) {
  return metadataHandler(protectedResourceMetadata(ctx));
}