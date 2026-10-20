import React, { useState, useEffect, useRef } from "react";
import layout from "../../shared/overlay-layout.cjs";
import { Widget } from "./widget.jsx";
import { sampleValues } from "./sample-values.js";
import model from "../../shared/overlay-model.cjs";
import "./editor.css";
const api = window.sector;
const wheelMarkers = [
  ["#FFD23F", "Yellow"],
  ["#FF8A3D", "Orange"],
  ["#4C8DFF", "Blue"],
  ["#FFFFFF", "White"],
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
  if (!state) return error ? <p role="alert">{error}</p> : null;
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
    ? model.valuesFor(selected, frame, setting)
    : sampleValues(selected, setting);
  const def = layout.dimensions(selected, setting, values);
  const scale = Math.min(setting.scale, (width - 32) / def.width);
  return (
    <div className="overlay-editor" data-tour="overlay-editor">
      <div className="page-heading overlay-heading">
        <div>
          <div className="page-kicker">03 / Widgets</div>
          <h1>Overlay</h1>
        </div>
        <div className="overlay-toolbar">
          <span className="overlay-enabled-control">
            <span>Overlays</span>
            <button
              role="switch"
              aria-label="Enable overlays"
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
            {state.editing ? "Lock layout" : "Edit layout"}
          </button>
        </div>
      </div>
      <div className="overlay-workspace">
        <div className="widget-list" role="group" aria-label="Widgets">
          <header className="widget-list-heading">
            <span>Widget</span>
            <span>Show</span>
          </header>
          {Object.entries(definitions).map(([id, d]) => (
            <div key={id} className={id === selected ? "selected" : ""}>
              <button
                className="widget-choice"
                aria-label={d.name}
                aria-pressed={id === selected}
                onClick={() => setSelected(id)}
              >
                {d.name}
                <small>
                  {d.width}×{d.height}
                </small>
              </button>
              <input
                type="checkbox"
                aria-label={`Show ${d.name}`}
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
              {definitions[selected].name}
              {frame?.connected ? " / Live" : ""}
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
          <div className="overlay-parts" aria-label="Widget columns">
            {layout.columns[selected].map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  aria-label={`Column ${label}`}
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
                {label}
              </label>
            ))}
            {(selected === "inputs"
              ? [
                  ["showClutch", "Clutch"],
                  ["showTrace", "Trace"],
                  ["showWheel", "Steering wheel"],
                  ["showGear", "Gear / speed"],
                ]
              : []
            ).map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={setting[key]}
                  onChange={(e) => update({ [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="overlay-controls">
            <NumberField
              label="X"
              value={setting.x}
              min={0}
              max={20000}
              onCommit={(x) => update({ x })}
              suffix="px"
            />
            <NumberField
              label="Y"
              value={setting.y}
              min={0}
              max={20000}
              onCommit={(y) => update({ y })}
              suffix="px"
            />
            <NumberField
              label="Size"
              live
              value={Math.round(setting.scale * 100)}
              min={50}
              max={200}
              step={5}
              onCommit={(scale) => update({ scale: scale / 100 })}
              suffix="%"
            />
            <label className="overlay-field opacity-field">
              <span>Opacity / {Math.round(setting.opacity * 100)}%</span>
              <input
                type="range"
                aria-label="Opacity"
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
                <span id="wheel-marker-label">Wheel marker</span>
                <div
                  className="wheel-swatches"
                  role="group"
                  aria-labelledby="wheel-marker-label"
                >
                  {wheelMarkers.map(([color, label]) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`${label} wheel marker`}
                      aria-pressed={setting.accent.toUpperCase() === color}
                      title={label}
                      style={{ backgroundColor: color }}
                      onClick={() => update({ accent: color })}
                    />
                  ))}
                </div>
              </div>
            )}
            {selected === "session-summary" &&
              layout.visible(setting, "position") && (
                <label className="overlay-field">
                  <span>Accent</span>
                  <input
                    type="color"
                    aria-label="Accent"
                    value={setting.accent}
                    onChange={(e) => update({ accent: e.target.value })}
                  />
                </label>
              )}
            {["leaderboard", "relative", "laps"].includes(selected) && (
              <NumberField
                label="Rows"
                value={setting.rows}
                min={3}
                max={selected === "laps" ? 8 : selected === "relative" ? 7 : 12}
                onCommit={(rows) => update({ rows })}
              />
            )}
            {selected === "inputs" && (
              <NumberField
                label="Rotation"
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
                  ["coldTemp", "Cold below", 0, 150, "°C"],
                  ["hotTemp", "Hot above", 20, 200, "°C"],
                  [
                    "flatSpotSensitivity",
                    "Flat spot sensitivity",
                    10,
                    100,
                    "%",
                  ],
                ]
              : selected === "stint-planner"
                ? [
                    ["consumptionLaps", "Consumption average", 1, 20, "laps"],
                    ["reserveLaps", "Reserve", 0, 5, "laps"],
                  ]
                : selected === "hybrid"
                  ? [
                      ["targetSoc", "Battery target", 10, 90, "%"],
                      ["targetLaps", "Target horizon", 1, 10, "laps"],
                      ["powerScale", "Power bar scale", 50, 500, "kW"],
                    ]
                  : []
            ).map(([key, label, min, max, suffix]) => (
              <NumberField
                key={key}
                label={label}
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
          {error || state.error}
        </p>
      )}
    </div>
  );
}
