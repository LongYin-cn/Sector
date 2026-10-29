import React, { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import play from "@iconify-icons/solar/play-linear";
import folderIcon from "@iconify-icons/solar/folder-open-linear";
import { DisplaySettings } from "./overlays/display-settings.jsx";
import { useErrorMessage, useT } from "./i18n.jsx";

function InstallationSettings() {
  const t = useT();
  const tError = useErrorMessage();
  const [folder, setFolder] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    window.sector
      .installation()
      .then((value) => {
        if (live) setFolder(value.folder);
      })
      .catch(() => {
        if (live) setError("error.folderRead");
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, []);
  async function changeFolder() {
    setBusy(true);
    setError("");
    try {
      const selected = await window.sector.browseInstallation();
      if (selected.canceled) return;
      if (!selected.ok) throw new Error(selected.error);
      const saved = await window.sector.updateInstallation(selected.folder);
      if (!saved.ok) throw new Error(saved.error);
      setFolder(saved.folder);
    } catch (err) {
      setError(err.message || "error.folderChange");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="installation-settings"
      aria-labelledby="installation-heading"
    >
      <h3 className="preference-category" id="installation-heading">
        {t("preferences.lmu")}
      </h3>
      <div className="installation-setting-row">
        <div className="setting-label">
          <h3>{t("preferences.gameFolder")}</h3>
          <p className="settings-folder" title={folder} role="status">
            {folder || t("preferences.noFolder")}
          </p>
        </div>
        <button
          className="secondary change-folder"
          disabled={busy}
          onClick={changeFolder}
        >
          <Icon icon={folderIcon} aria-hidden="true" />
          {t("preferences.changeFolder")}
        </button>
      </div>
      {error && (
        <p className="modal-error" role="alert">
          {tError(error)}
        </p>
      )}
    </section>
  );
}

const LANGUAGES = ["zh-CN", "en"];

export function Preferences({ settings, pending, updateSettings }) {
  const t = useT();
  return (
    <div className="preferences">
      <h3 className="preference-category">{t("preferences.languageGroup")}</h3>
      <div className="setting-row language-setting">
        <div className="setting-label">
          <h3 id="language-label">{t("preferences.language")}</h3>
          <p>{t("preferences.language.hint")}</p>
        </div>
        <div
          className="language-choices"
          role="radiogroup"
          aria-labelledby="language-label"
        >
          {LANGUAGES.map((code) => (
            <button
              key={code}
              role="radio"
              aria-checked={settings?.language === code}
              className="language-choice"
              disabled={pending}
              onClick={() => updateSettings({ ...settings, language: code })}
            >
              {t(`language.${code}`)}
            </button>
          ))}
        </div>
      </div>
      <h3 className="preference-category">{t("preferences.appearance")}</h3>
      <div className="setting-row motion-setting">
        <div className="setting-label">
          <h3 id="motion-label">{t("preferences.reduceMotion")}</h3>
          <p>{t("preferences.reduceMotionHint")}</p>
        </div>
        <button
          role="switch"
          aria-labelledby="motion-label"
          aria-checked={settings.reduce_motion}
          className="switch"
          disabled={pending}
          onClick={() =>
            updateSettings({
              ...settings,
              reduce_motion: !settings.reduce_motion,
            })
          }
        >
          <span />
        </button>
      </div>
      <DisplaySettings />
      <InstallationSettings />
    </div>
  );
}

export function AudioFeedback({ settings, pending, updateSettings, sound }) {
  const t = useT();
  return (
    <section
      className="audio-section"
      data-tour="audio"
      aria-labelledby="audio-title"
    >
      <div className="section-heading">
        <h2 id="audio-title">{t("preferences.audio")}</h2>
      </div>
      <div className="setting-row">
        <h3 id="sound-label">{t("preferences.audioToggle")}</h3>
        <button
          role="switch"
          aria-labelledby="sound-label"
          aria-checked={settings?.sound}
          className="switch"
          disabled={!settings || pending}
          onClick={() =>
            updateSettings({ ...settings, sound: !settings?.sound })
          }
        >
          <span />
        </button>
      </div>
      <div className="sound-previews">
        <button
          disabled={!settings?.sound || pending}
          onClick={() => sound("save")}
        >
          <Icon icon={play} aria-hidden="true" />
          {t("preferences.saveSound")}
        </button>
        <button
          disabled={!settings?.sound || pending}
          onClick={() => sound("restore")}
        >
          <Icon icon={play} aria-hidden="true" />
          {t("preferences.restoreSound")}
        </button>
      </div>
    </section>
  );
}
