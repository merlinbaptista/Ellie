import { ToolContracts } from "@ellie/schema";
import type { DiagnoseInput } from "@ellie/schema";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../../context.js";
import { diagnose } from "../../domain/diagnose.js";
import { toolResponse } from "../result.js";
import { withTiming } from "../withTiming.js";

export function register(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "diagnose",
    {
      title: "Diagnose a home problem",
      description: "Help with a problem at home: something beeping, leaking, not working, or smelling odd. Ellie checks the item's history first. If there is a follow-up question, answer it and pass diagnosisId back.",
      inputSchema: ToolContracts.diagnose.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    withTiming("diagnose", ctx, async (args: DiagnoseInput) => {
      const result = await diagnose(ctx, args);
      const pack = ctx.regions.get(result.item ? (await ctx.repositories.households.get(result.diagnosis.householdId))?.regionPackId ?? "DEFAULT" : "DEFAULT");
      if (result.safety) {
        return toolResponse({
          speech: result.safety.message,
          data: result.diagnosis,
          safety: { level: "stop", message: result.safety.message, emergencyNumber: result.safety.emergencyNumber },
          card: { title: "Safety first", items: [{ label: "Emergency contact", value: result.safety.emergencyNumber, status: "warning" }] },
        });
      }
      if (result.followUp) return toolResponse({
        speech: result.speech,
        data: result.diagnosis,
        followUp: result.followUp,
        card: { title: `${result.item.name} · ${args.symptom}`, items: [{ label: "Question", value: result.followUp.question, status: "info" }] },
      });
      return toolResponse({
        speech: result.speech,
        data: { ...result.diagnosis, suggestedNextTool: result.diagnosis.fixPlan ? "send_to_phone" : undefined },
        card: {
          title: `${pack.catalog[result.item.catalogKey]?.icon ?? ""} ${result.item.name} · ${args.symptom}`.trim(),
          items: [
            ...result.diagnosis.candidates.slice(0, 3).map((candidate) => ({ label: candidate.description, value: `${Math.round(candidate.score * 100)}%`, status: "info" as const })),
            ...result.diagnosis.evidence.slice(0, 4).map((evidence) => ({ label: "Evidence", value: evidence.text, status: evidence.kind.includes("overdue") ? "warning" as const : "info" as const })),
            ...(result.diagnosis.fixPlan ? [{ label: "Fix", value: result.diagnosis.fixPlan.summary, status: "ok" as const }] : []),
          ],
          actions: [
            ...(result.diagnosis.fixPlan?.manualUrl ? [{ label: "Manual", url: result.diagnosis.fixPlan.manualUrl }] : []),
            { label: "It's fixed", tool: "log_resolution", args: { householdId: result.diagnosis.householdId, item: result.item.name, diagnosisId: result.diagnosis.diagnosisId, causeKey: result.diagnosis.candidates[0]?.causeKey } },
          ],
        },
      });
    }),
  );
}
