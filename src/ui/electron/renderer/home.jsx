import React, { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import check from "@iconify-icons/solar/check-circle-linear";
import arrow from "@iconify-icons/solar/arrow-right-linear";
import layout from "../shared/overlay-layout.cjs";
import model from "../shared/overlay-model.cjs";
import { useErrorMessage, useT } from "./i18n.jsx";
import "./home.css";

const api = window.sector;

function LayoutPreview({ state }) {
  const t = useT();
  const { config, displays, frame } = state;
  const display =
    displays.find((d) => d.id === config.displayId) ||
    displays.find((d) => d.primary) ||
    displays[0];
  if (!display) return null;
  const { width, height } = display.bounds;
  return (
    <div
      className="home-layout"
      data-off={!config.enabled}
      data-edit={state.editing}
      role="img"
      aria-label={t("home.layout.aria")}
      style={{
        aspectRatio: `${width} / ${height}`,
        "--display-ratio": width / height,
      }}
    >
      {Object.entries(config.widgets)
        .filter(([, w]) => w.enabled)
        .map(([id, w]) => {
          const values = frame?.connected
            ? model.valuesFor(id, frame, w, t.locale)
            : undefined;
          const size = layout.dimensions(id, w, values);
          const scale = Math.min(
            w.scale,
            width / size.width,
            height / size.height,
          );
          const widgetWidth = Math.round(size.width * scale);
          const widgetHeight = Math.round(size.height * scale);
          return (
            <span
              key={id}
              title={t(`widget.name.${id}`)}
              style={{
                left: `${(Math.max(0, Math.min(w.x, width - widgetWidth)) / width) * 100}%`,
                top: `${(Math.max(0, Math.min(w.y, height - widgetHeight)) / height) * 100}%`,
                width: `${(widgetWidth / width) * 100}%`,
                height: `${(widgetHeight / height) * 100}%`,
              }}
            />
          );
        })}
      <small className="home-layout-caption">
        {display.label ||
          (display.primary
            ? t("home.display.primary")
            : t("home.display.label"))}
      </small>
    </div>
  );
}

export function Home({
  game,
  view,
  status,
  saveKey,
  restoreKey,
  disabled,
  resetUnavailable = false,
  onNavigate,
}) {
  const t = useT();
  const tError = useErrorMessage();
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState({});
  const inFlight = useRef(new Set());
  useEffect(() => {
    let live = true,
      received = false;
    const off = api.onOverlays((value) => {
      received = true;
      if (live) setState(value);
    });
    api
      .initializeOverlays()
      .then((value) => {
        if (live && !received) setState(value);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
      off();
    };
  }, []);

  async function action(name, callback) {
    if (inFlight.current.has(name)) return;
    inFlight.current.add(name);
    setBusy((current) => ({ ...current, [name]: true }));
    setError("");
    try {
      const result = await callback();
      if (result?.ok === false) throw new Error(result.error);
    } catch (e) {
      setError(e.message);
    } finally {
      inFlight.current.delete(name);
      setBusy((current) => ({ ...current, [name]: false }));
    }
  }

  const frame = state?.frame?.connected ? state.frame : null;
  const car = frame?.cars?.find((c) =>
    frame.player ? c.id === frame.player.id : c.player,
  );
  const inSession = Boolean(frame?.cars?.length);
  const elapsed =
    Number.isFinite(frame?.et) && frame.et >= 0
      ? [
          Math.floor(frame.et / 3600),
          Math.floor(frame.et / 60) % 60,
          Math.floor(frame.et) % 60,
        ]
          .map((part, index) =>
            index ? String(part).padStart(2, "0") : String(part),
          )
          .join(":")
      : null;
  const elapsedLabel = elapsed ? t("home.session.elapsed", { elapsed }) : null;
  const sessionDetails =
    car?.vehicle && elapsedLabel
      ? t("home.session.details", { car: car.vehicle, elapsed })
      : car?.vehicle || elapsedLabel || "";
  const running = game.running || inSession;
  const enabledCount = state
    ? Object.values(state.config.widgets).filter((w) => w.enabled).length
    : 0;
  const total = state ? Object.keys(state.definitions).length : 0;
  const resetBlocked =
    disabled || resetUnavailable || busy.reset || status.phase !== "active";
  return (
    <div className="home-content">
      <div className="home-heading">
        <div>
          <div className="page-kicker">{t("home.kicker")}</div>
          <h1>{t("home.title")}</h1>
        </div>
      </div>

      <section className="home-session" aria-label={t("home.session.aria")}>
        <div className="home-session-info">
          <span
            className={
              inSession ? "home-session-state is-live" : "home-session-state"
            }
          >
            {inSession
              ? status.phase === "active"
                ? t("home.state.inSession")
                : t("home.state.sessionLoaded")
              : running
                ? t("home.state.lmuRunning")
                : game.launching
                  ? t("home.state.launching")
                  : t("home.state.notRunning")}
          </span>
          <h2>
            {inSession
              ? frame.track || t("home.session.title")
              : running
                ? t("home.session.waiting")
                : t("home.session.ready")}
          </h2>
          {sessionDetails && <p>{sessionDetails}</p>}
        </div>
        <dl className="home-stats">
          <div>
            <dt>{t("home.stats.laps")}</dt>
            <dd>{car?.laps ?? "-"}</dd>
          </div>
          <div>
            <dt>{t("home.stats.best")}</dt>
            <dd className="home-best">{model.time(car?.best)}</dd>
          </div>
          <div>
            <dt>{t("home.stats.resets")}</dt>
            <dd>{view.count}</dd>
          </div>
        </dl>
      </section>

      <div className="home-cards">
        <section className="home-card" aria-label={t("home.reset.aria")}>
          <h2>{t("home.reset.title")}</h2>
          <div className="home-keys">
            <button
              className="home-key"
              disabled={resetBlocked}
              onClick={() => action("reset", () => api.reset("save"))}
              aria-label={t("home.reset.save")}
            >
              <kbd>{saveKey}</kbd>
              <span>{t("home.reset.save")}</span>
            </button>
            <button
              className="home-key"
              disabled={resetBlocked || !view.saved}
              onClick={() => action("reset", () => api.reset("restore"))}
              aria-label={t("home.reset.restore")}
            >
              <kbd>{restoreKey}</kbd>
              <span>{t("home.reset.restore")}</span>
            </button>
          </div>
          <div
            className={`home-checkpoint ${view.saved ? "is-saved" : ""}`}
            role="status"
          >
            {view.saved && <Icon icon={check} aria-hidden="true" />}
            {view.saved
              ? t("home.checkpoint.saved")
              : t("home.checkpoint.none")}
          </div>
          <button
            className="home-button home-open-reset"
            onClick={() => onNavigate("reset")}
          >
            {t("home.reset.open")}
            <Icon icon={arrow} aria-hidden="true" />
          </button>
        </section>

        <section className="home-card" aria-label={t("home.overlay.aria")}>
          <div className="home-card-heading">
            <h2>{t("home.overlay.title")}</h2>
            {state && (
              <span className="home-badge">
                {t("home.overlay.badge", {
                  count: enabledCount,
                  total,
                  mode: state.editing
                    ? t("home.overlay.editing")
                    : t("home.overlay.locked"),
                })}
              </span>
            )}
          </div>
          {state && <LayoutPreview state={state} />}
          <div className="home-overlay-actions">
            <button
              className="home-button"
              disabled={disabled || busy.layout || !state}
              onClick={() =>
                action("layout", async () => {
                  await api.editOverlays(true);
                  onNavigate("overlay");
                })
              }
            >
              {t("home.overlay.edit")}
            </button>
            <button
              className="home-button home-overlay-toggle"
              role="switch"
              aria-label={t("home.overlay.enable")}
              aria-checked={state?.config.enabled || false}
              disabled={disabled || !state}
              aria-busy={Boolean(busy.overlays)}
              onClick={() =>
                action("overlays", () =>
                  api.saveOverlays({
                    ...state.config,
                    enabled: !state.config.enabled,
                  }),
                )
              }
            >
              {state?.config.enabled
                ? t("home.overlay.toggleOn")
                : t("home.overlay.toggleOff")}
            </button>
          </div>
        </section>
      </div>
      {error && (
        <p className="home-error" role="alert">
          {tError(error)}
        </p>
      )}
    </div>
  );
}
