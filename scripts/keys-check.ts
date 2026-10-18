import { config as loadDotenv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkKeys, formatKeyReport, hasMalformed } from "./keys-check-lib.js";

// Read raw values rather than the parsed env so defaults never disguise an unset key.
loadDotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env") });

const rows = checkKeys(process.env);
console.log(formatKeyReport(rows, process.argv.includes("--verbose")));
if (hasMalformed(rows)) process.exitCode = 1;
