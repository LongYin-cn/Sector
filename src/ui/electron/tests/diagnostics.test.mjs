import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Diagnostics, redact } from "../main/diagnostics.cjs";

test("diagnostics retain the rejection, redact user paths and exclude captures", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sector-diagnostics-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const log = new Diagnostics(root, "0.2.14");
  log.record("reset-status", {
    cause: 92004,
    bodywork_check_name: "part_count",
  });
  log.record("reset-status", {
    cause: 92004,
    bodywork_check_name: "part_count",
  });
  assert.equal(fs.readFileSync(log.file, "utf8").trim().split("\n").length, 1);
  fs.writeFileSync(
    path.join(log.directory, "test.reports.jsonl"),
    JSON.stringify({ bodywork_check: 8, bodywork_observed: -1 }) + "\n",
  );
  fs.writeFileSync(
    path.join(log.directory, "test.physical.jsonl"),
    "private capture",
  );
  fs.writeFileSync(
    path.join(log.directory, "test.metadata.json"),
    "private metadata",
  );
  fs.writeFileSync(path.join(log.directory, "game.dmp"), "binary memory");
  const bundle = log.bundle({
    error: "C:\\Users\\Alice\\game",
    token: "secret",
  });
  assert.equal(bundle.context.error, "C:\\Users\\<user>\\game");
  assert.equal(bundle.context.token, "<redacted>");
  assert.deepEqual(bundle.files.map((f) => f.name).sort(), [
    "desktop-diagnostics.jsonl",
    "test.reports.jsonl",
  ]);
  assert.match(JSON.stringify(bundle), /part_count/);
  assert.equal(bundle.experimental, true);
  assert.equal(redact("D:/Users/Alice/game"), "D:/Users/<user>/game");
  assert.equal(redact("D:/Users/Alice Smith/game"), "D:/Users/<user>/game");
  assert.equal(redact("D:/Users/O'Neill/game"), "D:/Users/<user>/game");
});

test("diagnostics rotate, bound exports and survive missing logs", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sector-diagnostics-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const log = new Diagnostics(root, "0.2.14");
  assert.equal(log.bundle().files.length, 0);
  log.record("startup", {});
  fs.writeFileSync(log.file, "x".repeat(300000));
  log.record("reset", { message: "latest" });
  assert.ok(fs.existsSync(log.file + ".previous"));
  log.record("large", { message: "x".repeat(50000) });
  for (const line of fs.readFileSync(log.file, "utf8").trim().split("\n"))
    JSON.parse(line);
  for (let i = 0; i < 40; i++)
    fs.writeFileSync(
      path.join(log.directory, `${i}.reports.jsonl`),
      '{"id":1}\n'.repeat(40000),
    );
  const bundle = log.bundle();
  assert.ok(bundle.files.length <= bundle.limits.maxFiles);
  assert.ok(
    bundle.files.reduce((sum, f) => sum + Buffer.byteLength(f.text), 0) <=
      bundle.limits.totalSourceBytes,
  );
  assert.ok(bundle.files.some((f) => f.truncated));
  assert.ok(bundle.omissions.length);
});
