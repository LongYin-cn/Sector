const { BrowserWindow, ipcMain, screen } = require("electron");
const path = require("node:path");
const model = require("../shared/overlay-model.cjs");
const store = require("../shared/overlay-config.cjs");
const { createT } = require("../shared/i18n.cjs");
const { OverlayTelemetry } = require("./overlay-telemetry.cjs");
class Overlays {
  constructor({
    root,
    file,
    preview,
    desktop,
    discover,
    ready = () => true,
    translate = createT("en"),
  }) {
    Object.assign(this, { root, file, preview, desktop, ready, translate });
    this.windows = new Map();
    this.editing = false;
    this.error = "";
    this.errorKey = null;
    try {
      this.config = store.read(file);
    } catch (e) {
      this.config = store.defaults();
      this.error = e.message;
      this.errorKey = typeof e.key === "string" ? e.key : null;
    }
    this.telemetry = new OverlayTelemetry(root, {
      discover,
      getRefreshRate: () => this.display().displayFrequency,
    });
    this.telemetry.on("frame", () => this.sync());
    this.changed = () => this.sync();
    screen.on("display-added", this.changed);
    screen.on("display-removed", this.changed);
    screen.on("display-metrics-changed", this.changed);
    this.installBridge();
    this.sync();
  }
  state() {
    return {
      config: this.config,
      editing: this.editing,
      error: this.error,
      errorKey: this.errorKey,
      status: this.telemetry.status,
      frame: this.telemetry.frame,
      definitions: store.definitions,
      displays: screen.getAllDisplays().map((d) => ({
        id: d.id,
        primary: d.id === screen.getPrimaryDisplay().id,
        label: d.label || `${d.size.width} \u00d7 ${d.size.height}`,
        bounds: d.bounds,
      })),
    };
  }
  /** Overlay text keeps its key so the renderer never shows a raw English error. */
  overlayError(key) {
    return typeof this.translate.has === "function" && this.translate.has(key)
      ? this.translate(key)
      : key;
  }
  /** Interface language the overlay windows should render in. */
  language() {
    return this.translate?.locale ?? "zh-CN";
  }
  /** Widget name shown in the native window title and the editor. */
  widgetName(id) {
    const key = `widget.name.${id}`;
    return typeof this.translate.has === "function" && this.translate.has(key)
      ? this.translate(key)
      : store.definitions[id].name;
  }
  save(value) {
    try {
      this.config = this.preview
        ? store.validate(value)
        : store.write(this.file, value);
      this.error = "";
      this.errorKey = null;
      this.sync();
      return { ok: true, ...this.state() };
    } catch (e) {
      this.errorKey = typeof e.key === "string" ? e.key : null;
      this.error = this.errorKey ? this.overlayError(this.errorKey) : e.message;
      return {
        ok: false,
        code: e.code ?? "OVERLAY_CONFIG_INVALID",
        error: this.error,
        error_key: this.errorKey,
      };
    }
  }
  setEditing(value) {
    if (typeof value !== "boolean")
      throw Object.assign(new Error("Invalid edit mode."), {
        code: "OVERLAY_EDIT_MODE",
        key: "overlay.error.editMode",
      });
    if (!value) {
      this.flushScale();
      this.flushMove();
    }
    this.editing = value;
    this.sync();
    return this.state();
  }
  send(win, id, bounds) {
    if (win.isDestroyed() || win.webContents.isLoading()) return;
    const { config, editing } = this;
    const frame = this.telemetry.frame;
    win.webContents.send("sector:overlay-frame", {
      id,
      settings: config.widgets[id],
      editing,
      frame,
      language: this.language(),
      scale: (bounds || this.windowBounds(id)).scale,
    });
  }
  display() {
    return (
      screen.getAllDisplays().find((d) => d.id === this.config.displayId) ||
      screen.getPrimaryDisplay()
    );
  }
  windowBounds(id) {
    const display = this.display();
    return store.bounds(
      id,
      this.config.widgets[id],
      display.bounds,
      this.telemetry.frame
        ? model.valuesFor(id, this.telemetry.frame, this.config.widgets[id])
        : undefined,
    );
  }
  create(id) {
    const b = this.windowBounds(id);
    const win = new BrowserWindow({
      title: `Sector - ${this.widgetName(id)}`,
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      transparent: true,
      frame: false,
      hasShadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      show: false,
      focusable: false,
      webPreferences: {
        preload: path.join(__dirname, "overlay-preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        backgroundThrottling: false,
      },
    });
    this.windows.set(id, win);
    win.setAlwaysOnTop(true, "screen-saver");
    win.setIgnoreMouseEvents(true, { forward: true });
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (e) => e.preventDefault());
    win.webContents.on("will-attach-webview", (e) => e.preventDefault());
    win.webContents.on("did-stop-loading", () => this.sync());
    win.webContents.on("render-process-gone", () => {
      this.errorKey = "overlay.error.rendererClosed";
      this.error = this.overlayError(this.errorKey);
      this.config.widgets[id].enabled = false;
      win.destroy();
      this.sync();
    });
    // Windows emits will-move during a native drag and moved only on release.
    // Telemetry must never push stale configured bounds back into that drag.
    win.on("will-move", () => {
      if (this.editing) win.sectorDragging = true;
    });
    win.on("move", () => {
      if (!this.editing || this.moving) return;
      const bounds = win.getBounds(),
        old = this.windowBounds(id);
      if (bounds.x === old.x && bounds.y === old.y) return;
      const display =
        screen.getAllDisplays().find((d) => d.id === this.config.displayId) ||
        screen.getPrimaryDisplay();
      this.config.widgets[id].x = Math.max(0, bounds.x - display.bounds.x);
      this.config.widgets[id].y = Math.max(0, bounds.y - display.bounds.y);
      clearTimeout(this.moveTimer);
      this.moveTimer = setTimeout(() => this.flushMove(), 200);
    });
    win.on("moved", () => {
      win.sectorDragging = false;
      this.flushMove();
    });
    win.on("closed", () => this.windows.delete(id));
    void win.loadURL("sector://app/overlay.html");
    return win;
  }
  sync() {
    if (this.closed) return;
    this.telemetry.setRefreshRate(this.display().displayFrequency);
    const active = this.ready() && (this.config.enabled || this.editing);
    // Home uses session telemetry even when all overlay windows are disabled.
    if (this.ready() && !this.preview) this.telemetry.start();
    else if (!this.telemetry.stopped) this.telemetry.stop();
    for (const id of Object.keys(store.definitions)) {
      const setting = this.config.widgets[id];
      let win = this.windows.get(id);
      if (!active || !setting.enabled) {
        if (win) win.destroy();
        continue;
      }
      if (!win) win = this.create(id);
      const b = this.windowBounds(id),
        old = win.getBounds();
      if (
        !win.sectorDragging &&
        ["x", "y", "width", "height"].some((k) => b[k] !== old[k])
      ) {
        this.moving = true;
        win.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height });
        this.moving = false;
      }
      if (win.sectorEditing !== this.editing) {
        win.setFocusable(this.editing);
        win.setIgnoreMouseEvents(!this.editing, { forward: true });
        win.sectorEditing = this.editing;
      }
      const frame = this.telemetry.frame;
      if (
        !win.webContents.isLoading() &&
        (this.editing ||
          (this.config.enabled &&
            frame?.connected &&
            !frame.paused &&
            frame.cars?.length > 0 &&
            frame.foreground))
      ) {
        if (!win.isVisible()) win.showInactive();
      } else if (win.isVisible()) win.hide();
      this.send(win, id, b);
    }
    const desktop = this.desktop();
    if (desktop && !desktop.isDestroyed())
      desktop.webContents.send("sector:overlays", this.state());
  }
  installBridge() {
    const owner = (event) => {
      for (const [id, win] of this.windows)
        if (
          event.sender === win.webContents &&
          event.senderFrame === win.webContents.mainFrame &&
          event.senderFrame.url === "sector://app/overlay.html"
        )
          return id;
      throw Object.assign(new Error("Untrusted overlay request."), {
        code: "OVERLAY_UNTRUSTED_REQUEST",
      });
    };
    ipcMain.handle("sector:overlay-ready", (event) => {
      const id = owner(event);
      return {
        id,
        settings: this.config.widgets[id],
        editing: this.editing,
        frame: this.telemetry.frame,
        language: this.language(),
        scale: this.windowBounds(id).scale,
      };
    });
    ipcMain.handle("sector:overlay-scale", (event, scale, commit = true) => {
      const id = owner(event);
      if (
        !this.editing ||
        !Number.isFinite(scale) ||
        typeof commit !== "boolean"
      )
        return;
      this.config.widgets[id].scale = Math.max(0.5, Math.min(2, scale));
      // Resize native windows immediately; coalesce disk writes while dragging.
      clearTimeout(this.scaleTimer);
      if (commit) {
        this.scaleTimer = null;
        return this.save(this.config);
      }
      this.scaleTimer = setTimeout(() => this.flushScale(), 200);
      this.sync();
      return { ok: true };
    });
    ipcMain.handle("sector:overlay-lock", (event) => {
      owner(event);
      return this.setEditing(false);
    });
  }
  flushScale() {
    if (!this.scaleTimer) return;
    clearTimeout(this.scaleTimer);
    this.scaleTimer = null;
    this.save(this.config);
  }
  flushMove() {
    if (!this.moveTimer) return;
    clearTimeout(this.moveTimer);
    this.moveTimer = null;
    this.save(this.config);
  }
  stop() {
    this.flushScale();
    this.flushMove();
    this.closed = true;
    clearTimeout(this.moveTimer);
    this.telemetry.stop();
    for (const win of this.windows.values()) win.destroy();
    this.windows.clear();
    for (const event of [
      "display-added",
      "display-removed",
      "display-metrics-changed",
    ])
      screen.removeListener(event, this.changed);
  }
}
module.exports = { Overlays };
