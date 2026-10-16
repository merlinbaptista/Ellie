import { fillTemplate } from "@ellie/schema";
import type { Provider } from "@ellie/schema";

export function buildProviderLink(provider: Provider | undefined, vars: { displayName: string; brand?: string; model?: string }): string | undefined {
  if (!provider) return undefined;
  const text = provider.messageTemplate ?? "";
  const query = [vars.displayName, vars.brand, vars.model].filter(Boolean).join(" ");
  switch (provider.channel) {
    case "whatsapp":
      return fillTemplate(provider.urlTemplate ?? "https://wa.me/{to}?text={text}", { to: provider.to ?? "", text });
    case "sms":
      return `sms:${provider.to ?? ""}?body=${encodeURIComponent(text)}`;
    case "phone_call":
    case "ivrs":
      return provider.to ? `tel:${provider.to.startsWith("+") ? provider.to : `+${provider.to}`}` : undefined;
    case "web":
    case "shopping_link":
      return provider.urlTemplate ? fillTemplate(provider.urlTemplate, { query }) : undefined;
    default:
      return undefined;
  }
}
