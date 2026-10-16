import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../../context.js";
import { fillTemplate, speechList } from "@ellie/schema";
import { matchCatalog } from "@ellie/schema";
import { toolResponse } from "../result.js";
import { withTiming } from "../withTiming.js";

const volumeWords: Record<string, string> = { L: "litres", gal: "gallons" };
const tempWords: Record<string, string> = { C: "Celsius", F: "°F" };
const currencyWords: Record<string, string> = { INR: "rupees", USD: "dollars", GBP: "pounds" };

export function register(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "ellie_region_info",
    {
      title: "Region information",
      description: "Look up regional household item defaults, units, providers, and safety contacts.",
      inputSchema: {
        country: z.string().length(2).describe("Two-letter country code, for example IN, US, or GB"),
        item: z.string().optional().describe("Household item to look up, such as gas, purifier, or propane"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    withTiming("ellie_region_info", ctx, async ({ country, item }) => {
      const pack = ctx.regions.forCountry(country.toUpperCase());
      const items = Object.entries(pack.catalog);
      if (!item) {
        const knownItems = items.map(([, entry]) => entry.displayName);
        const unitSentence = `For ${pack.name} I use ${volumeWords[pack.units.volume] ?? pack.units.volume}, ${tempWords[pack.units.temp] ?? pack.units.temp} and ${currencyWords[pack.units.currency] ?? pack.units.currency}.`;
        const names = knownItems.length > 5 ? `${speechList(knownItems.slice(0, 4))} and ${knownItems.length - 4} more` : speechList(knownItems);
        return toolResponse({
          speech: `${unitSentence} I know about ${names}.`,
          data: { packId: pack.packId, version: pack.version, countries: pack.countries, units: pack.units, items: items.map(([catalogKey, entry]) => ({ catalogKey, displayName: entry.displayName, icon: entry.icon, intervalDays: entry.recurring?.defaultIntervalDays })) },
          card: { title: `${pack.name} home defaults`, subtitle: `Pack ${pack.packId} · ${pack.version}`, items: items.map(([, entry]) => ({ label: `${entry.icon ?? ""} ${entry.displayName}`.trim(), value: entry.recurring ? `${entry.recurring.defaultIntervalDays} days` : "No regional interval", status: "info" })) },
        });
      }
      const match = matchCatalog(item, pack)[0];
      if (!match) {
        const suggestions = items.slice(0, 3).map(([, entry]) => entry.displayName);
        return toolResponse({
          speech: `I couldn't match that item in ${pack.name}.`,
          followUp: { field: "item", question: `Which item do you mean? I know ${speechList(suggestions)}.` },
          data: { packId: pack.packId, candidates: suggestions },
        });
      }
      const entry = pack.catalog[match.catalogKey]!;
      const recurring = entry.recurring;
      const containerWord = ctx.regions.vocabulary(pack.packId, "gas_container");
      const localName = entry.displayName.replace(/\b(tank|cylinder)\b/i, containerWord);
      const intervalSentence = recurring
        ? `usually lasts about ${recurring.defaultIntervalDays} days${recurring.minDaysBetweenBookings ? `, and bookings open ${recurring.minDaysBetweenBookings} days after the last one` : ""}`
        : "does not have a regional recurring interval";
      const speech = fillTemplate("In {region}, a {item} {interval}. Regional units are {volume} and {temperature}.", {
        region: pack.name,
        item: localName,
        interval: intervalSentence,
        volume: volumeWords[pack.units.volume] ?? pack.units.volume,
        temperature: tempWords[pack.units.temp] ?? pack.units.temp,
      });
      const provider = entry.defaultProviderKey ? pack.providers[entry.defaultProviderKey] : undefined;
      const emergency = pack.safety.numbers[entry.symptoms.find((symptom) => symptom.safety)?.safety ?? ""] ?? pack.safety.generalEmergency;
      const cardItems = [
        ...(recurring ? [
          { label: "Typical interval", value: `${recurring.defaultIntervalDays} days` },
          { label: "Lead time", value: `${recurring.leadTimeDays} days` },
          ...(recurring.minDaysBetweenBookings ? [{ label: "Minimum booking gap", value: `${recurring.minDaysBetweenBookings} days` }] : []),
        ] : []),
        ...(provider ? [{ label: "Provider", value: `${provider.name} (${provider.channel})` }] : []),
        { label: "Emergency contact", value: emergency },
      ];
      const sources = [recurring?.source, ...entry.components.map((component) => component.source)].filter(Boolean);
      return toolResponse({
        speech,
        data: { packId: pack.packId, catalogKey: match.catalogKey, entry, sources },
        card: { title: localName, subtitle: `${pack.name} · ${pack.units.volume} · ${pack.units.temp}`, items: cardItems },
      });
    }),
  );
}
