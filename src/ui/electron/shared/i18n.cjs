/**
 * Minimal, dependency-free translation runtime shared by the Electron main
 * process, the React renderer and the overlay windows.
 *
 * Dictionaries live in `shared/locales/<locale>.json` as flat, dotted keys so
 * that every call site is a plain `t("home.status.ready")` string.
 */

const LOCALES = ["zh-CN", "en"];
const DEFAULT_LOCALE = "zh-CN";
const FALLBACK_LOCALE = "en";

const dictionaries = {
  en: require("./locales/en.json"),
  "zh-CN": require("./locales/zh-CN.json"),
};

function normalizeLocale(value) {
  if (typeof value !== "string") return DEFAULT_LOCALE;
  const tag = value.trim().toLowerCase().replace(/_/g, "-");
  if (!tag) return DEFAULT_LOCALE;
  if (tag.startsWith("zh")) return "zh-CN";
  if (tag.startsWith("en")) return "en";
  return DEFAULT_LOCALE;
}

/**
 * `--lang=en` on the command line pins the interface language. Smoke tests use
 * it so that every English locator in `tests/` keeps working while the app
 * ships translated by default.
 */
function forcedLocale(argv = process.argv) {
  for (const argument of argv) {
    if (typeof argument !== "string") continue;
    const match = /^--lang(?:=|\s+)(.+)$/.exec(argument);
    if (match) return normalizeLocale(match[1]);
  }
  return null;
}

/**
 * Dictionaries are flat (`{"home.title": "Overview"}`) so that fragments from
 * different modules merge without nesting conflicts. A nested object is still
 * accepted as a fallback so that hand-written JSON keeps working.
 */
function lookup(dictionary, key) {
  if (Object.prototype.hasOwnProperty.call(dictionary, key)) {
    const flat = dictionary[key];
    if (typeof flat === "string") return flat;
  }
  let node = dictionary;
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

function interpolate(text, params) {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name) =>
    Object.prototype.hasOwnProperty.call(params, name)
      ? String(params[name])
      : whole,
  );
}

function createT(locale) {
  const active = normalizeLocale(locale);
  const dictionary = dictionaries[active] || dictionaries[FALLBACK_LOCALE];
  const fallback = dictionaries[FALLBACK_LOCALE];
  const t = (key, params) =>
    interpolate(
      lookup(dictionary, key) ??
        lookup(fallback, key) ??
        lookup(fallback, "missing.key") ??
        key,
      params,
    );
  t.locale = active;
  t.has = (key) => lookup(dictionary, key) !== undefined;
  return t;
}

/**
 * Errors cross process boundaries as strings. When a message is one of our own
 * keys (`error.settingsUnreadable`) it is translated; anything else (a native
 * library message, a path, a stack detail) is shown verbatim.
 */
function translateMaybe(t, value) {
  if (typeof value !== "string") return value;
  return t.has(value) ? t(value) : value;
}

const dateLocale = (locale) =>
  normalizeLocale(locale) === "en" ? "en-GB" : "zh-CN";

module.exports = {
  LOCALES,
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  normalizeLocale,
  forcedLocale,
  createT,
  translateMaybe,
  dateLocale,
  dictionaries,
};
