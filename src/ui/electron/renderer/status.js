/**
 * Phase names are translation keys, not sentences: the same view is rendered in
 * the reset log, the status bar and several cards, and every one of them must
 * follow the selected interface language. Renderers translate with `t(key)`.
 */
export function statusView(status, format = {}) {
  const titles = {
    idle: "status.waitingForLmu",
    waiting: "status.waitingForDriving",
    starting: "status.connecting",
    active: "status.connected",
    paused: "status.waitingForDriving",
    stopping: "status.disconnecting",
    stopped: "status.disconnected",
    error: "status.stopped",
    blocked: "status.blocked",
  };
  const saved = status.checkpoint === true;
  // Speed is a bare number with no unit or grouping, so it is locale-neutral.
  const speed =
    saved &&
    Number.isFinite(status.saved_speed_kmh) &&
    status.saved_speed_kmh >= 0
      ? String(Math.round(status.saved_speed_kmh))
      : "-";
  const at = saved && Number.isFinite(status.saved_at) ? status.saved_at : null;
  return {
    title: titles[status.phase] || "status.waitingForLmu",
    tone:
      status.phase === "active"
        ? "connected"
        : status.phase === "error" || status.phase === "blocked"
          ? "error"
          : "waiting",
    saved,
    speed,
    count:
      saved &&
      Number.isSafeInteger(status.restore_count) &&
      status.restore_count >= 0
        ? status.restore_count
        : 0,
    // Callers inside React pass `useFormat().time`; the fallback follows the
    // system locale instead of pinning a region.
    time:
      at === null
        ? "-"
        : typeof format.time === "function"
          ? format.time(new Date(at * 1000))
          : new Date(at * 1000).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            }),
    message: typeof status.message === "string" ? status.message : "",
    // The backend sends a readable English sentence plus the key (and its
    // placeholders) it was rendered from, so every renderer can translate it in
    // the selected language. Keys with {code}/{name} need the params too.
    messageKey:
      typeof status.message_key === "string" ? status.message_key : "",
    messageParams: params(status.message_params),
  };
}

function params(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}
