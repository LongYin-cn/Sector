const { EventEmitter } = require("node:events");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { validateFolder } = require("./onboarding.cjs");
const { createT } = require("../shared/i18n.cjs");

class GameLauncher extends EventEmitter {
  constructor({
    installation,
    discover,
    preview = false,
    spawnChild = spawn,
    translate = createT("en"),
  }) {
    super();
    Object.assign(this, { installation, discover, preview, spawnChild, translate });
    this.state = { running: false, launching: false, eac: false, error: "" };
  }

  publish(patch) {
    this.state = { ...this.state, ...patch };
    this.emit("state", this.state);
  }

  /** The English sentence stays readable in logs; the key lets the UI translate it. */
  notice(key, params) {
    return {
      error: this.translate(key, params),
      error_key: key,
      error_params: params ?? {},
    };
  }

  async launch() {
    if (this.stopped)
      return { ok: false, code: "CLOSING", ...this.notice("launcher.closing") };
    if (this.preview)
      return {
        ok: false,
        code: "PREVIEW",
        ...this.notice("launcher.error.preview"),
      };
    if (this.state.launching || this.state.running) return { ok: true };
    this.publish({ launching: true, error: "", error_key: null });
    try {
      const folder = validateFolder(this.installation());
      // Check all LMU processes, including copies outside the selected folder.
      const games = await this.discover();
      if (this.stopped)
        return {
          ok: false,
          code: "CLOSING",
          ...this.notice("launcher.closing"),
        };
      if (games.length) {
        this.observe(games);
        return { ok: true };
      }
      const child = this.spawnChild(
        // Directly open the game executable, not Steam's EAC launcher.
        // Discovery still verifies the resulting process protection state.
        path.join(folder, "Le Mans Ultimate.exe"),
        [],
        {
          cwd: folder,
          detached: true,
          stdio: "ignore",
          shell: false,
        },
      );
      await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("spawn", resolve);
      });
      child.unref();
      // Process discovery, rather than a successful spawn, confirms the game opened.
      if (!this.stopped && !this.state.running)
        this.timeout = setTimeout(() => {
          this.publish({
            launching: false,
            ...this.notice("launcher.error.notOpened"),
          });
        }, 45000);
      this.timeout?.unref?.();
      return { ok: true };
    } catch (error) {
      // Setup rejections already carry a key; anything else stays a raw message.
      const reason =
        typeof error.key === "string" &&
        typeof this.translate.has === "function" &&
        this.translate.has(error.key)
          ? this.translate(error.key, error.params)
          : error.message;
      this.publish({
        launching: false,
        ...this.notice("launcher.error.failed", { reason }),
      });
      return {
        ok: false,
        code: "LAUNCH_FAILED",
        error: this.state.error,
        error_key: this.state.error_key,
        error_params: this.state.error_params,
      };
    }
  }

  observe(games) {
    const running = games.length > 0;
    if (running) {
      clearTimeout(this.timeout);
      this.publish({
        running: true,
        launching: false,
        eac: games.some((game) => game.eac === true),
        error: "",
        error_key: null,
      });
    } else if (this.state.running) {
      this.publish({ running: false, eac: false });
    }
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timeout);
  }
}

module.exports = { GameLauncher };
