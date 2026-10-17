const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const FILE_LIMIT = 256 * 1024;
const TOTAL_LIMIT = 4 * 1024 * 1024;
const MAX_FILES = 30;

function redact(text) {
  // Also covers escaped Windows paths inside JSONL records and tracebacks.
  return String(text)
    .replace(/([A-Z]:[\\/]+Users[\\/]+)[^\\/"\r\n]+/gi, "$1<user>")
    .replace(
      /((?:authorization|password|token|api[_-]?key)["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi,
      "$1<redacted>",
    );
}

function readTail(file, maximum = FILE_LIMIT) {
  const fd = fs.openSync(file, "r");
  try {
    const size = fs.fstatSync(fd).size;
    const buffer = Buffer.alloc(Math.min(size, maximum));
    const count = fs.readSync(
      fd,
      buffer,
      0,
      buffer.length,
      Math.max(0, size - buffer.length),
    );
    let text = buffer.subarray(0, count).toString("utf8");
    if (size > maximum) text = text.slice(text.indexOf("\n") + 1);
    return {
      truncated: size > maximum,
      sourceBytes: count,
      text: redact(text),
    };
  } finally {
    fs.closeSync(fd);
  }
}

class Diagnostics {
  constructor(root, version) {
    this.directory = path.join(root, "logs");
    this.version = version;
    this.last = new Map();
    this.file = path.join(this.directory, "desktop-diagnostics.jsonl");
  }

  record(event, data) {
    try {
      const content = JSON.stringify(data);
      if (this.last.get(event) === content) return;
      this.last.set(event, content);
      fs.mkdirSync(this.directory, { recursive: true });
      if (
        fs.existsSync(this.file) &&
        fs.statSync(this.file).size >= FILE_LIMIT
      ) {
        const previous = this.file + ".previous";
        fs.rmSync(previous, { force: true });
        fs.renameSync(this.file, previous);
      }
      const row = JSON.stringify({
        time: new Date().toISOString(),
        event,
        data:
          content.length > 12000
            ? { truncated: true, text: content.slice(0, 12000) }
            : data,
      });
      // A logging failure must never interrupt simulation or app shutdown.
      fs.appendFileSync(this.file, redact(row) + "\n");
    } catch {}
  }

  bundle(context = {}) {
    const files = [];
    const omissions = [];
    let remaining = TOTAL_LIMIT;
    let entries = [];
    try {
      entries = fs
        .readdirSync(this.directory, { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isFile() &&
            /^(?:desktop-diagnostics\.jsonl(?:\.previous)?|.*\.(?:reports\.jsonl|summary\.json|error\.log)|desktop[-_].*\.log)$/.test(
              entry.name,
            ),
        )
        .map((entry) => ({
          name: entry.name,
          modified: fs.statSync(path.join(this.directory, entry.name)).mtimeMs,
        }))
        .sort((a, b) => b.modified - a.modified);
    } catch (error) {
      omissions.push(`Log inventory: ${redact(error.message)}`);
    }
    for (const entry of entries) {
      if (!remaining || files.length >= MAX_FILES) {
        omissions.push(entry.name);
        continue;
      }
      try {
        const tail = readTail(
          path.join(this.directory, entry.name),
          Math.min(FILE_LIMIT, remaining),
        );
        remaining -= tail.sourceBytes;
        files.push({ ...entry, ...tail });
      } catch (error) {
        omissions.push(`${entry.name}: ${redact(error.message)}`);
      }
    }
    // The export contains text logs only, never memory dumps or checkpoint data.
    return JSON.parse(
      redact(
        JSON.stringify({
          schema: 1,
          version: this.version,
          experimental: true,
          exportedAt: new Date().toISOString(),
          system: {
            platform: process.platform,
            arch: process.arch,
            os: os.release(),
            versions: process.versions,
          },
          context,
          files,
          omissions,
          limits: {
            maxFiles: MAX_FILES,
            bytesPerFile: FILE_LIMIT,
            totalSourceBytes: TOTAL_LIMIT,
          },
        }),
      ),
    );
  }
}

module.exports = { Diagnostics, redact, readTail };
