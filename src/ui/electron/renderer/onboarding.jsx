import React, { useEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Icon } from "@iconify/react";
import folderIcon from "@iconify-icons/solar/folder-open-linear";
import helpIcon from "@iconify-icons/solar/question-circle-linear";
import { useErrorMessage, useT } from "./i18n.jsx";

export function Onboarding({ open, initialFolder, onFinish }) {
  const t = useT();
  const tError = useErrorMessage();
  const [step, setStep] = useState("folder");
  const [folder, setFolder] = useState(initialFolder || "");
  const [searching, setSearching] = useState(!initialFolder);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState({ message: "", key: "", params: {} });
  const popup = useRef(null);
  const manuallySelected = useRef(false);
  const api = window.sector;

  useEffect(() => {
    if (initialFolder) return;
    let live = true;
    api
      .detectInstallations()
      .then((folders) => {
        if (live && !manuallySelected.current) setFolder(folders[0] || "");
      })
      .catch(() => {
        if (live && !manuallySelected.current)
          setError({ message: "", key: "onboard.error.folder", params: {} });
      })
      .finally(() => {
        if (live) setSearching(false);
      });
    return () => {
      live = false;
    };
  }, [initialFolder]);

  async function run(action) {
    setBusy(true);
    setError({ message: "", key: "", params: {} });
    try {
      await action();
    } catch (e) {
      setError({
        message: e.message || "",
        key: e.key || (e.message ? "" : "onboard.error.save"),
        params: e.params || {},
      });
    } finally {
      setBusy(false);
    }
  }

  /** Main answers setup failures with both English text and the key behind it. */
  function failure(result) {
    return Object.assign(new Error(result?.error || ""), {
      key: result?.error_key || "",
      params: result?.error_params || {},
    });
  }

  function browse() {
    void run(async () => {
      const result = await api.browseInstallation();
      if (result.canceled) return;
      if (!result.ok) throw failure(result);
      manuallySelected.current = true;
      setSearching(false);
      setFolder(result.folder);
    });
  }

  function confirm() {
    void run(async () => {
      const result = await api.confirmInstallation(folder);
      if (!result.ok) throw failure(result);
      setStep("tutorial");
      requestAnimationFrame(() => popup.current?.focus());
    });
  }

  function finish(tutorial) {
    void run(async () => {
      const result = await api.completeOnboarding();
      if (!result.ok) throw failure(result);
      onFinish(tutorial);
    });
  }

  const message = error.key
    ? t(error.key, error.params)
    : tError(error.message);

  return (
    <Dialog.Root open={open} disablePointerDismissal>
      <Dialog.Portal>
        <Dialog.Backdrop className="modal-backdrop" />
        <Dialog.Viewport className="modal-viewport">
          <Dialog.Popup
            className="modal onboarding"
            ref={popup}
            initialFocus={popup}
          >
            <div className="onboarding-step" key={step} data-step={step}>
              <div className="modal-icon">
                <Icon
                  icon={step === "folder" ? folderIcon : helpIcon}
                  aria-hidden="true"
                />
              </div>
              <Dialog.Title>
                {step === "folder"
                  ? t("onboard.folder.title")
                  : t("onboard.tour.title")}
              </Dialog.Title>
              <Dialog.Description>
                {step === "folder"
                  ? t("onboard.folder.body")
                  : t("onboard.tour.body")}
              </Dialog.Description>
              {step === "folder" ? (
                <>
                  <div className="installation-folder" role="status">
                    <Icon icon={folderIcon} aria-hidden="true" />
                    <span>
                      {searching
                        ? t("onboard.searching")
                        : folder || t("onboard.chooseHint")}
                    </span>
                  </div>
                  <div className="onboarding-actions">
                    <button
                      className="secondary"
                      onClick={browse}
                      disabled={busy}
                    >
                      <Icon icon={folderIcon} aria-hidden="true" />
                      {t("onboard.choose")}
                    </button>
                    <button
                      className="primary"
                      onClick={confirm}
                      disabled={busy || searching || !folder}
                    >
                      {t("onboard.confirm")}
                    </button>
                  </div>
                </>
              ) : (
                <div className="onboarding-actions">
                  <button
                    className="secondary"
                    onClick={() => finish(false)}
                    disabled={busy}
                  >
                    {t("onboard.notNow")}
                  </button>
                  <button
                    className="primary"
                    onClick={() => finish(true)}
                    disabled={busy}
                  >
                    {t("onboard.startGuide")}
                  </button>
                </div>
              )}
            </div>
            {message && (
              <p className="modal-error" role="alert">
                {message}
              </p>
            )}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
