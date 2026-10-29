const {
  createT,
  normalizeLocale,
  DEFAULT_LOCALE,
  forcedLocale,
} = require("./i18n.cjs");
/**
 * The compound keys are codes; the game reports them as English words
 * (`Soft`, `Medium`, `Hard`, `Wet`) and the matcher must keep reading those raw
 * values. Only the display name is translated.
 */
const compounds = {
  S: ["compound.soft", "#F2F4F6"],
  M: ["compound.medium", "#F5C518"],
  H: ["compound.hard", "#E5322F"],
  W: ["compound.wet", "#2D9CDB"],
};
/** Shared by the main process and the renderer, which has no `process.argv`. */
function resolveLocale(locale) {
  if (typeof locale === "string" && locale) return normalizeLocale(locale);
  try {
    if (typeof process !== "undefined")
      return forcedLocale(process.argv) ?? DEFAULT_LOCALE;
  } catch {
    /* Renderer without a process object: use the shipped default. */
  }
  return DEFAULT_LOCALE;
}
function compound(name, locale) {
  const code = /soft/i.test(name || "")
    ? "S"
    : /medium/i.test(name || "")
      ? "M"
      : /hard/i.test(name || "")
        ? "H"
        : /wet|rain/i.test(name || "")
          ? "W"
          : "-";
  const t = createT(resolveLocale(locale));
  return {
    code,
    name: compounds[code] ? t(compounds[code][0]) : t("compound.unavailable"),
    color: compounds[code]?.[1] || "#677383",
  };
}
function resourceValues(resources, locale) {
  const tyres = [0, 1, 2, 3].map((i) =>
    compound(resources?.compounds?.[i], locale),
  );
  const mixed = tyres.some((t) => t.code !== tyres[0].code);
  const energy = resources?.energy;
  const hasEnergy = Number.isFinite(energy) && energy >= 0 && energy <= 1;
  return {
    uniform: !mixed,
    mixed,
    tc: tyres[0].color,
    tl: tyres[0].code,
    wheels: tyres.map((t) => ({ c: t.color })),
    tyreTitle: tyres
      .map((t, i) => `${["FL", "FR", "RL", "RR"][i]} ${t.name}`)
      .join(", "),
    veTxt: hasEnergy ? `${Math.round(energy * 100)}%` : "-",
    veFg: hasEnergy && energy < 0.15 ? "#FF8A80" : "#C2C9D0",
  };
}
module.exports = { compound, resourceValues };
