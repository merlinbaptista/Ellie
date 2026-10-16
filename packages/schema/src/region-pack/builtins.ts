import defaultPack from "../region-packs/default.json" with { type: "json" };
import inPack from "../region-packs/in.json" with { type: "json" };
import usPack from "../region-packs/us.json" with { type: "json" };
import ukPack from "../region-packs/uk.json" with { type: "json" };

export const BUILTIN_REGION_PACKS: unknown[] = [defaultPack, inPack, usPack, ukPack];
