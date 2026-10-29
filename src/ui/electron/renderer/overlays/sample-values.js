import samples from "./samples.json";
import wheels from "../../shared/wheel-model.cjs";
import stint from "../../shared/stint-model.cjs";
import hybrid from "../../shared/hybrid-model.cjs";
import compounds from "../../shared/compound-model.cjs";
import { createT } from "../../shared/i18n.cjs";
/** Preview copy for the editor; the widget labels themselves stay in the designs. */
function commonValues(t) {
  return {
    sessionName: t("widget.session.race"),
    trackCars: t("widget.trackCars", { track: "Spa-Francorchamps", count: 56 }),
    lap: 48,
    remaining: "2:14:37",
    elapsed: "3:45:23",
    best: "2:18.412",
    surface: t("widget.surface.dryWithGrip", { grip: 98 }),
    air: "17\u00b0",
    trackTemp: "24\u00b0",
    humidity: "68%",
    forecast: t("widget.sample.forecast"),
    rainLap: t("widget.sample.rainLap"),
    energy: "41.2%",
    fuel: "38.6 L",
    bestLapLabel: "L31",
    bestEnergy: "3.5%",
    bestFuel: "2.40 L",
    bestGap: "+0.793",
    average: "2:18.864",
    averageEnergy: "3.6%",
    averageFuel: "2.42 L",
    averageGap: "+0.452",
    sessionTrack: t("widget.sessionTrack", {
      session: t("widget.sample.sixHours"),
      track: "Spa-Francorchamps",
    }),
    classBadge: "GT3",
    classColor: "#1FA34A",
    progress: 0.626,
    position: "P5",
    classCount: 18,
    gained: "+4",
    startPosition: t("widget.startPosition", { position: 9 }),
    firstLapLabel: "L1",
    lastLapLabel: "L48",
    lapCount: 48,
    pitStops: 2,
    lastPit: t("widget.lastPit", { lap: 43 }),
    limits: 2,
    limitMax: 5,
  };
}
export function sampleValues(id, settings, locale) {
  const t = createT(locale);
  if (id === "hybrid")
    return hybrid.hybridValues(
      {
        connected: true,
        player: {
          model: "Porsche 963",
          hybrid: {
            state: 2,
            torque: 38,
            rpm: 10000,
            battery: 0.45,
            map: 4,
            mapMax: 5,
          },
        },
        hybridLaps: [
          { map: 40, platform: "LMDh", delta: -1.4, seconds: 123 },
          { map: 40, platform: "LMDh", delta: -1.3, seconds: 124 },
          { map: 30, platform: "LMDh", delta: 1, seconds: 124 },
          { map: 30, platform: "LMDh", delta: 1.1, seconds: 125 },
        ],
      },
      settings,
    );
  if (["tyres", "stint-planner"].includes(id)) {
    const data = {
      connected: true,
      driving: true,
      player: {
        id: 1,
        et: 0.3,
        brake: 0.64,
        energy: 0.412,
        fuel: 38.6,
        frontCompound: "Soft",
        rearCompound: "Medium",
        wheels: [0.71, 0.78, 0.84, 0.86].map((wear, i) => ({
          attached: true,
          load: 3000,
          groundSpeed: 30,
          rotation: i === 0 ? 86 : 100,
          lateralSpeed: 2,
          radius: 0.31,
          deflection: 0.01,
          surface: 0,
          wear,
          flat: false,
          temperatures: [
            [98, 93, 88],
            [91, 88, 85],
            [86, 84, 82],
            [84, 83, 81],
          ][i],
        })),
      },
      cars: [{ id: 1, laps: 48 }],
      tyreLaps: [6, 6, 18, 18],
      flatSpots: [{ exposure: 60, duration: 2 }, null, null, null],
      laps: [{ clean: true, energy: 3.6, fuel: 2.42 }],
    };
    return id === "tyres"
      ? wheels.tyreValues(data, settings)
      : stint.stintValues(data, settings);
  }
  const result = JSON.parse(
    JSON.stringify({ ...commonValues(t), ...samples[id] })
      .replaceAll("#FFD23F", settings.accent)
      .replaceAll("rgba(255,210,63,0.22)", `${settings.accent}38`),
  );
  if (id === "inputs" && !settings.showClutch) {
    result.pedals = result.pedals.filter((p) => p.label !== "C");
    result.clutchPts = "";
  }
  if (id === "inputs")
    result.pedals = result.pedals.filter(
      (p) =>
        settings.columns?.[
          p.label === "T" ? "throttle" : p.label === "B" ? "brake" : "clutch"
        ] !== false,
    );
  // Sample rows carry the trailing "Lap 52" / "+1 LAP" copy the game sends in
  // English; only the preview text is translated here.
  const lapOf = (text) => {
    const m = /^Lap (\d+)$/.exec(text || "");
    return m ? t("widget.lapOf", { lap: m[1] }) : text;
  };
  const lapDelta = (text) => {
    const m = /^([+\u2212-]?\d+) LAP$/.exec(text || "");
    return m ? t("widget.lapDelta", { count: m[1] }) : text;
  };
  if (id === "leaderboard")
    result.classes = result.classes.map((cl) => ({
      ...cl,
      rows: cl.rows.slice(0, settings.rows).map((r, i) => ({
        ...r,
        gap: lapOf(r.gap),
        ...compounds.resourceValues(
          {
            compounds:
              i % 3 === 1
                ? ["Soft", "Soft", "Medium", "Medium"]
                : ["Medium", "Medium", "Medium", "Medium"],
            energy: ["GT3", "HY"].includes(cl.badge)
              ? (58 - i * 7) / 100
              : null,
          },
          t.locale,
        ),
      })),
    }));
  if (id === "relative")
    result.rows = result.rows
      .slice(0, settings.rows)
      .map((r) => ({ ...r, lap: lapDelta(r.lap) }));
  if (id === "laps")
    result.laps = result.laps
      .slice(0, settings.rows)
      .map((l) => ({
        ...l,
        tag: l.tag ? t(`widget.lapTag.${String(l.tag).toLowerCase()}`) : "",
      }));
  if (id === "weather") {
    const slots = ["now", "plus30", "plus1h", "plus1h30", "plus2h"];
    result.slots = result.slots.map((slot, i) => ({
      ...slot,
      label: t(`widget.weather.${slots[i]}`),
    }));
  }
  return result;
}
