import React, { useRef, useState } from "react";
import { Icon } from "@iconify/react";
import play from "@iconify-icons/solar/play-linear";
import check from "@iconify-icons/solar/check-circle-linear";
import "./reset-launch.css";

export function ResetLaunch({ game, preview, disabled }) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function launch() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await window.sector.launchGame();
      if (!result.ok) setError(result.error);
    } catch (failure) {
      setError(failure.message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="reset-launch" data-tour="launch">
      <button
        className="reset-launch-button"
        disabled={disabled || preview || busy || game.running || game.launching}
        title={
          game.running
            ? "Close LMU before launching it without EAC."
            : preview
              ? "Game launch is unavailable in preview."
              : undefined
        }
        onClick={launch}
      >
        <Icon icon={game.running ? check : play} aria-hidden="true" />
        {game.launching || busy ? "Opening LMU..." : "Open LMU without EAC"}
      </button>
      {(error || game.error) && <p role="alert">{error || game.error}</p>}
    </div>
  );
}
