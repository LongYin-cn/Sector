const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  protocol,
  net,
  session,
  dialog,
  shell,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { Overlays } = require("./overlays.cjs");
const { Runtime, resolvePython, discoverGame } = require("./runtime.cjs");
const setupStore = require("./onboarding.cjs");
const { GameLauncher } = require("./game-launcher.cjs");
const { Diagnostics } = require("./diagnostics.cjs");
const {
  defaults,
  keys,
  readSettings,
  writeSettings,
  validateSettings,
} = require("./settings.cjs");
const { forcedLocale, createT } = require("../shared/i18n.cjs");

// Packaged resources are copied to a versioned writable workspace for native logs and IPC.
const sourceRoot = path.resolve(__dirname, "../../../..");
const packagedPreview = process.argv.includes("--preview");
const root = app.isPackaged
  ? path.join(
      app.getPath("userData"),
      packagedPreview ? "preview-runtime" : "runtime",
      `${app.getVersion()}-${fs.readFileSync(path.join(process.resourcesPath, "release-id"), "utf8").trim()}`,
    )
  : sourceRoot;
if (app.isPackaged) {
  if (!fs.existsSync(root)) {
    const staging = `${root}-${process.pid}.tmp`;
    fs.mkdirSync(staging, { recursive: true });
    fs.cpSync(path.join(process.resourcesPath, "runtime"), staging, {
      recursive: true,
    });
    try {
      fs.renameSync(staging, root);
    } catch (error) {
      if (!fs.existsSync(root)) throw error;
    }
  }
  process.env.SECTOR_PYTHON = path.join(root, "python/python.exe");
}
const preview = process.argv.includes("--preview");
const smoke = preview && process.argv.includes("--smoke");
// Smoke suites assert on the English interface; `--smoke` and `--lang=en` pin it
// so the translated default never breaks a locator.
const pinnedLocale =
  forcedLocale() ?? (smoke ? "en" : null);
