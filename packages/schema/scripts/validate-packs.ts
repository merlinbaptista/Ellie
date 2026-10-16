import { BUILTIN_REGION_PACKS, createBuiltInRegistry, RegionPack } from "../src/index.js";

const registry = createBuiltInRegistry();
let totalUnverified = 0;
console.log("Region pack validation");
for (const raw of BUILTIN_REGION_PACKS) {
  const pack = RegionPack.parse(raw);
  const resolved = registry.get(pack.packId);
  const count = registry.unverifiedFacts(pack.packId).length;
  totalUnverified += count;
  const itemCount = Object.keys(resolved.catalog).length;
  const providerCount = Object.keys(resolved.providers).length;
  console.log(`✔ ${pack.packId.padEnd(7)} ${pack.version}   ${itemCount} items  ${providerCount} providers  safety ✔   unverified facts: ${count}`);
}
console.log(`⚠ ${totalUnverified} values are starter defaults (verified: false). Check before shipping.`);
