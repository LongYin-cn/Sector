import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import model from "../../shared/overlay-model.cjs";
import layout from "../../shared/overlay-layout.cjs";
import i18n from "../../shared/i18n.cjs";
import { Widget } from "./widget.jsx";
import { sampleValues } from "./sample-values.js";
import "./window.css";
const api = window.sectorOverlay;
function OverlayWindow() {
  const [state, setState] = useState(null);
  const drag = useRef(null);
  const resizeFrame = useRef(null);
  function finishResize() {
    cancelAnimationFrame(resizeFrame.current);
    resizeFrame.current = null;
    const current = drag.current;
    drag.current = null;
    if (current) void api.scale(current.latest);
  }
  useEffect(() => {
    if (!state?.editing) finishResize();
    return () => {
      cancelAnimationFrame(resizeFrame.current);
      resizeFrame.current = null;
      drag.current = null;
    };
  }, [state?.editing]);
  useEffect(() => {
    let received = false;
    let pending = null;
    let animation = null;
    const off = api.onFrame((value) => {
      received = true;
      pending = value;
      if (animation !== null) return;
      animation = requestAnimationFrame(() => {
        animation = null;
        setState(pending);
      });
    });
    api.initialize().then((value) => {
      if (!received) setState(value);
    });
    return () => {
      off();
      if (animation !== null) cancelAnimationFrame(animation);
    };
  }, []);
  useEffect(() => {
    if (!state?.editing) return;
    const escape = (e) => {
      if (e.key === "Escape") void api.lock();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [state?.editing]);
  const language = state?.language;
  useEffect(() => {
    document.documentElement.lang = i18n.normalizeLocale(
      language ?? i18n.DEFAULT_LOCALE,
    );
  }, [language]);
  const widgetId = state?.id;
  useEffect(() => {
    if (!widgetId) return;
    document.title = i18n.createT(language)(`widget.name.${widgetId}`);
  }, [widgetId, language]);
  if (!state) return null;
  const { id, settings, editing, frame, scale } = state;
  const t = i18n.createT(language);
  const values = frame?.connected
    ? model.valuesFor(id, frame, settings, t.locale)
    : editing
      ? sampleValues(id, settings, t.locale)
      : model.valuesFor(id, null, settings, t.locale);
  const def = layout.dimensions(id, settings, values);
  const name = t(`widget.name.${id}`);
  return (
    <>
      <div
        className="widget-scale"
        style={{
          transform: `scale(${scale})`,
          width: def.width,
          height: def.height,
        }}
      >
        <Widget id={id} values={values} settings={{ ...settings, language }} />
      </div>
      {editing && (
        <>
          <div className="layout-handle">
            <span>{name}</span>
            <button aria-label={t("editor.lock")} onClick={() => api.lock()}>
              ✓
            </button>
          </div>
          <button
            className="resize-handle"
            aria-label={t("editor.resizeWidget")}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = {
                x: e.screenX,
                scale,
                width: def.width,
                latest: scale,
              };
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              drag.current.latest = Math.max(
                0.5,
                Math.min(
                  2,
                  drag.current.scale +
                    (e.screenX - drag.current.x) / drag.current.width,
                ),
              );
              if (resizeFrame.current !== null) return;
              resizeFrame.current = requestAnimationFrame(() => {
                resizeFrame.current = null;
                if (drag.current) void api.scale(drag.current.latest, false);
              });
            }}
            onPointerUp={finishResize}
            onPointerCancel={finishResize}
            onLostPointerCapture={finishResize}
            onKeyDown={(e) => {
              if (
                ["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp"].includes(
                  e.key,
                )
              ) {
                e.preventDefault();
                void api.scale(
                  settings.scale +
                    (["ArrowRight", "ArrowUp"].includes(e.key) ? 0.05 : -0.05),
                );
              }
            }}
          >
            ↘
          </button>
        </>
      )}
    </>
  );
}
createRoot(document.getElementById("root")).render(<OverlayWindow />);
