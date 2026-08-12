#!/usr/bin/env node
/**
 * Compatibility entry point for the current v3 product API documentation.
 * The former implementation generated documentation for retired Gen-1 tools.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
execFileSync(process.execPath, [join(ROOT, "mcp", "v3", "build-v3-docs.mjs")], {
  cwd: ROOT,
  stdio: "inherit",
});
const canonical = readFileSync(join(ROOT, "docs", "api", "V3-README.md"), "utf8");
writeFileSync(
  join(ROOT, "docs", "api", "README.md"),
  canonical.replace(
    "# v3 mock services — vendor-shaped, conformance measured",
    "# Mock services — canonical product API documentation",
  ),
);
console.log("docs/api/README.md: canonical v3 product surface");
