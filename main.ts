// main.ts — hands the entry's YouTube address to the grader.
//
// The job: deliver VIDEO.json from the bot directory (where the
// repository lives) into the output directory, byte for byte. Before
// anything is written, the input is checked to be what it claims to
// be — JSON carrying a plausible YouTube "url" — so a truncated or
// hand-mangled VIDEO.json fails here, loudly, instead of surfacing
// later as a grader rejection.
//
// Configuration comes from the environment:
//   MAKEFUN_BOT_DIR     where VIDEO.json is read from   (default /bot)
//   MAKEFUN_OUTPUT_DIR  where VIDEO.json is written to  (default /output)
//
// The write itself is atomic: the bytes land in a temporary file in
// the output directory first and are then renamed over VIDEO.json,
// so a grader never observes a half-written file. Any failure exits
// non-zero with the failing stage named on stderr.

import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

function envOr(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

// Hosts a genuine YouTube watch address can live on.
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

// Accept exactly the address shapes the entry may carry: a Shorts or
// watch URL on a youtube.com host, or a youtu.be short link. Anything
// else means the file is not the entry's video pointer.
function isPlausibleYouTubeUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return false;
  if (host === "youtu.be") {
    // Short link: the video id is the whole path, e.g. /yHy_KPKe8zE
    return parsed.pathname.length > 1;
  }
  if (parsed.pathname.startsWith("/shorts/")) {
    return parsed.pathname.length > "/shorts/".length;
  }
  if (parsed.pathname === "/watch") {
    return parsed.searchParams.has("v");
  }
  return false;
}

// Parse the raw bytes and insist on an object with a usable "url".
// Throws a plain Error describing the problem; the caller adds the
// stage context.
function validateVideoJson(bytes: Buffer): void {
  let data: unknown;
  try {
    data = JSON.parse(bytes.toString("utf8"));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`VIDEO.json is not valid JSON (${detail})`);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("VIDEO.json must contain a JSON object");
  }
  const url = (data as Record<string, unknown>)["url"];
  if (typeof url !== "string" || url === "") {
    throw new Error('VIDEO.json has no string "url" field');
  }
  if (!isPlausibleYouTubeUrl(url)) {
    throw new Error(`VIDEO.json "url" is not a YouTube address: ${url}`);
  }
}

function main(): void {
  const botDir = envOr("MAKEFUN_BOT_DIR", "/bot");
  const outputDir = envOr("MAKEFUN_OUTPUT_DIR", "/output");

  const source = join(botDir, "VIDEO.json");
  const target = join(outputDir, "VIDEO.json");

  // Read the bytes once; validation and the copy both work from this
  // buffer, so what was checked is exactly what gets delivered.
  let bytes: Buffer;
  try {
    bytes = readFileSync(source);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`read: cannot read ${source}: ${detail}`);
  }

  try {
    validateVideoJson(bytes);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`validate: ${detail}`);
  }

  // Create the output directory (and any parents) before writing, so
  // a fresh output location works without preparation.
  mkdirSync(outputDir, { recursive: true });

  // Atomic delivery: write beside the target, then rename over it.
  // The temp file is removed again if either step fails.
  const temp = join(outputDir, `VIDEO.json.tmp-${process.pid}`);
  try {
    writeFileSync(temp, bytes);
    renameSync(temp, target);

    // Read the delivered file back and compare it against the buffer
    // that was validated: the copy only counts as done when the bytes
    // on disk are exactly the bytes that were checked.
    const delivered = readFileSync(target);
    if (!delivered.equals(bytes)) {
      throw new Error(
        `delivered file differs from source (${delivered.length} vs ${bytes.length} bytes)`,
      );
    }
  } catch (err) {
    rmSync(temp, { force: true });
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`write: cannot deliver ${target}: ${detail}`);
  }
}

try {
  main();
} catch (err) {
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`main.ts: ${detail}`);
  process.exit(1);
}
