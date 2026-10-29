import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Dialog } from "@base-ui/react/dialog";
import { Tabs } from "@base-ui/react/tabs";
import { Menu } from "@base-ui/react/menu";
import { Icon } from "@iconify/react";
import restart from "@iconify-icons/solar/restart-linear";
import layers from "@iconify-icons/solar/layers-linear";
import keyboard from "@iconify-icons/solar/keyboard-linear";
import save from "@iconify-icons/solar/diskette-linear";
import arrow from "@iconify-icons/solar/arrow-right-linear";
import check from "@iconify-icons/solar/check-circle-linear";
import close from "@iconify-icons/solar/close-circle-linear";
import monitor from "@iconify-icons/solar/monitor-linear";
import gear from "@iconify-icons/solar/settings-linear";
import { Preferences, AudioFeedback } from "./preferences.jsx";
import { OverlayEditor } from "./overlays/editor.jsx";
import { GuidedTour } from "./guided-tour.jsx";
import { Onboarding } from "./onboarding.jsx";
import { Home } from "./home.jsx";
import { ResetLaunch } from "./reset-launch.jsx";
import { StartupSplash } from "./startup-splash.jsx";
import { Changelog } from "./changelog.jsx";
import { ResetLog, useResetLog } from "./reset-log.jsx";
import history from "@iconify-icons/solar/history-linear";
import home from "@iconify-icons/solar/home-2-linear";
import help from "@iconify-icons/solar/question-circle-linear";
import pen from "@iconify-icons/solar/pen-linear";
import bug from "@iconify-icons/solar/bug-linear";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-700.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "@fontsource/barlow-condensed/latin-500.css";
import "@fontsource/barlow-condensed/latin-600.css";
import logo from "@assets/sector-logo-orange.png";
import { keyFromEvent, keyLabel } from "./keys.js";
import { statusView } from "./status.js";
import {
  LocaleProvider,
  setLocale,
  useErrorMessage,
  useT,
} from "./i18n.jsx";
import "./style.css";

const api = window.sector;
const Glyph = ({ icon, ...props }) => (
  <Icon icon={icon} aria-hidden="true" {...props} />
);

