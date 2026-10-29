import React, { useState, useEffect, useRef } from "react";
import layout from "../../shared/overlay-layout.cjs";
import { Widget } from "./widget.jsx";
import { sampleValues } from "./sample-values.js";
import model from "../../shared/overlay-model.cjs";
import { useT, useLocale, useErrorMessage } from "../i18n.jsx";
import "./editor.css";
const api = window.sector;
const wheelMarkers = [
  ["#FFD23F", "editor.wheel.yellow"],
  ["#FF8A3D", "editor.wheel.orange"],
  ["#4C8DFF", "editor.wheel.blue"],
  ["#FFFFFF", "editor.wheel.white"],
];
function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onCommit,
  suffix = "",
  live = false,
}) {
  const [draft, setDraft] = useState(String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(String(value));
  }, [value]);
  return (
    <label className="overlay-field">
      <span>
        {label}
        {suffix && ` / ${suffix}`}
      </span>
      <div>
        <input
          aria-label={label}
          type="number"
          value={draft}
          min={min}
          max={max}
          step={step}
          onFocus={() => {
            focused.current = true;
          }}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = e.target.valueAsNumber;
            if (
              live &&
              Number.isFinite(n) &&
              n >= min &&
              n <= max &&
              n !== value
            )
              onCommit(n);
          }}
          onBlur={(e) => {
            focused.current = false;
            const n = e.target.valueAsNumber;
            if (Number.isFinite(n) && n >= min && n <= max) {
              if (n !== value) onCommit(n);
              setDraft(String(n));
            } else setDraft(String(value));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
      </div>
    </label>
  );
}
export function OverlayEditor() {
  const t = useT();
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const [state, setState] = useState(null),
    [selected, setSelected] = useState("inputs"),
    [error, setError] = useState("");
  const [width, setWidth] = useState(600);
  const stage = useRef(null);
  const currentState = useRef(null);
  const queuedConfig = useRef(null);
  const saving = useRef(false);
  currentState.current = state;
  useEffect(() => {
    let received = false,
      live = true;
    const off = api.onOverlays((value) => {
      received = true;
      if (live)
        setState((current) =>
          saving.current && current
            ? { ...value, config: current.config }
            : value,
        );
    });
    api
      .initializeOverlays()
      .then((value) => {
        if (live && !received) setState(value);
      })
      .catch((e) => setError(e.message));
    return () => {
      live = false;
      off();
    };
  }, []);
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, [Boolean(state)]);
  async function save(config) {
    setState((current) => ({ ...current, config }));
    currentState.current = { ...currentState.current, config };
    queuedConfig.current = config;
    if (saving.current) return;
    saving.current = true;
    // Serialize/coalesce live slider changes. An older acknowledgement must
    // never move the thumb back or overwrite a more recent widget edit.
    try {
      while (queuedConfig.current) {
        const candidate = queuedConfig.current;
        queuedConfig.current = null;
        const result = await api.saveOverlays(candidate);
        if (!result.ok) throw new Error(result.error);
        if (!queuedConfig.current) setState(result);
      }
      setError("");
    } catch (e) {
      queuedConfig.current = null;
      setError(e.message);
      try {
        setState(await api.initializeOverlays());
      } catch {
        /* Retain the error for retry. */
      }
    } finally {
      saving.current = false;
    }
  }
  async function edit() {
    try {
      setState(await api.editOverlays(!state.editing));
    } catch (e) {
      setError(e.message);
    }
  }
  if (!state) return error ? <p role="alert">{errorMessage(error)}</p> : null;
  const { config, definitions, frame } = state,
    setting = config.widgets[selected];
  const update = (patch) => {
    const latest = currentState.current.config;
    return save({
      ...latest,
      widgets: {
        ...latest.widgets,
        [selected]: { ...latest.widgets[selected], ...patch },
      },
    });
  };

  const values = frame?.connected
    ? model.valuesFor(selected, frame, setting, locale)
    : sampleValues(selected, setting, locale);
  const def = layout.dimensions(selected, setting, values);
  const scale = Math.min(setting.scale, (width - 32) / def.width);
  // The column table keeps English display names so the JSON stays a plain
  // layout contract; the user-facing text comes from the dictionary.
  const columnLabel = (key, fallback) => {
    const id = `column.${selected}.${key}`;
    return t.has(id) ? t(id) : fallback;
  };
  return (
    <div className="overlay-editor" data-tour="overlay-editor">
      <div className="page-heading overlay-heading">
        <div>
          <div className="page-kicker">{t("editor.kicker")}</div>
          <h1>{t("editor.title")}</h1>
        </div>
        <div className="overlay-toolbar">
          <span className="overlay-enabled-control">
            <span>{t("editor.enabled")}</span>
            <button
              role="switch"
              aria-label={t("editor.enable")}
              aria-checked={config.enabled}
              className="switch"
              onClick={() => save({ ...config, enabled: !config.enabled })}
            >
              <span />
            </button>
          </span>
          <button
            className="secondary layout-toggle"
            aria-pressed={state.editing}
            onClick={edit}
          >
            {state.editing ? t("editor.lock") : t("editor.edit")}
          </button>
        </div>
      </div>
      <div className="overlay-workspace">
        <div className="widget-list" role="group" aria-label={t("editor.widgetsGroup")}>
          <header className="widget-list-heading">
            <span>{t("editor.widget")}</span>
            <span>{t("editor.show")}</span>
          </header>
          {Object.entries(definitions).map(([id, d]) => (
            <div key={id} className={id === selected ? "selected" : ""}>
              <button
                className="widget-choice"
                aria-label={t(`widget.name.${id}`)}
                aria-pressed={id === selected}
                onClick={() => setSelected(id)}
              >
                {t(`widget.name.${id}`)}
                <small>
                  {d.width}×{d.height}
                </small>
              </button>
              <input
                type="checkbox"
                aria-label={t("editor.showWidget", {
                  name: t(`widget.name.${id}`),
                })}
                checked={config.widgets[id].enabled}
                onChange={(e) =>
                  save({
                    ...config,
                    widgets: {
                      ...config.widgets,
                      [id]: {
                        ...config.widgets[id],
                        enabled: e.target.checked,
                      },
                    },
                  })
                }
              />
            </div>
          ))}
        </div>
        <div className="widget-inspector">
          <div className="widget-stage" ref={stage}>
            <span className="stage-mode">
              {t(`widget.name.${selected}`)}
              {frame?.connected ? t("editor.live") : ""}
            </span>
            <div
              style={{ width: def.width * scale, height: def.height * scale }}
            >
              <div
                style={{
                  width: def.width,
                  height: def.height,
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                }}
              >
                <Widget id={selected} values={values} settings={setting} />
              </div>
            </div>
          </div>
          <div className="overlay-parts" aria-label={t("editor.columnsGroup")}>
            {layout.columns[selected].map(([key, label]) => {
              const text = columnLabel(key, label);
              return (
                <label key={key}>
                  <input
                    type="checkbox"
                    aria-label={t("editor.columnToggle", { label: text })}
                    checked={layout.visible(setting, key)}
                    onChange={(e) =>
                      update({
                        columns: { ...setting.columns, [key]: e.target.checked },
                        ...(key === "logo"
                          ? { showLogos: e.target.checked }
                          : {}),
                      })
                    }
                  />
                  {text}
                </label>
              );
            })}
            {(selected === "inputs"
              ? [
                  ["showClutch", "editor.toggleClutch"],
                  ["showTrace", "editor.toggleTrace"],
                  ["showWheel", "editor.toggleWheel"],
                  ["showGear", "editor.toggleGear"],
                ]
              : []
            ).map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={setting[key]}
                  onChange={(e) => update({ [key]: e.target.checked })}
                />
                {t(label)}
              </label>
            ))}
          </div>
          <div className="overlay-controls">
            <NumberField
              label={t("editor.field.x")}
              value={setting.x}
              min={0}
              max={20000}
              onCommit={(x) => update({ x })}
              suffix="px"
            />
            <NumberField
              label={t("editor.field.y")}
              value={setting.y}
              min={0}
              max={20000}
              onCommit={(y) => update({ y })}
              suffix="px"
            />
            <NumberField
              label={t("editor.field.size")}
              live
              value={Math.round(setting.scale * 100)}
              min={50}
              max={200}
              step={5}
              onCommit={(scale) => update({ scale: scale / 100 })}
              suffix="%"
            />
            <label className="overlay-field opacity-field">
              <span>
                {t("editor.field.opacity", {
                  value: Math.round(setting.opacity * 100),
                })}
              </span>
              <input
                type="range"
                aria-label={t("editor.opacity")}
                aria-valuetext={`${Math.round(setting.opacity * 100)}%`}
                min="0"
                max="100"
                step="1"
                value={Math.round(setting.opacity * 100)}
                onChange={(e) =>
                  update({ opacity: e.target.valueAsNumber / 100 })
                }
              />
            </label>
            {selected === "inputs" && setting.showWheel && (
              <div className="overlay-field">
                <span id="wheel-marker-label">{t("editor.wheelMarker")}</span>
                <div
                  className="wheel-swatches"
                  role="group"
                  aria-labelledby="wheel-marker-label"
                >
                  {wheelMarkers.map(([color, key]) => {
                    const label = t(key);
                    return (
                      <button
                        key={color}
                        type="button"
                        aria-label={t("editor.wheelMarkerOption", { color: label })}
                        aria-pressed={setting.accent.toUpperCase() === color}
                        title={label}
                        style={{ backgroundColor: color }}
                        onClick={() => update({ accent: color })}
                      />
                    );
                  })}
                </div>
              </div>
            )}
            {selected === "session-summary" &&
              layout.visible(setting, "position") && (
                <label className="overlay-field">
                  <span>{t("editor.accent")}</span>
                  <input
                    type="color"
                    aria-label={t("editor.accent")}
                    value={setting.accent}
                    onChange={(e) => update({ accent: e.target.value })}
                  />
                </label>
              )}
            {["leaderboard", "relative", "laps"].includes(selected) && (
              <NumberField
                label={t("editor.field.rows")}
                value={setting.rows}
                min={3}
                max={selected === "laps" ? 8 : selected === "relative" ? 7 : 12}
                onCommit={(rows) => update({ rows })}
              />
            )}
            {selected === "inputs" && (
              <NumberField
                label={t("editor.field.rotation")}
                value={setting.lockDeg}
                min={90}
                max={540}
                step={10}
                onCommit={(lockDeg) => update({ lockDeg })}
                suffix="°"
              />
            )}
            {(selected === "tyres"
              ? [
                  ["coldTemp", "editor.field.coldBelow", 0, 150, "°C"],
                  ["hotTemp", "editor.field.hotAbove", 20, 200, "°C"],
                  [
                    "flatSpotSensitivity",
                    "editor.field.flatSpotSensitivity",
                    10,
                    100,
                    "%",
                  ],
                ]
              : selected === "stint-planner"
                ? [
                    [
                      "consumptionLaps",
                      "editor.field.consumptionAverage",
                      1,
                      20,
                      t("editor.unit.laps"),
                    ],
                    [
                      "reserveLaps",
                      "editor.field.reserve",
                      0,
                      5,
                      t("editor.unit.laps"),
                    ],
                  ]
                : selected === "hybrid"
                  ? [
                      ["targetSoc", "editor.field.batteryTarget", 10, 90, "%"],
                      [
                        "targetLaps",
                        "editor.field.targetHorizon",
                        1,
                        10,
                        t("editor.unit.laps"),
                      ],
                      [
                        "powerScale",
                        "editor.field.powerScale",
                        50,
                        500,
                        "kW",
                      ],
                    ]
                  : []
            ).map(([key, label, min, max, suffix]) => (
              <NumberField
                key={key}
                label={t(label)}
                value={setting[key]}
                min={min}
                max={max}
                suffix={suffix}
                onCommit={(value) => update({ [key]: value })}
              />
            ))}
          </div>
        </div>
      </div>
      {(error || state.error) && (
        <p role="alert" className="overlay-error">
          {errorMessage(error || state.error)}
        </p>
      )}
    </div>
  );
}
