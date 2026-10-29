/**
 * Guards against shipping a half-translated UI: every translation key used in
 * the source must exist in both dictionaries, no dictionary may carry a key in
 * only one language, and the two languages must agree on `{placeholders}`.
 *
 * Usage: node tools/i18n/check-keys.mjs   (from src/ui/electron: npm run i18n:check)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const ui = path.join(root, "src", "ui", "electron");
const localesDir = path.join(ui, "shared", "locales");

const dicts = {
  en: JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8")),
  "zh-CN": JSON.parse(fs.readFileSync(path.join(localesDir, "zh-CN.json"), "utf8")),
};

const walk = (dir, exts) => {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, exts));
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
};

const files = walk(path.join(root, "src"), [".jsx", ".js", ".cjs", ".py"]);
const used = new Map(); // key -> [file:line]
const add = (key, where) => {
  if (!used.has(key)) used.set(key, []);
  used.get(key).push(where);
};

// t("a.b") / t("a.b", {...}) / t(`a.${code}`) / tr("a.b") / messageKey / message_key
const jsLiteral = /\b(?:t|tr)\(\s*(["'`])([A-Za-z0-9_.-]+)\1/g;
const jsPrefix = /\b(?:t|tr)\(\s*`([A-Za-z0-9_.-]*?)\$\{/g;
const assignedKey = /\b(?:messageKey|message_key|error_key)\s*[:=]\s*(["'])([A-Za-z0-9_.-]+)\1/g;

for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, "/");
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    const where = `${rel}:${index + 1}`;
    const trimmed = line.trim();
    // Doc comments contain example calls; they are not call sites.
    if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("#")) return;
    for (const match of line.matchAll(jsLiteral)) add(match[2], where);
    for (const match of line.matchAll(assignedKey)) add(match[2], where);
    for (const match of line.matchAll(jsPrefix)) {
      // Template prefixes expand at runtime (`language.${code}`); match by prefix.
      const prefix = match[1];
      const expanded = Object.keys(dicts.en).filter((k) => k.startsWith(prefix));
      if (!expanded.length) add(prefix + "${…}", where);
      else for (const key of expanded) add(key, where);
    }
  });
}

const missing = [];
for (const [key, wheres] of used) {
  for (const locale of Object.keys(dicts)) {
    if (!(key in dicts[locale])) missing.push(`${locale}  ${key}  <- ${wheres[0]}`);
  }
}

const unused = Object.keys(dicts.en).filter((key) => !used.has(key));

const placeholders = [];
const set = (text) =>
  [...text.matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .sort()
    .join(",");
for (const key of Object.keys(dicts.en)) {
  const en = dicts.en[key] ?? "";
  const zh = dicts["zh-CN"][key] ?? "";
  if (set(en) !== set(zh)) placeholders.push(`${key}  en{${set(en)}} zh{${set(zh)}}`);
}

const untranslated = Object.keys(dicts.en).filter(
  (key) => dicts.en[key] === dicts["zh-CN"][key] && /[A-Za-z]{3,}/.test(dicts.en[key] ?? ""),
);

const report = (title, rows) => {
  if (!rows.length) return;
  console.log(`\n${title} (${rows.length})`);
  for (const row of rows.slice(0, 80)) console.log("  " + row);
};
report("MISSING KEYS", missing);
report("PLACEHOLDER MISMATCH", placeholders);
report("ZH IDENTICAL TO EN (check on purpose)", untranslated);
// Dynamic lookups (`t(`column.${id}.${key}`)`) never show up as literals, so this
// list is advisory: it points at keys worth a second look, not at dead weight.
report("UNUSED KEYS (advisory: dynamic lookups are invisible to this scan)", unused);

console.log(
  `\n${used.size} keys referenced, ${Object.keys(dicts.en).length} in en, ${Object.keys(dicts["zh-CN"]).length} in zh-CN`,
);
if (missing.length || placeholders.length) process.exit(1);