const onboardingSmoke = smoke && process.argv.includes("--onboarding-smoke");
const previewRoot = path.join(root, "work/electron-preview");
if (preview) app.setPath("userData", previewRoot);
const diagnostics = new Diagnostics(
  preview ? previewRoot : root,
  app.getVersion(),
);
diagnostics.record("startup", {
  version: app.getVersion(),
  packaged: app.isPackaged,
  preview,
});
process.on("uncaughtExceptionMonitor", (error) =>
  diagnostics.record("uncaught-error", {
    message: error.message,
    stack: error.stack,
  }),
);
app.setName("Sector");
app.setAppUserModelId("Sector.Desktop");
protocol.registerSchemesAsPrivileged([
  {
    scheme: "sector",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
const settingsFile = path.join(
  preview ? previewRoot : process.env.LOCALAPPDATA || app.getPath("userData"),
  "LMUActiveReset/settings.json",
);
const setupFile =
  onboardingSmoke && process.env.SECTOR_TEST_SETUP_FILE
    ? process.env.SECTOR_TEST_SETUP_FILE
    : path.join(path.dirname(settingsFile), "onboarding.json");
let setup = setupStore.readSetup(setupFile);
const setupReady = () => (preview && !onboardingSmoke) || setup.completed;
/**
 * Late-bound main-process translator. Sub-systems built before the settings file
 * is read still follow the live language, including a language switch.
 */
function translate(key, params) {
  return createT(pinnedLocale ?? preferences.language)(key, params);
}
// Overlay windows read the live locale off the translator, so a language switch
// in Settings reaches them without rebuilding anything.
Object.defineProperty(translate, "locale", {
  get: () => createT(pinnedLocale ?? preferences.language).locale,
});
/** A shell status patch: English sentence plus the key behind it. */
function notice(key, params) {
  return {
    message: translate(key, params),
    message_key: key,
    message_params: params ?? {},
  };
}
/** A rejected IPC result: stable code plus the key the renderer translates. */
function failure(code, key, params) {
  return {
    ok: false,
    code,
    error: translate(key, params),
    error_key: key,
    error_params: params ?? {},
  };
}
const gameLauncher = new GameLauncher({
  installation: () => setup.lmuPath,
  discover: discoverGame,
  preview,
  translate,
});
const discoverInstallation = async () => {
  if (!setupReady()) return [];
  const games = await discoverGame(setup.lmuPath);
  gameLauncher.observe(games);
  return games;
};
const discoverOverlayGame = async () => {
  if (!setupReady()) return [];
  const games = await discoverGame(undefined, { telemetryOnly: true });
  gameLauncher.observe(games);
  return games;
};
let preferences = { ...defaults };
let settingsError = "";
try {
  preferences = readSettings(settingsFile);
} catch (error) {
  settingsError =
    error.code === "SETTINGS_UNREADABLE" ? "error.settingsUnreadable" : error.message;
}
/** Main-process translator; follows the live setting so a language switch applies at once. */
const tr = (key, params) =>
  createT(pinnedLocale ?? preferences.language)(key, params);
const runtime = new Runtime({
  root,
  settingsFile,
  getSettings: () => preferences,
  discover: discoverInstallation,
  translate,
});
let window;
let tray;
let quitting = false;
let canQuit = false;
let audioReady;
let overlays;
// Keep this in the main process so hiding, restoring or reloading cannot replay it.
let launchAnimationPending = true;
gameLauncher.on("state", (state) => {
  // Both overlay and reset discovery reach this path, including LMU's menu.
  // Block commands before notifying the renderer, without waiting for admission
  // or for the reset worker's next discovery cycle.
  if (state.eac && !runtime.eacBlocked) runtime.blockEac();
  if (window && !window.isDestroyed())
    window.webContents.send("sector:game", state);
});

function showWindow() {
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

async function quit() {
  if (quitting) return;
  quitting = true;
  showWindow();
  try {
    overlays?.stop();
    gameLauncher.stop();
    await runtime.stop();
    canQuit = true;
    app.quit();
  } catch (error) {
    quitting = false;
    runtime.publish({
      phase: "error",
      ...notice("app.error.shutdown", { reason: error.message }),
    });
  }
}

function handle(channel, callback) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (
      event.sender !== window?.webContents ||
      event.senderFrame !== window.webContents.mainFrame ||
      event.senderFrame.url !== "sector://app/index.html"
    )
      throw Object.assign(new Error("Untrusted desktop request."), {
        code: "UNTRUSTED_DESKTOP_REQUEST",
      });
    return callback(...args);
  });
}

function installBridge() {
  handle("sector:diagnostics-export", async () => {
    const selected = await dialog.showSaveDialog(window, {
      title: translate("app.dialog.exportTitle"),
      defaultPath: path.join(
        app.getPath("downloads"),
        `Sector-${app.getVersion()}-diagnostics.json`,
      ),
      filters: [
        { name: translate("app.dialog.exportFilter"), extensions: ["json"] },
      ],
    });
    if (selected.canceled || !selected.filePath) return { canceled: true };
    try {
      const frame = overlays?.telemetry.frame;
      const graphics = await app.getGPUInfo("basic").catch(() => null);
      const bundle = diagnostics.bundle({
        reset: runtime.state,
        telemetry: {
          status: overlays?.telemetry.status,
          track: frame?.track,
          car: frame?.player?.model,
          session: frame?.session,
        },
        graphics,
      });
      fs.writeFileSync(
        selected.filePath,
        JSON.stringify(bundle, null, 2),
        "utf8",
      );
      return { ok: true };
    } catch (error) {
      diagnostics.record("export-error", { message: error.message });
      return failure("EXPORT_FAILED", "app.error.exportFailed");
    }
  });
  handle("sector:initialize", () => {
    const launchAnimation = launchAnimationPending;
    launchAnimationPending = false;
    return {
      launchAnimation,
      settings: { ...preferences, language: pinnedLocale ?? preferences.language },
      keys,
      status: runtime.state,
      preview,
      game: gameLauncher.state,
      settingsError,
      onboarding: { required: !setupReady(), folder: setup.lmuPath },
    };
  });
  handle("sector:launch-game", () => gameLauncher.launch());
  handle("sector:report-bug", async () => {
    try {
      // Keep external navigation limited to the project's issue composer.
      await shell.openExternal(
        "https://github.com/sector-lmu/Sector/issues/new",
      );
      return { ok: true };
    } catch {
      return failure("BROWSER_FAILED", "app.error.github");
    }
  });
  handle("sector:installation", () => ({ folder: setup.lmuPath }));
  handle("sector:installation-update", (folder) => {
    try {
      if (!setupReady())
        throw Object.assign(new Error("Complete first-launch setup first."), {
          code: "SETUP_INCOMPLETE",
          key: "app.error.setupIncomplete",
        });
      if (quitting)
        throw Object.assign(new Error("Sector is closing."), {
          code: "CLOSING",
          key: "app.error.closing",
        });
      const candidate = {
        lmuPath: setupStore.validateFolder(folder),
        completed: true,
      };
      // Preview must never persist settings outside its isolated profile.
      setup =
        preview && !onboardingSmoke
          ? candidate
          : setupStore.writeSetup(setupFile, candidate);
      return { ok: true, folder: setup.lmuPath };
    } catch (error) {
      return {
        ok: false,
        code: error.code ?? "SETUP_FAILED",
        error: error.message,
        error_key: error.key ?? null,
      };
    }
  });
  handle("sector:reset", (action) =>
    preview || quitting || !setupReady()
      ? failure("RESET_UNAVAILABLE", "app.error.resetUnavailable")
      : runtime.requestReset(action),
  );
  handle("sector:setup-detect", async () => {
    if (preview)
      return onboardingSmoke && process.env.SECTOR_TEST_LMU
        ? [setupStore.validateFolder(process.env.SECTOR_TEST_LMU)]
        : [];
    return setupStore.detectInstallations();
  });
  handle("sector:setup-browse", async () => {
    const result = await dialog.showOpenDialog(window, {
      title: translate("app.dialog.setupTitle"),
      defaultPath: setup.lmuPath || undefined,
      properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    try {
      return {
        ok: true,
        folder: setupStore.validateFolder(result.filePaths[0]),
      };
    } catch (error) {
      return {
        ok: false,
        code: error.code ?? "SETUP_FAILED",
        error: error.message,
        error_key: error.key ?? null,
      };
    }
  });
  handle("sector:setup-confirm", (folder) => {
    try {
      if (setupReady())
        throw Object.assign(new Error("Setup is already complete."), {
          code: "SETUP_COMPLETE",
          key: "app.error.setupComplete",
        });
      setup = setupStore.writeSetup(setupFile, {
        lmuPath: folder,
        completed: false,
      });
      return { ok: true, folder: setup.lmuPath };
    } catch (error) {
      return {
        ok: false,
        code: error.code ?? "SETUP_FAILED",
        error: error.message,
        error_key: error.key ?? null,
      };
    }
  });
  handle("sector:setup-complete", () => {
    try {
      setup = setupStore.writeSetup(setupFile, { ...setup, completed: true });
      if (!preview && !settingsError) {
        preferences = writeSettings(settingsFile, preferences);
        runtime.start();
      }
      overlays.sync();
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        code: error.code ?? "SETUP_FAILED",
        error: error.message,
        error_key: error.key ?? null,
      };
    }
  });
  handle("sector:settings", (candidate) => {
    try {
      preferences = preview
        ? validateSettings(candidate)
        : writeSettings(settingsFile, candidate);
      settingsError = "";
      if (!preview && setupReady() && !runtime.timer) runtime.start();
      return {
        ok: true,
        settings: { ...preferences, language: pinnedLocale ?? preferences.language },
      };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  handle("sector:overlays-initialize", () => overlays.state());
  handle("sector:overlays-save", (value) => overlays.save(value));
  handle("sector:overlays-edit", (value) => overlays.setEditing(value));
  handle("sector:sound", async (name) => {
    if (!["save", "restore"].includes(name) || !preferences.sound)
      return failure("SOUND_DISABLED", "app.error.soundDisabled");
    try {
      const directory = path.join(root, "work/ui-audio");
      if (!audioReady) {
        audioReady = promisify(execFile)(
          resolvePython(),
          [
            path.join(root, "scripts/sector.py"),
            "desktop.reset_feedback",
            directory,
          ],
          { cwd: root, windowsHide: true, timeout: 15000 },
        ).catch((error) => {
          audioReady = null;
          throw error;
        });
      }
      await audioReady;
      return {
        ok: true,
        source: `data:audio/wav;base64,${fs.readFileSync(path.join(directory, `${name}.wav`)).toString("base64")}`,
      };
    } catch {
      return failure("SOUND_PREVIEW_FAILED", "app.error.soundPreview");
    }
  });
  handle("sector:minimize", () => window.minimize());
  handle("sector:maximize", () =>
    window.isMaximized() ? window.unmaximize() : window.maximize(),
  );
  handle("sector:background", () => {
    if (!quitting) {
      overlays.setEditing(false);
      window.hide();
    }
  });
  handle("sector:quit", () => {
    void quit();
  });
}

if (!app.requestSingleInstanceLock()) {
  // An older tray instance otherwise silently receives launches of a new EXE.
  if (preview) app.quit();
  else
    app.whenReady().then(async () => {
      await dialog.showMessageBox({
        type: "info",
        title: translate("app.instance.title", { version: app.getVersion() }),
        message: translate("app.instance.message"),
        detail: translate("app.instance.detail", {
          version: app.getVersion(),
        }),
        buttons: [translate("app.instance.ok")],
      });
      app.quit();
    });
} else {
  app.on("second-instance", showWindow);
  app.on("before-quit", (event) => {
    if (!canQuit) {
      event.preventDefault();
      void quit();
    }
  });
  app.on("window-all-closed", () => {
    /* Tray owns the app lifetime. */
  });
  app
    .whenReady()
    .then(async () => {
      const dist = path.join(__dirname, "../dist");
      protocol.handle("sector", (request) => {
        const url = new URL(request.url);
        const file = path.resolve(dist, `.${decodeURIComponent(url.pathname)}`);
        const relative = path.relative(dist, file);
        if (
          url.host !== "app" ||
          request.method !== "GET" ||
          relative.startsWith("..") ||
          path.isAbsolute(relative)
        )
          return new Response("Forbidden", { status: 403 });
        return net.fetch(pathToFileURL(file).toString());
      });
      session.defaultSession.setPermissionRequestHandler(
        (_contents, _permission, callback) => callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      window = new BrowserWindow({
        title: "Sector",
        width: 1200,
        height: 880,
        minWidth: 620,
        minHeight: 560,
        backgroundColor: "#f3f0e8",
        frame: false,
        show: false,
        icon: path.join(root, "assets/sector.ico"),
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
          backgroundThrottling: true,
        },
      });
      window.removeMenu();
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (event) => event.preventDefault());
      window.webContents.on("will-attach-webview", (event) =>
        event.preventDefault(),
      );
      window.webContents.on("render-process-gone", () => {
        void quit();
      });
      window.on("close", (event) => {
        if (!canQuit) {
          event.preventDefault();
          if (!quitting) window.webContents.send("sector:close-requested");
        }
      });
      overlays = new Overlays({
        root,
        file: path.join(path.dirname(settingsFile), "overlays.json"),
        preview,
        desktop: () => window,
        discover: discoverOverlayGame,
        ready: setupReady,
        translate,
      });
      installBridge();
      runtime.on("status", (state) => {
        diagnostics.record("reset-status", {
          phase: state.phase,
          message: state.message,
          checkpoint: state.checkpoint,
          log_prefix: state.log_prefix,
          restore_count: state.restore_count,
        });
        overlays.telemetry.onResetStatus(state);
        if (!window.isDestroyed())
          window.webContents.send("sector:status", state);
      });
      overlays.telemetry.on("frame", (frame) => {
        diagnostics.record("session", {
          status: overlays.telemetry.status,
          track: frame?.track,
          car: frame?.player?.model,
          session: frame?.session,
        });
        const player = frame?.cars?.find((car) => car.player);
        diagnostics.record("scoring", {
          gamePhase: frame?.gamePhase,
          yellowFlagState: frame?.yellowFlagState,
          playerId: player?.id,
          penalties: player?.penalties,
          finishStatus: player?.finishStatus,
          flag: player?.flag,
          countLap: player?.countLap,
          trackLimits: frame?.player?.limits,
          lapInvalidated: frame?.player?.invalid,
          restoreCount: runtime.state.restore_count,
        });
      });
      window.webContents.on("render-process-gone", (_event, details) =>
        diagnostics.record("renderer-exit", details),
      );
      tray = new Tray(path.join(root, "assets/sector.ico"));
      tray.setToolTip(
        preview
          ? translate("app.tray.tooltipPreview")
          : translate("app.tray.tooltip"),
      );
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: translate("app.tray.open"), click: showWindow },
          { type: "separator" },
          {
            label: translate("app.tray.quit"),
            click: () => {
              void quit();
            },
          },
        ]),
      );
      tray.on("double-click", showWindow);
      await window.loadURL("sector://app/index.html");
      if (!smoke) showWindow();
      // Preview and automated UI tests cannot discover LMU or launch the host.
      if (!preview && setupReady() && !settingsError) {
        try {
          preferences = writeSettings(settingsFile, preferences);
          runtime.start();
        } catch (error) {
          runtime.publish({
            phase: "error",
            message: error.message,
            message_key: error.key ?? null,
            message_params: error.params ?? {},
          });
        }
      }
      // Only the isolated preview process exposes a test driver, never the renderer.
      if (smoke)
        global.sectorTest = {
          publish: (state) => runtime.publish(state),
          clearProtection: () => {
            runtime.eacBlocked = false;
            runtime.publish({ phase: "idle", blocked_reason: null });
          },
          show: showWindow,
          window: () => window,
          hasListener: () => Boolean(runtime.child || runtime.timer),
          observeGame: (games) => gameLauncher.observe(games),
          overlays: () => overlays,
        };
    })
    .catch((error) => {
      console.error(error);
      canQuit = true;
      app.exit(1);
    });
}
