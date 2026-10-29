const fs = require("node:fs");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { randomUUID } = require("node:crypto");
const { spawn, execFile } = require("node:child_process");
const { promisify } = require("node:util");
const execute = promisify(execFile);
const { resetAccess } = require("./reset-access.cjs");
const { createT } = require("../shared/i18n.cjs");

const emptyCheckpoint = {
  checkpoint: false,
  saved_speed_kmh: null,
  saved_at: null,
  restore_count: 0,
};

/**
 * Every user-visible status sentence travels with the key that produced it, so
 * the renderer can switch language without main-process text ever being final.
 */
function messageFor(translate, key, params) {
  return {
    message: translate(key, params),
    message_key: key,
    message_params: params ?? {},
  };
}

async function discoverGame(installation, { telemetryOnly = false } = {}) {
  // This fixed command never includes data from the renderer or settings.
  const command =
    "$env:PSModulePath = (Join-Path $PSHOME 'Modules') + [IO.Path]::PathSeparator + $env:PSModulePath; $eacActive = @(Get-Process -Name 'EasyAntiCheat*' -ErrorAction SilentlyContinue).Count -gt 0; @(Get-Process -Name 'Le Mans Ultimate' -ErrorAction SilentlyContinue | ForEach-Object { $gamePath = $null; $gameIdentity = $null; try { $gamePath = $_.Path; $gameIdentity = ([string]$_.Id + ':' + $_.StartTime.ToUniversalTime().Ticks) } catch {}; @{pid=$_.Id; executable=$gamePath; identity=$gameIdentity; eac=$eacActive} }) | ConvertTo-Json -Compress";
  const { stdout } = await execute(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { windowsHide: true, timeout: 5000 },
  );
  const parsed = stdout.trim() ? JSON.parse(stdout) : [];
  const games = Array.isArray(parsed) ? parsed : [parsed];
  // Protected processes may hide their path. Retain them only so reset
  // admission can report EAC explicitly before checking installation identity.
  return games.some((game) => game.eac === true)
    ? games
    : selectGames(games, installation, telemetryOnly);
}

function selectGames(games, installation, telemetryOnly = false) {
  // The public SDK does not require the protected game's executable path or start time.
  // Reset admission still requires the selected installation and a process identity.
  if (telemetryOnly) return games;
  return installation
    ? games.filter(
        (game) =>
          typeof game.executable === "string" &&
          typeof game.identity === "string" &&
          path.resolve(game.executable).toLowerCase() ===
            path.join(installation, "Le Mans Ultimate.exe").toLowerCase(),
      )
    : games;
}

function resolvePython() {
  if (process.env.SECTOR_PYTHON) return process.env.SECTOR_PYTHON;
  const bundled = path.join(
    process.env.USERPROFILE || "",
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe",
  );
  return fs.existsSync(bundled) ? bundled : "python.exe";
}

class Runtime extends EventEmitter {
  constructor({
    root,
    settingsFile,
    getSettings,
    python = resolvePython(),
    discover = discoverGame,
    spawnChild = spawn,
    now = Date.now,
    admission = resetAccess,
    translate = createT("en"),
  }) {
    super();
    Object.assign(this, {
      root,
      settingsFile,
      getSettings,
      python,
      discover,
      spawnChild,
      now,
      admission,
      translate,
    });
    this.state = {
      ...emptyCheckpoint,
      phase: "idle",
      message: "",
      message_key: null,
      message_params: {},
    };
    this.child = null;
    this.blockedIdentity = null;
    this.nextDiscovery = 0;
    this.nextHeartbeat = 0;
    this.sequence = -1;
    this.stopping = false;
    this.busy = false;
  }

  publish(patch) {
    if (patch.blocked_reason === "eac") this.eacBlocked = true;
    // A message without a key must never inherit the previous key's translation.
    const next =
      patch.message !== undefined && !patch.message_key
        ? { ...patch, message_key: null, message_params: {} }
        : patch;
    this.state = { ...this.state, ...next };
    if (this.eacBlocked)
      Object.assign(this.state, {
        phase: "blocked",
        blocked_reason: "eac",
        reset_action: 0,
        ...emptyCheckpoint,
        ...messageFor(this.translate, "runtime.eacBlocked"),
      });
    if (!this.state.checkpoint) Object.assign(this.state, emptyCheckpoint);
    this.localize();
    this.emit("status", this.state);
  }

