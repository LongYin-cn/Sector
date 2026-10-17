import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("../../..");
const version = JSON.parse(fs.readFileSync("package.json")).version;
const directory = fs.mkdtempSync(path.join(root, "work/diagnostics-smoke-"));
const destination = path.join(directory, "diagnostics.json");
const packaged = process.argv.includes("--packaged");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  ...(packaged
    ? {
        executablePath: path.join(
          root,
          `releases/Sector-${version}-win-x64/Sector.exe`,
        ),
      }
    : {}),
  args: [...(packaged ? [] : [process.cwd()]), "--preview", "--smoke"],
  env,
});
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await page.getByRole("menuitem", { name: "Export diagnostics" }).click();
  await page.getByRole("dialog", { name: "Export diagnostics" }).waitFor();
  await app.evaluate(({ dialog }) => {
    dialog.showSaveDialog = async () => ({ canceled: true });
    global.sectorTest.publish({
      phase: "error",
      message: "Bodywork layout rejected: part_count",
    });
  });
  await page.getByRole("button", { name: "Save diagnostic file" }).click();
  assert.equal(fs.existsSync(destination), false);
  await app.evaluate(
    ({ dialog }, destination) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: destination,
      });
    },
    path.join(directory, "missing/fail.json"),
  );
  await page.getByRole("button", { name: "Save diagnostic file" }).click();
  await page
    .getByText(
      "Could not export diagnostics. Choose a writable folder and retry.",
    )
    .waitFor();
  await app.evaluate(({ dialog }, destination) => {
    dialog.showSaveDialog = async (owner, options) => {
      if (!owner || options.filters[0].extensions[0] !== "json")
        throw new Error("Invalid save dialog");
      return { canceled: false, filePath: destination };
    };
  }, destination);
  await page.getByRole("button", { name: "Save diagnostic file" }).click();
  await page
    .getByText("Diagnostics saved. Attach the file to your bug report.")
    .waitFor();
  const bundle = JSON.parse(fs.readFileSync(destination));
  assert.equal(bundle.version, version);
  assert.match(JSON.stringify(bundle), /part_count/);
  assert.ok(bundle.files.length);
  assert.equal(
    await app.evaluate(() => global.sectorTest.hasListener()),
    false,
  );
  await app.evaluate(() => global.sectorTest.window().showInactive());
  await page.screenshot({
    path: path.join(root, "work/electron-screenshots/diagnostics-export.png"),
  });
  console.log(
    "PASS diagnostic export: cancel, write failure, file contents, UI confirmation and preview isolation" +
      (packaged ? " (packaged EXE)" : ""),
  );
} finally {
  await app.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
