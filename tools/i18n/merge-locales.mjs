#!/usr/bin/env node
/**
 * Rebuild src/ui/electron/shared/locales/{en,zh-CN}.json from the per-module
 * fragments in tools/i18n/sources/*.json.
 *
 * Fragment shape:
 *   { "en": { "home.title": "Overview", ... }, "zh-CN": { "home.title": "总览", ... } }
 *
 * The merge is a full rebuild so the result is deterministic: every key must
 * exist in both languages with the same `{placeholder}` set, otherwise the run
 * fails and prints the offending keys. Never hand-edit the generated locale
 * files — edit a fragment and run `npm run i18n` instead.
 *
 * Usage (from src/ui/electron or anywhere): node tools/i18n/merge-locales.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const fragmentDir = path.join(here, "sources");
const localeDir = path.resolve(here, "../../src/ui/electron/shared/locales");

const LOCALES = ["en", "zh-CN"];
const merged = { en: {}, "zh-CN": {} };
const problems = [];

for (const name of fs.readdirSync(fragmentDir).sort()) {
  if (!name.endsWith(".json")) continue;
  const file = path.join(fragmentDir, name);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    problems.push(`${name}: ${error.message}`);
    continue;
  }
  for (const locale of LOCALES) {
    const entries = data[locale];
    if (!entries || typeof entries !== "object") {
      problems.push(`${name}: missing "${locale}" section`);
      continue;
    }
    for (const [key, value] of Object.entries(entries)) {
      if (typeof value !== "string") {
        problems.push(`${name}: ${locale} ${key} is not a string`);
        continue;
      }
      if (key in merged[locale]) {
        problems.push(`${name}: duplicate key "${key}" in ${locale}`);
        continue;
      }
      merged[locale][key] = value;
    }
  }
}

const placeholders = (text) =>
  [...text.matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .sort()
    .join(",");

for (const key of Object.keys(merged.en)) {
  if (!(key in merged["zh-CN"])) problems.push(`${key}: missing zh-CN translation`);
  else if (placeholders(merged.en[key]) !== placeholders(merged["zh-CN"][key]))
    problems.push(`${key}: placeholder mismatch (en ${placeholders(merged.en[key])} / zh ${placeholders(merged["zh-CN"][key])})`);
}
for (const key of Object.keys(merged["zh-CN"]))
  if (!(key in merged.en)) problems.push(`${key}: missing en source string`);

if (problems.length) {
  console.error(`merge-locales: ${problems.length} problem(s)`);
  for (const line of problems) console.error("  " + line);
  process.exit(1);
}

const sorted = (object) =>
  Object.fromEntries(Object.keys(object).sort().map((key) => [key, object[key]]));

fs.mkdirSync(localeDir, { recursive: true });
for (const locale of LOCALES) {
  const body = JSON.stringify(sorted(merged[locale]), null, 2) + "\n";
  fs.writeFileSync(path.join(localeDir, `${locale}.json`), body, "utf8");
}

console.log(
  `merge-locales: ${Object.keys(merged.en).length} keys x ${LOCALES.length} locales -> ${path.relative(process.cwd(), localeDir)}`,
);
