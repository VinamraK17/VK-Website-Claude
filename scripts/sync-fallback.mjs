// Regenerates the offline fallback arrays in pages/experience.html and
// pages/projects.html from the seed arrays in server.ts, so the fallbacks can
// never drift from what the database is seeded with. Run after editing the
// content in server.ts:
//   node scripts/sync-fallback.mjs
import { readFileSync, writeFileSync } from "node:fs";

const SERVER = "server.ts";

function extractArray(source, declaration) {
  const start = source.indexOf(declaration);
  if (start === -1) throw new Error(`Could not find "${declaration}"`);
  const open = source.indexOf("[", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error(`Unbalanced brackets after "${declaration}"`);
}

function replaceArray(pagePath, marker, literal) {
  const page = readFileSync(pagePath, "utf8");
  const start = page.indexOf(marker);
  if (start === -1) throw new Error(`Could not find "${marker}" in ${pagePath}`);
  const open = page.indexOf("[", start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < page.length; i++) {
    if (page[i] === "[") depth++;
    else if (page[i] === "]") {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end === -1) throw new Error(`Unbalanced brackets in ${pagePath}`);
  writeFileSync(pagePath, page.slice(0, open) + literal + page.slice(end));
  console.log(`Synced ${literal.split("order:").length - 1} entries into ${pagePath}`);
}

const server = readFileSync(SERVER, "utf8");
replaceArray("pages/experience.html", "const FALLBACK_EXPERIENCES = ",
  extractArray(server, "const experiencesToSeed ="));
replaceArray("pages/projects.html", "const FALLBACK_PROJECTS = ",
  extractArray(server, "const projectsToSeed ="));