  /** Status files from the Python host carry English text plus a key; render the key. */
  localize() {
    const key = this.state.message_key;
    if (typeof key !== "string" || !key) return;
    if (typeof this.translate.has !== "function" || !this.translate.has(key))
      return;
    this.state.message = this.translate(key, this.state.message_params);
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 250);
    void this.tick();
  }

  /** A rejected request keeps a stable code plus the key behind its English text. */
  rejection(code, key, params) {
    return {
      ok: false,
      code,
      error: this.translate(key, params),
      error_key: key,
      error_params: params ?? {},
    };
  }

  requestReset(action) {
    const reject = (code, key, params) =>
      Promise.resolve(this.rejection(code, key, params));
    if (this.eacBlocked) return reject("EAC", "runtime.eacBlocked");
    if (!["save", "restore"].includes(action))
      return reject("UNKNOWN_ACTION", "runtime.error.unknownAction");
    if (
      this.stopping ||
      !this.child ||
      this.state.phase !== "active" ||
      !this.state.log_prefix
    )
      return reject("NOT_DRIVING", "runtime.error.enterDriving");
    if (this.resetRequest) return reject("BUSY", "runtime.error.busy");
    if (action === "restore" && !this.state.checkpoint)
      return reject("NO_CHECKPOINT", "runtime.error.noCheckpoint");
    const request = {
      schema_version: 1,
      id: randomUUID(),
      action,
      host: this.state.log_prefix,
      created_at_ms: this.now(),
    };
    return new Promise((resolve) => {
      const file = path.join(this.session, "command.json");
      const temporary = `${file}.tmp`;
      this.resetRequest = {
        id: request.id,
        resolve,
        file,
        timer: setTimeout(
          () =>
            this.finishReset(
              this.rejection("TIMEOUT", "runtime.error.timeout"),
            ),
          7000,
        ),
      };
      try {
        fs.writeFileSync(temporary, JSON.stringify(request));
        fs.renameSync(temporary, file);
      } catch (error) {
        this.finishReset({ ok: false, error: error.message });
      } finally {
        fs.rmSync(temporary, { force: true });
      }
    });
  }

  finishReset(result) {
    const pending = this.resetRequest;
    if (!pending) return;
    this.resetRequest = null;
    clearTimeout(pending.timer);
    // Delete only our own unconsumed request. Never retry a timed-out reset.
    try {
      if (JSON.parse(fs.readFileSync(pending.file, "utf8")).id === pending.id)
        fs.rmSync(pending.file);
    } catch {
      /* The supervisor may already have consumed it. */
    }
    pending.resolve(result);
  }

  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      if (this.child) {
        if (this.now() >= this.nextHeartbeat) {
          fs.writeFileSync(path.join(this.session, "heartbeat"), "");
          this.nextHeartbeat = this.now() + 1000;
        }
        this.readStatus();
        if (
          !this.stopping &&
          !this.protectionCheck &&
          this.now() >= this.nextDiscovery
        ) {
          this.nextDiscovery = this.now() + 1500;
          const child = this.child;
          // Discovery can take seconds; keep heartbeat and acknowledgements
          // flowing while checking for a late EAC process.
          this.protectionCheck = this.discover()
            .then((games) => {
              if (
                !this.stopping &&
                this.child === child &&
                games.some((game) => game.eac === true)
              )
                this.blockEac();
            })
            .catch(() => {
              // The native runner retains its own process/context checks.
            })
            .finally(() => {
              this.protectionCheck = null;
            });
        }
        return;
      }
      if (this.stopping || this.now() < this.nextDiscovery) return;
      this.nextDiscovery = this.now() + 1500;
      const games = await this.discover();
      // A quit request may arrive while PowerShell is discovering the game.
      if (this.stopping) return;
      if (games.some((game) => game.eac === true)) {
        this.blockEac();
        return;
      }
      this.eacBlocked = false;
      this.state.blocked_reason = null;
      if (games.length !== 1) {
        this.blockedIdentity = null;
        this.publish({
          phase: "idle",
          ...emptyCheckpoint,
          ...(games.length > 1
            ? messageFor(this.translate, "runtime.keepOneInstance")
            : { message: "" }),
        });
        return;
      }
      const game = games[0];
      const access = await this.admission(game);
      if (this.stopping) return;
      if (!access.allowed) {
        this.publish({
          phase: "waiting",
          ...emptyCheckpoint,
          message: access.reason,
          message_key: access.message_key ?? null,
          message_params: access.message_params ?? {},
        });
        return;
      }
      if (
        !Number.isSafeInteger(game.pid) ||
        game.pid <= 0 ||
        typeof game.identity !== "string"
      )
        throw Object.assign(new Error("Invalid LMU process identity."), {
          code: "INVALID_IDENTITY",
          key: "runtime.error.invalidIdentity",
        });
      if (game.identity === this.blockedIdentity) return;
      this.blockedIdentity = game.identity;
      this.launch(game.pid);
    } catch (error) {
      this.publish({
        phase: "error",
        message: error.message,
        message_key: typeof error.key === "string" ? error.key : null,
        message_params: error.params ?? {},
      });
    } finally {
      this.busy = false;
    }
  }

  blockEac() {
    this.eacBlocked = true;
    this.finishReset(this.rejection("EAC", "runtime.eacBlocked"));
    this.publish({});
    if (this.child) fs.writeFileSync(path.join(this.session, "stop"), "");
  }

  launch(pid) {
    this.session = path.join(this.root, "work/gui", randomUUID());
    fs.mkdirSync(this.session, { recursive: true });
    fs.writeFileSync(path.join(this.session, "heartbeat"), "");
    const logs = path.join(this.root, "logs");
    fs.mkdirSync(logs, { recursive: true });
    const name = `gui-${path.basename(this.session)}`;
    const preferences = this.getSettings();
    const args = [
      path.join(this.root, "scripts/sector.py"),
      "runtime.start_reset_hotkeys",
      "--pid",
      String(pid),
      "--save-key",
      preferences.save_key,
      "--restore-key",
      preferences.restore_key,
      "--gui-session",
      this.session,
      "--settings-file",
      this.settingsFile,
      "--offline-launch-confirmed",
      "--allow-writes",
    ];
    if (!preferences.sound) args.push("--mute");
    const output = fs.openSync(path.join(logs, `${name}.log`), "a");
    let errors;
    try {
      errors = fs.openSync(path.join(logs, `${name}.error.log`), "a");
      this.child = this.spawnChild(this.python, args, {
        cwd: this.root,
        windowsHide: true,
        stdio: ["ignore", output, errors],
        env: { ...process.env, PYTHONUTF8: "1" },
      });
    } finally {
      fs.closeSync(output);
      if (errors !== undefined) fs.closeSync(errors);
    }
    this.sequence = -1;
    this.publish({
      phase: "waiting",
      ...emptyCheckpoint,
      ...messageFor(this.translate, "runtime.lmuDetected"),
    });
    const child = this.child;
    child.once("error", (error) => {
      this.publish({
        phase: "error",
        ...emptyCheckpoint,
        ...messageFor(this.translate, "runtime.error.listenerStart", {
          reason: error.message,
        }),
      });
    });
    child.once("close", (code) => {
      if (this.child !== child) return;
      this.readStatus();
      this.finishReset(this.rejection("DISCONNECTED", "runtime.error.listenerDisconnected"));
      this.child = null;
      const previousError = this.state.phase === "error";
      this.publish({
        ...emptyCheckpoint,
        phase: previousError ? "error" : code === 0 ? "stopped" : "error",
        ...(previousError
          ? { message: this.state.message, message_key: this.state.message_key }
          : code === 0
            ? messageFor(this.translate, "runtime.disconnected")
            : messageFor(this.translate, "runtime.error.listenerStopped", {
                code: code ?? "launch error",
              })),
      });
      this.emit("detached");
    });
  }

  readStatus() {
    try {
      const value = JSON.parse(
        fs.readFileSync(path.join(this.session, "status.json"), "utf8"),
      );
      if (
        value.schema_version !== 1 ||
        !Number.isSafeInteger(value.sequence) ||
        value.sequence === this.sequence
      )
        return;
      this.sequence = value.sequence;
      this.publish(value);
      if (
        value.desktop_request?.id === this.resetRequest?.id &&
        this.resetRequest
      )
        this.finishReset(value.desktop_request);
    } catch {
      /* Atomic replacement can briefly race a reader on Windows. */
    }
  }

  async stop() {
    this.stopping = true;
    this.finishReset(this.rejection("CLOSING", "runtime.closing"));
    if (!this.child) {
      this.dispose();
      return;
    }
    this.publish({
      phase: "stopping",
      ...messageFor(this.translate, "runtime.finishing"),
    });
    // Keep heartbeat/status polling alive until Python confirms native detach.
    // Never terminate the game or a listener in the middle of a restore.
    const detached = new Promise((resolve) => this.once("detached", resolve));
    fs.writeFileSync(path.join(this.session, "stop"), "");
    await detached;
    this.dispose();
  }

  dispose() {
    this.stopping = true;
    this.finishReset(this.rejection("STOPPED", "runtime.stopped"));
    clearInterval(this.timer);
    this.timer = null;
  }
}

module.exports = {
  Runtime,
  resolvePython,
  emptyCheckpoint,
  discoverGame,
  selectGames,
};