function App() {
  const t = useT();
  const tError = useErrorMessage();
  const [startup, setStartup] = useState("pending");
  const finishStartup = useCallback(() => setStartup("done"), []);
  const [settings, setSettings] = useState(null);
  const [keys, setKeys] = useState([]);
  const [status, setStatus] = useState({ phase: "idle" });
  const [tab, setTab] = useState("home");
  const [game, setGame] = useState({
    running: false,
    launching: false,
    error: "",
  });
  const [preview, setPreview] = useState(true);
  const [modal, setModal] = useState(null);
  const [error, setError] = useState("");
  const [exportState, setExportState] = useState("");
  const [captureHint, setCaptureHint] = useState("main.capture.hint");
  const [pending, setPending] = useState(false);
  const [tour, setTour] = useState(false);
  const [onboarding, setOnboarding] = useState(null);
  const tourStartTab = useRef("reset");
  const [quitting, setQuitting] = useState(false);
  const backgroundAfterClose = useRef(false);
  const modalRef = useRef(null);
  const modalContent = useRef(null);
  if (modal) modalContent.current = modal;
  const shownModal = modalContent.current;
  const captureBusy = useRef(false);
  const audio = useRef(null);
  const view = statusView(status);
  const eacBlocked = status.blocked_reason === "eac" || game.eac === true;
  const gameDetected =
    game.running || ["active", "paused"].includes(status.phase);
  const resetLog = useResetLog(status);

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(
      settings?.reduce_motion === true,
    );
  }, [settings?.reduce_motion]);

  useEffect(() => {
    if (settings?.language) setLocale(settings.language);
  }, [settings?.language]);

  useEffect(() => {
    if (status.phase === "error") setQuitting(false);
  }, [status.phase, status.message]);

  useEffect(() => {
    let live = true;
    let receivedStatus = false;
    let receivedGame = false;
    const gameOff = api.onGame((value) => {
      receivedGame = true;
      if (live) setGame(value);
    });
    const statusOff = api.onStatus((value) => {
      receivedStatus = true;
      if (live) setStatus(value);
    });
    const closeOff = api.onCloseRequested(() => {
      setTour(false);
      setModal("close");
    });
    api
      .initialize()
      .then((data) => {
        if (!live) return;
        setSettings(data.settings);
        setStartup(data.launchAnimation ? "playing" : "done");
        setPreview(data.preview);
        if (!receivedGame) setGame(data.game);
        setOnboarding(data.onboarding);
        setKeys(data.keys);
        setError(data.settingsError);
        if (!receivedStatus) setStatus(data.status);
      })
      .catch(() => {
        setStartup("done");
        setError("error.initialize");
      });
    return () => {
      live = false;
      statusOff();
      gameOff();
      closeOff();
      audio.current?.pause();
    };
  }, []);

  useEffect(() => {
    const keyboardInput = () => {
      document.documentElement.dataset.input = "keyboard";
    };
    const pointerInput = () => {
      document.documentElement.dataset.input = "pointer";
    };
    window.addEventListener("keydown", keyboardInput, true);
    window.addEventListener("pointerdown", pointerInput, true);
    return () => {
      window.removeEventListener("keydown", keyboardInput, true);
      window.removeEventListener("pointerdown", pointerInput, true);
    };
  }, []);

  async function updateSettings(candidate) {
    setPending(true);
    try {
      const result = await api.saveSettings(candidate);
      if (!result.ok) throw new Error(result.error);
      setSettings(result.settings);
      setError("");
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (modal !== "save_key" && modal !== "restore_key") return;
    const capture = async (event) => {
      if (event.key === "Escape") return;
      if (
        event.target.closest?.("button") &&
        ["Enter", "Space"].includes(event.code)
      )
        return;
      // Tab remains navigation for the Cancel button. Clicking the Tab affordance
      // below explicitly assigns it, so keyboard users cannot be trapped here.
      if (event.code === "Tab") return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat || captureBusy.current) return;
      const name = keyFromEvent(event, keys);
      if (!name) {
        setCaptureHint("main.capture.singleKey");
        return;
      }
      const other = modal === "save_key" ? "restore_key" : "save_key";
      if (name === settings[other]) {
        setCaptureHint("main.capture.assigned");
        return;
      }
      captureBusy.current = true;
      if (await updateSettings({ ...settings, [modal]: name })) setModal(null);
      captureBusy.current = false;
    };
    const blur = () => setModal(null);
    window.addEventListener("keydown", capture, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", capture, true);
      window.removeEventListener("blur", blur);
    };
  }, [modal, settings, keys]);

  async function sound(name) {
    try {
      const result = await api.previewSound(name);
      if (!result.ok) throw new Error(result.error);
      audio.current?.pause();
      audio.current = new Audio(result.source);
      await audio.current.play();
      setError("");
    } catch (err) {
      setError(err.message || "main.error.audio");
    }
  }

  function openCapture(name) {
    setCaptureHint("main.capture.hint");
    setModal(name);
  }

  async function exit() {
    setQuitting(true);
    setModal(null);
    try {
      await api.quit();
    } catch {
      setQuitting(false);
      setError("main.error.closeFailed");
    }
  }

  const key = (name) =>
    keyLabel(settings?.[name] || (name === "save_key" ? "F6" : "F7"), keys);
  function startGuide() {
    tourStartTab.current = tab;
    setModal(null);
    // Let the menu release focus before the tour takes it.
    requestAnimationFrame(() => setTour(true));
  }
  if (startup === "pending") return <div className="splash" />;
  if (startup === "playing")
    return (
      <StartupSplash
        reduceMotion={settings?.reduce_motion === true}
        onDone={finishStartup}
      />
    );
  return (
    <>
      <div className="titlebar">
        <div className="titlebar-menus">
          <Menu.Root>
            <Menu.Trigger
              className="help-menu-trigger"
              data-tour="settings"
              disabled={!settings || quitting}
            >
              {t("main.menu.edit")}
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner
                className="help-menu-positioner"
                side="bottom"
                align="start"
                sideOffset={4}
                collisionPadding={8}
              >
                <Menu.Popup className="help-menu-popup">
                  <Menu.Item
                    className="help-menu-item"
                    onClick={() =>
                      requestAnimationFrame(() => setModal("settings"))
                    }
                  >
                    <Glyph icon={gear} /> {t("main.menu.settings")}
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
          <Menu.Root>
            <Menu.Trigger
              className="help-menu-trigger guide-menu-trigger"
              disabled={!settings || quitting}
            >
              {t("main.menu.help")}
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner
                className="help-menu-positioner"
                side="bottom"
                align="start"
                sideOffset={4}
                collisionPadding={8}
              >
                <Menu.Popup className="help-menu-popup">
                  <Menu.Item className="help-menu-item" onClick={startGuide}>
                    <Glyph icon={help} /> {t("main.menu.guide")}
                  </Menu.Item>
                  <Menu.Separator className="help-menu-separator" />
                  <Menu.Item
                    className="help-menu-item"
                    onClick={() => setModal("changelog")}
                  >
                    <Glyph icon={history} /> {t("main.menu.changelog")}
                  </Menu.Item>
                  <Menu.Separator className="help-menu-separator" />
                  <Menu.Item
                    className="help-menu-item"
                    onClick={() => {
                      setExportState("");
                      setModal("diagnostics");
                    }}
                  >
                    <Glyph icon={save} /> {t("main.menu.diagnostics")}
                  </Menu.Item>
                  <Menu.Item
                    className="help-menu-item"
                    onClick={async () => {
                      try {
                        const result = await api.reportBug();
                        if (!result.ok) throw new Error(result.error);
                      } catch (err) {
                        setError(err.message || "main.error.github");
                      }
                    }}
                  >
                    <Glyph icon={bug} /> {t("main.menu.reportBug")}
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </div>
        <div className="window-controls">
          <button aria-label={t("main.window.minimize")} onClick={() => api.minimize()}>
            <svg viewBox="0 0 16 16">
              <path d="M3 8h10" />
            </svg>
          </button>
          <button
            aria-label={t("main.window.maximize")}
            onClick={() => api.maximize()}
          >
            <svg viewBox="0 0 16 16">
              <rect x="3.5" y="3.5" width="9" height="9" rx=".5" />
            </svg>
          </button>
          <button
            data-tour="background"
            className="window-close"
            aria-label={t("main.window.close")}
            onClick={() => setModal("close")}
          >
            <svg viewBox="0 0 16 16">
              <path d="m4 4 8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      </div>
      <Tabs.Root
        value={tab}
        onValueChange={setTab}
        orientation="vertical"
        className="app-shell"
      >
        <header className="app-header">
          <div className="brand">
            <span
              className="brand-mark"
              style={{ maskImage: `url(${logo})` }}
              aria-hidden="true"
            />
            <span>
              sector<span className="brand-period">.</span>
            </span>
          </div>
          <Tabs.List className="tabs" aria-label={t("tab.list")}>
            <Tabs.Tab value="home">
              <Glyph icon={home} />
              {t("tab.home")}
            </Tabs.Tab>
            <Tabs.Tab value="reset">
              <Glyph icon={restart} />
              {t("tab.reset")}
            </Tabs.Tab>
            <Tabs.Tab value="overlay" data-tour="overlay">
              <Glyph icon={layers} />
              {t("tab.overlay")}
            </Tabs.Tab>
            <Tabs.Indicator className="tab-indicator" />
          </Tabs.List>
        </header>
        <main className="scroll-area">
          <Tabs.Panel value="home" className="page home-page">
            <Home
              game={game}
              view={view}
              status={status}
              saveKey={key("save_key")}
              restoreKey={key("restore_key")}
              disabled={!settings || pending || quitting}
              resetUnavailable={eacBlocked}
              onNavigate={setTab}
            />
          </Tabs.Panel>
          <Tabs.Panel value="reset" className="page reset-page">
            <div className="page-heading reset-heading">
              <div>
                <div className="page-kicker">{t("main.reset.kicker")}</div>
                <h1>{t("main.reset.title")}</h1>
              </div>
              <ResetLaunch
                game={game}
                preview={preview}
                disabled={!settings || pending || quitting}
              />
            </div>
            {eacBlocked && (
              <section className="reset-blocked" role="alert">
                <Glyph icon={close} />
                <div>
                  <h2>{t("main.eac.title")}</h2>
                  <p>
                    {t("main.eac.body", {
                      save: key("save_key"),
                      restore: key("restore_key"),
                    })}
                  </p>
                  <p>
                    {t("main.eac.nextBefore")}{" "}
                    <strong>{t("main.eac.openWithoutEac")}</strong>
                    {t("main.eac.nextAfter")}
                  </p>
                </div>
              </section>
            )}
            <section
              className={`checkpoint ${view.saved ? "is-saved" : ""}`}
              data-tour="checkpoint"
              aria-label={t("main.checkpoint.title")}
            >
              <div className="checkpoint-main">
                <div className="card-top">
                  <span className="eyebrow">
                    {t("main.checkpoint.eyebrow")}
                  </span>
                  <span className="checkpoint-label">
                    <Glyph icon={view.saved ? check : save} />
                    {view.saved
                      ? t("main.checkpoint.saved")
                      : t("main.checkpoint.empty")}
                  </span>
                </div>
                <h2 className="checkpoint-title">
                  {view.saved
                    ? t("main.checkpoint.ready")
                    : t("main.checkpoint.none")}
                </h2>
                <p className="checkpoint-help">
                  {eacBlocked ? (
                    <>{t("main.checkpoint.helpClosed")}</>
                  ) : view.saved ? (
                    <>
                      {t("main.checkpoint.returnBefore")}{" "}
                      <kbd>{key("restore_key")}</kbd>
                      {t("main.checkpoint.returnAfter")}
                    </>
                  ) : (
                    <>
                      {t("main.checkpoint.pressBefore")}{" "}
                      <kbd>{key("save_key")}</kbd>{" "}
                      {t("main.checkpoint.pressAfter")}
                    </>
                  )}
                </p>
              </div>
              <aside
                className="checkpoint-side"
                aria-label={t("main.checkpoint.readiness")}
              >
                <ol className="readiness-steps">
                  {[
                    [t("main.checkpoint.step.lmu"), gameDetected],
                    [
                      t("main.checkpoint.step.driving"),
                      status.phase === "active" && !eacBlocked,
                    ],
                    [t("main.checkpoint.step.saved"), view.saved],
                  ].map(([label, done], index) => (
                    <li key={label} data-done={Boolean(done)}>
                      <span>{done ? <Glyph icon={check} /> : index + 1}</span>
                      {label}
                    </li>
                  ))}
                </ol>
                <div className="checkpoint-count">
                  <span className="eyebrow">
                    {t("main.checkpoint.restores")}
                  </span>
                  <strong>{view.count}</strong>
                </div>
              </aside>
            </section>
            <ResetLog
              entries={resetLog}
              onExport={() => {
                setExportState("");
                setModal("diagnostics");
              }}
            />
            <div className="settings-grid">
              <section
                data-tour="shortcuts"
                className="settings-section"
                aria-labelledby="shortcuts-title"
              >
                <div className="section-heading">
                  <h2 id="shortcuts-title">{t("main.shortcuts.title")}</h2>
                </div>
                <div className="setting-row">
                  <span className="action-icon">
                    <Glyph icon={save} />
                  </span>
                  <div className="setting-label">
                    <h3>{t("main.shortcuts.save")}</h3>
                  </div>
                  <button
                    className="key-button"
                    aria-label={t("main.shortcuts.changeSave", {
                      key: key("save_key"),
                    })}
                    disabled={!settings || pending || quitting}
                    onClick={() => openCapture("save_key")}
                  >
                    <kbd>{key("save_key")}</kbd>
                    <Glyph icon={pen} />
                  </button>
                </div>
                <div className="setting-row">
                  <span className="action-icon">
                    <Glyph icon={restart} />
                  </span>
                  <div className="setting-label">
                    <h3>{t("main.shortcuts.restore")}</h3>
                  </div>
                  <button
                    className="key-button"
                    aria-label={t("main.shortcuts.changeRestore", {
                      key: key("restore_key"),
                    })}
                    disabled={!settings || pending || quitting}
                    onClick={() => openCapture("restore_key")}
                  >
                    <kbd>{key("restore_key")}</kbd>
                    <Glyph icon={pen} />
                  </button>
                </div>
              </section>
              <AudioFeedback
                settings={settings}
                pending={pending || quitting}
                updateSettings={updateSettings}
                sound={sound}
              />
            </div>
          </Tabs.Panel>
          <Tabs.Panel value="overlay" className="page overlay-page">
            <OverlayEditor />
          </Tabs.Panel>
          {error && (
            <div className="error-banner" role="alert">
              <Glyph icon={close} />
              <span>{tError(error)}</span>
              {(error === "error.settingsUnreadable" ||
                error.includes("Restore defaults")) && (
                <button
                  onClick={() =>
                    updateSettings({
                      save_key: "F6",
                      restore_key: "F7",
                      sound: true,
                      language: settings?.language,
                    })
                  }
                >
                  {t("main.error.restoreDefaults")}
                </button>
              )}
            </div>
          )}
        </main>
      </Tabs.Root>
      {onboarding?.required && (
        <Onboarding
          open={!modal && !quitting}
          initialFolder={onboarding.folder}
          onFinish={(tutorial) => {
            setOnboarding({ required: false });
            if (tutorial) startGuide();
          }}
        />
      )}
      {tour && (
        <GuidedTour
          saveKey={key("save_key")}
          restoreKey={key("restore_key")}
          onTabChange={setTab}
          onFinish={() => {
            setTour(false);
            setTab(tourStartTab.current);
            requestAnimationFrame(() =>
              document.querySelector(".guide-menu-trigger")?.focus(),
            );
          }}
        />
      )}
      <Dialog.Root
        open={modal !== null}
        onOpenChangeComplete={(open) => {
          if (!open && backgroundAfterClose.current) {
            backgroundAfterClose.current = false;
            void api.background();
          }
        }}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="modal-backdrop" />
          <Dialog.Viewport className="modal-viewport">
            <Dialog.Popup
              className={`modal${shownModal === "changelog" ? " changelog-modal" : shownModal === "settings" ? " settings-modal" : ""}`}
              ref={modalRef}
              initialFocus={modalRef}
            >
              {["settings", "changelog"].includes(shownModal) ? (
                <div className="page-kicker">
                  {shownModal === "settings"
                    ? t("main.modal.kickerSettings")
                    : t("main.modal.kickerChangelog")}
                </div>
              ) : (
                <div className="modal-icon">
                  <Glyph
                    icon={
                      shownModal === "diagnostics"
                        ? save
                        : shownModal === "changelog"
                          ? history
                          : shownModal === "settings"
                            ? gear
                            : shownModal === "close"
                              ? monitor
                              : keyboard
                    }
                  />
                </div>
              )}
              <Dialog.Title>
                {shownModal === "diagnostics"
                  ? t("main.modal.title.diagnostics")
                  : shownModal === "changelog"
                    ? t("main.modal.title.changelog")
                    : shownModal === "settings"
                      ? t("main.modal.title.settings")
                      : shownModal === "close"
                        ? t("main.modal.title.close")
                        : shownModal === "save_key"
                          ? t("main.modal.title.saveKey")
                          : t("main.modal.title.restoreKey")}
              </Dialog.Title>
              <Dialog.Description
                className={
                  ["settings", "changelog"].includes(shownModal)
                    ? "sr-only"
                    : undefined
                }
              >
                {shownModal === "diagnostics"
                  ? t("main.modal.desc.diagnostics")
                  : shownModal === "changelog"
                    ? t("main.modal.desc.changelog")
                    : shownModal === "settings"
                      ? t("main.modal.desc.settings")
                      : shownModal === "close"
                        ? t("main.modal.desc.close")
                        : tError(captureHint)}
              </Dialog.Description>
              {shownModal === "diagnostics" ? (
                <>
                  <p role="status">{exportState && tError(exportState)}</p>
                  <div className="onboarding-actions">
                    <Dialog.Close className="secondary">
                      {t("common.close")}
                    </Dialog.Close>
                    <button
                      className="primary"
                      disabled={pending}
                      onClick={async () => {
                        setPending(true);
                        setExportState("");
                        try {
                          const result = await api.exportDiagnostics();
                          if (!result.canceled)
                            setExportState(
                              result.ok
                                ? "main.modal.diagnostics.saved"
                                : result.error,
                            );
                        } catch {
                          setExportState("main.modal.diagnostics.failed");
                        } finally {
                          setPending(false);
                        }
                      }}
                    >
                      {t("main.modal.diagnostics.save")}
                    </button>
                  </div>
                </>
              ) : shownModal === "changelog" ? (
                <>
                  <Changelog />
                  <Dialog.Close className="secondary settings-done">
                    {t("common.done")}
                  </Dialog.Close>
                </>
              ) : shownModal === "settings" ? (
                <>
                  <Preferences
                    settings={settings}
                    pending={pending}
                    updateSettings={updateSettings}
                  />
                  <Dialog.Close className="secondary settings-done">
                    {t("common.done")}
                  </Dialog.Close>
                </>
              ) : shownModal === "close" ? (
                <div className="close-actions">
                  <button
                    className="primary"
                    onClick={() => {
                      // Finish the exit animation before Chromium hides the window.
                      backgroundAfterClose.current = true;
                      setModal(null);
                    }}
                  >
                    <Glyph icon={layers} />
                    <span>{t("main.modal.close.background")}</span>
                    <Glyph icon={arrow} />
                  </button>
                  <button className="text-button quit-button" onClick={exit}>
                    <Glyph icon={close} />
                    <span>{t("main.modal.close.quit")}</span>
                  </button>
                  <Dialog.Close className="text-button">
                    {t("common.cancel")}
                  </Dialog.Close>
                </div>
              ) : (
                <>
                  <div className="capture-key" aria-hidden="true">
                    <Glyph icon={keyboard} />
                    <span>{t("main.capture.pressAKey")}</span>
                  </div>
                  <div className="capture-actions">
                    <button
                      className="text-button"
                      disabled={pending}
                      onClick={async () => {
                        if (
                          await updateSettings({
                            ...settings,
                            [shownModal]: "Tab",
                          })
                        )
                          setModal(null);
                      }}
                    >
                      {t("main.capture.useTab")}
                    </button>
                    <Dialog.Close className="secondary">
                      {t("common.cancel")}
                    </Dialog.Close>
                  </div>
                </>
              )}
              {error && (
                <p className="modal-error" role="alert">
                  {tError(error)}
                </p>
              )}
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
      {quitting && (
        <div className="shutdown" role="status">
          {status.phase === "error"
            ? status.message_key
              ? t(status.message_key, status.message_params)
              : tError(status.message)
            : t("main.shutdown")}
        </div>
      )}
    </>
  );
}

createRoot(document.getElementById("root")).render(
  <LocaleProvider>
    <App />
  </LocaleProvider>,
);
