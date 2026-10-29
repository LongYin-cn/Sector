const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { normalizeLocale, DEFAULT_LOCALE } = require("../shared/i18n.cjs");
const keymap = path.join(__dirname, "../shared/reset_keymap.json");
const keys = require(
  fs.existsSync(keymap)
    ? keymap
    : "../../../python/sector/desktop/reset_keymap.json",
);
const defaults = Object.freeze({
  save_key: "F6",
  restore_key: "F7",
  sound: true,
  reduce_motion: false,
  language: DEFAULT_LOCALE,
});

function validateSettings(value) {
  const find = (name) =>
    typeof name === "string" &&
    keys.find((key) => key.name.toUpperCase() === name.toUpperCase());
  const save = find(value?.save_key);
  const restore = find(value?.restore_key);
  if (
    !save ||
    !restore ||
    save.virtual_key === restore.virtual_key ||
    typeof value?.sound !== "boolean"
  ) {
    throw Object.assign(
      new Error("Choose two different keys without modifiers."),
      { code: "SETTINGS_INVALID_KEYS", key: "error.settingsKeys" },
    );
  }
  if (
    value.reduce_motion !== undefined &&
    typeof value.reduce_motion !== "boolean"
  ) {
    throw Object.assign(new Error("Reduce motion must be enabled or disabled."), {
      code: "SETTINGS_INVALID_MOTION",
      key: "error.settingsMotion",
    });
  }
  return {
    save_key: save.name,
    restore_key: restore.name,
    sound: value.sound,
    reduce_motion: value.reduce_motion ?? false,
    language: normalizeLocale(value.language),
  };
}

function readSettings(filename) {
  try {
    return validateSettings(
      JSON.parse(fs.readFileSync(filename, "utf8").replace(/^\uFEFF/, "")),
    );
  } catch (error) {
    if (error.code !== "ENOENT") {
      const unreadable = new Error(
        "Settings could not be read. Restore defaults to repair them.",
      );
      unreadable.code = "SETTINGS_UNREADABLE";
      unreadable.key = "error.settingsUnreadable";
      throw unreadable;
    }
    return { ...defaults };
  }
}

function writeSettings(filename, value) {
  const settings = validateSettings(value);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(settings), "utf8");
    fs.renameSync(temporary, filename);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return settings;
}

module.exports = {
  defaults,
  keys,
  validateSettings,
  readSettings,
  writeSettings,
};
