import React, { useEffect, useState } from "react";
import { statusView } from "./status.js";
import "./reset-log.css";

// Keep the current run's status transitions across page changes. Repeated
// telemetry frames must not flood the log or continuously rerender its rows.
export function useResetLog(status) {
  const [entries, setEntries] = useState([]);
  const message = status.message || statusView(status).title;
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
          time: new Date().toLocaleTimeString("en-GB"),
          message,
          level,
          checkpointEvent,
        },
      ];
    });
  }, [message, level, checkpointEvent]);
  return entries;
}

export function ResetLog({ entries, onExport }) {
  const [open, setOpen] = useState(false);
  const [issuesOnly, setIssuesOnly] = useState(false);
  const issues = entries.filter((entry) =>
    ["ERROR", "WARN"].includes(entry.level),
  );
  const latest = entries.at(-1);
  return (
    <section
      className="reset-log"
      aria-label="Reset log"
      data-tour="connection"
    >
      <button
        className="reset-log-summary"
        aria-label={open ? "Hide reset log" : "Show reset log"}
        aria-expanded={open}
        aria-controls="reset-log-content"
        onClick={() => setOpen(!open)}
      >
        <span className="log-level" data-level={latest?.level}>
          {latest?.level || "INFO"}
        </span>
        <time>{latest?.time}</time>
        <span className="log-message" role="status">
          {latest?.message}
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
          <div role="group" aria-label="Filter log">
            <button
              aria-pressed={!issuesOnly}
              onClick={() => setIssuesOnly(false)}
            >
              All ({entries.length})
            </button>
            <button
              aria-pressed={issuesOnly}
              onClick={() => setIssuesOnly(true)}
            >
              Errors &amp; warnings ({issues.length})
            </button>
          </div>
          <button onClick={onExport}>Export diagnostics</button>
        </div>
        <ol
          className="reset-log-lines"
          aria-label="Recent status events"
          tabIndex={0}
        >
          {(issuesOnly ? issues : entries).map((entry) => (
            <li key={entry.id} data-level={entry.level}>
              <time>{entry.time}</time>
              <span>{entry.level}</span>
              <span>{entry.message}</span>
            </li>
          ))}
          {issuesOnly && !issues.length && (
            <li className="log-empty">No errors or warnings.</li>
          )}
        </ol>
      </div>
    </section>
  );
}
