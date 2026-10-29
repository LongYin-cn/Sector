import React, { useRef, useState } from "react";
import { Icon } from "@iconify/react";
import play from "@iconify-icons/solar/play-linear";
import check from "@iconify-icons/solar/check-circle-linear";
import { useErrorMessage, useT } from "./i18n.jsx";
import "./reset-launch.css";

const EMPTY = { message: "", key: "", params: {} };

export function ResetLaunch({ game, preview, disabled }) {
  const t = useT();
  const tError = useErrorMessage();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(EMPTY);
  async function launch() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(EMPTY);
    try {
      const result = await window.sector.launchGame();
      if (!result.ok)
        setError({
          message: result.error || "",
          key: result.error_key || "",
          params: result.error_params || {},
        });
    } catch (failure) {
      setError({ message: failure.message, key: "", params: {} });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  // Failures arrive as an English sentence with an optional key: the key follows
  // the interface language, anything else is shown verbatim.
  const failure = error.key
    ? t(error.key, error.params)
    : error.message
      ? tError(error.message)
      : game.error_key
        ? t(game.error_key, game.error_params)
        : game.error
          ? tError(game.error)
          : "";
  return (
    <div className="reset-launch" data-tour="launch">
      <button
        className="reset-launch-button"
        disabled={disabled || preview || busy || game.running || game.launching}
        title={
          game.running
            ? t("launch.running")
            : preview
              ? t("launch.preview")
              : undefined
        }
        onClick={launch}
      >
        <Icon icon={game.running ? check : play} aria-hidden="true" />
        {game.launching || busy
          ? t("launch.opening")
          : t("main.eac.openWithoutEac")}
      </button>
      {failure && <p role="alert">{failure}</p>}
    </div>
  );
}
