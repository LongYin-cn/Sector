import React, { useEffect, useState } from "react";
import { statusView } from "./status.js";
import { useErrorMessage, useFormat, useT } from "./i18n.jsx";
import "./reset-log.css";

// Keep the current run's status transitions across page changes. Repeated
// telemetry frames must not flood the log or continuously rerender its rows.
export function useResetLog(status) {
  const [entries, setEntries] = useState([]);
  const format = useFormat();
  const view = statusView(status);
  // Backend messages are English sentences plus an optional translation key and
  // its placeholders. The sentence is only kept to detect repeats; the key is
  // stored separately so a language switch never has to match on translated
  // text. Rows fall back to the phase key when the backend sent neither.
  const message = status.message || view.title;
  const messageKey = view.messageKey || undefined;
  const messageParams = view.messageParams;
  // Params come as a fresh object every frame; compare them by content so the
  // effect below does not run on every telemetry tick.
  const paramsKey = JSON.stringify(messageParams);
  const checkpointEvent = `${status.saved_at || ""}:${status.restore_count || 0}:${status.report_id || ""}`;
  const level =
    status.phase === "error"
      ? "ERROR"
      : status.phase === "blocked" ||
          (status.phase === "active" &&
            status.last_event === "rejected" &&
            !status.reset_action)
        ? "WARN"
        : status.phase === "active" && !status.reset_action
          ? "OK"
          : "INFO";
  const stamp = format.time;
  useEffect(() => {
    setEntries((previous) => {
      if (
        previous.at(-1)?.message === message &&
        previous.at(-1)?.level === level &&
        previous.at(-1)?.checkpointEvent === checkpointEvent
      )
        return previous;
      return [
        ...previous.slice(-199),
        {
          id: (previous.at(-1)?.id || 0) + 1,
          time: stamp(new Date()),
          message,
          messageKey,
          messageParams,
          level,
          checkpointEvent,
        },
      ];
    });
  }, [message, level, checkpointEvent, stamp, messageKey, paramsKey]);
  return entries;
}

export function ResetLog({ entries, onExport }) {
  const t = useT();
  const tError = useErrorMessage();
  const [open, setOpen] = useState(false);
  const [issuesOnly, setIssuesOnly] = useState(false);
  const issues = entries.filter((entry) =>
    ["ERROR", "WARN"].includes(entry.level),
  );
  const latest = entries.at(-1);
  // A key wins over the stored sentence: keys follow the interface language and
  // carry their own placeholders.
  const show = (entry) =>
    entry?.messageKey
      ? t(entry.messageKey, entry.messageParams)
      : tError(entry?.message);
  return (
    <section
      className="reset-log"
      aria-label={t("log.aria")}
      data-tour="connection"
    >
      <button
        className="reset-log-summary"
        aria-label={open ? t("log.hide") : t("log.show")}
        aria-expanded={open}
        aria-controls="reset-log-content"
        onClick={() => setOpen(!open)}
      >
        <span className="log-level" data-level={latest?.level}>
          {latest?.level || "INFO"}
        </span>
        <time>{latest?.time}</time>
        <span className="log-message" role="status">
          {show(latest)}
        </span>
        <span>{entries.length}</span>
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          style={{ transform: open ? "rotate(180deg)" : undefined }}
        >
          <path
            d="m6 9 6 6 6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      </button>
      <div id="reset-log-content" hidden={!open}>
        <div className="reset-log-tools">
          <div role="group" aria-label={t("log.filter")}>
            <button
              aria-pressed={!issuesOnly}
              onClick={() => setIssuesOnly(false)}
            >
              {t("log.all", { count: entries.length })}
            </button>
            <button
              aria-pressed={issuesOnly}
              onClick={() => setIssuesOnly(true)}
            >
              {t("log.issues", { count: issues.length })}
            </button>
          </div>
          <button onClick={onExport}>{t("log.export")}</button>
        </div>
        <ol
          className="reset-log-lines"
          aria-label={t("log.recent")}
          tabIndex={0}
        >
          {(issuesOnly ? issues : entries).map((entry) => (
            <li key={entry.id} data-level={entry.level}>
              <time>{entry.time}</time>
              <span>{entry.level}</span>
              <span>{show(entry)}</span>
            </li>
          ))}
          {issuesOnly && !issues.length && (
            <li className="log-empty">{t("log.empty")}</li>
          )}
        </ol>
      </div>
    </section>
  );
}
