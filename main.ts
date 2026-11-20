// main.ts — hands the entry's YouTube address to the grader.
//
// The whole job: copy VIDEO.json from the bot directory (where the
// repository lives) into the output directory, byte for byte. Nothing
// else is read, written or computed, so two runs always agree.
//
// Configuration comes from the environment:
//   MAKEFUN_BOT_DIR     where VIDEO.json is read from   (default /bot)
//   MAKEFUN_OUTPUT_DIR  where VIDEO.json is written to  (default /output)
//
// Any failure (missing input, unwritable output) exits non-zero with
// the reason on stderr: a loud failure beats a silent wrong answer.

import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

function envOr(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function main(): void {
  const botDir = envOr("MAKEFUN_BOT_DIR", "/bot");
  const outputDir = envOr("MAKEFUN_OUTPUT_DIR", "/output");

  const source = join(botDir, "VIDEO.json");
  const target = join(outputDir, "VIDEO.json");

  // Create the output directory (and any parents) before copying, so a
  // fresh output location works without preparation.
  mkdirSync(outputDir, { recursive: true });
  copyFileSync(source, target);
}

try {
  main();
} catch (err) {
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`main.ts: could not copy VIDEO.json: ${detail}`);
  process.exit(1);
}
