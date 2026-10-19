import test from "node:test";
import assert from "node:assert/strict";
import { obsoleteArtifacts } from "../build/release-retention.mjs";

test("honors an explicitly retained build without selecting unrelated paths", () => {
  assert.deepEqual(
    obsoleteArtifacts(
      [
        "Sector-0.2.19-win-x64",
        "Sector-0.2.18-win-x64",
        "Sector-0.2.17-win-x64",
        "Sector-0.2.17-win-x64.zip",
        "Sector-0.2.17-win-x64.zip.sha256",
        "Sector-0.2.15-SHA256SUMS.txt",
        "Sector-0.2.18-win-x64.zip",
        "Sector-0.2.20-win-x64",
        "SHA256SUMS.txt",
        "backup",
        "../Sector-0.2.16-win-x64",
        "Sector-0.2.16-win-x64-custom",
      ],
      "0.2.19",
      ["0.2.18"],
    ),
    [
      "Sector-0.2.17-win-x64",
      "Sector-0.2.17-win-x64.zip",
      "Sector-0.2.17-win-x64.zip.sha256",
      "Sector-0.2.15-SHA256SUMS.txt",
    ],
  );
});

test("removes previous versions by default and compares version numbers numerically", () => {
  assert.deepEqual(
    obsoleteArtifacts(
      [
        "Sector-0.2.9-win-x64",
        "Sector-0.2.10-win-x64",
        "Sector-0.2.11-win-x64",
      ],
      "0.2.11",
    ),
    ["Sector-0.2.9-win-x64", "Sector-0.2.10-win-x64"],
  );
  assert.deepEqual(obsoleteArtifacts(["Sector-0.2.18-win-x64"], "0.2.19"), [
    "Sector-0.2.18-win-x64",
  ]);
});
