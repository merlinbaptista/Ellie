import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../../context.js";
import { register as registerPing } from "./ping.js";
import { register as registerStatus } from "./status.js";
import { register as registerRegionInfo } from "./regionInfo.js";
import { register as registerSetupHousehold } from "./setupHousehold.js";
import { register as registerLogEvent } from "./logEvent.js";
import { register as registerGetHistory } from "./getHistory.js";
import { register as registerPredictNext } from "./predictNext.js";
import { register as registerDueThisWeek } from "./dueThisWeek.js";
import { register as registerDevTimeTravel } from "./devTimeTravel.js";
import { register as registerDiagnose } from "./diagnose.js";
import { register as registerLogResolution } from "./logResolution.js";
import { register as registerSendToPhone } from "./sendToPhone.js";

export function registerAllTools(server: McpServer, ctx: AppContext): void {
  registerPing(server, ctx);
  registerStatus(server, ctx);
  registerRegionInfo(server, ctx);
  registerSetupHousehold(server, ctx);
  registerLogEvent(server, ctx);
  registerGetHistory(server, ctx);
  registerPredictNext(server, ctx);
  registerDueThisWeek(server, ctx);
  registerDevTimeTravel(server, ctx);
  registerDiagnose(server, ctx);
  registerLogResolution(server, ctx);
  registerSendToPhone(server, ctx);
}
