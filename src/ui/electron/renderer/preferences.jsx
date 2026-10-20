import React, { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import play from "@iconify-icons/solar/play-linear";
import folderIcon from "@iconify-icons/solar/folder-open-linear";
import { DisplaySettings } from "./overlays/display-settings.jsx";

function InstallationSettings() {
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
        if (live) setError("Could not read the LMU folder.");
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
      setError(err.message || "Could not change the LMU folder.");
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
        Le Mans Ultimate
      </h3>
      <div className="installation-setting-row">
        <div className="setting-label">
          <h3>Game folder</h3>
          <p className="settings-folder" title={folder} role="status">
            {folder || "No folder selected"}
          </p>
        </div>
        <button
          className="secondary change-folder"
          disabled={busy}
          onClick={changeFolder}
        >
          <Icon icon={folderIcon} aria-hidden="true" />
          Change folder
        </button>
      </div>
      {error && (
        <p className="modal-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export function Preferences({ settings, pending, updateSettings }) {
  return (
    <div className="preferences">
      <h3 className="preference-category">Appearance</h3>
      <div className="setting-row motion-setting">
        <div className="setting-label">
          <h3 id="motion-label">Reduce motion</h3>
          <p>Fades instead of moving panels</p>
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
  return (
    <section
      className="audio-section"
      data-tour="audio"
      aria-labelledby="audio-title"
    >
      <div className="section-heading">
        <h2 id="audio-title">Audio feedback</h2>
      </div>
      <div className="setting-row">
        <h3 id="sound-label">Confirmation sounds</h3>
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
          Save sound
        </button>
        <button
          disabled={!settings?.sound || pending}
          onClick={() => sound("restore")}
        >
          <Icon icon={play} aria-hidden="true" />
          Restore sound
        </button>
      </div>
    </section>
  );
}
