import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { rcedit } from "rcedit";
import { pruneOldBuilds } from "./release-retention.mjs";

const ui = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(ui, "../../..");
const { version, license } = JSON.parse(
  fs.readFileSync(path.join(ui, "package.json")),
);
const output = path.join(root, "releases", `Sector-${version}-win-x64`);
if (fs.existsSync(output))
  throw new Error(
    `Output already exists: ${output}. Move it before rebuilding.`,
  );
const copy = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, {
    recursive: true,
    filter: (p) => !p.includes("__pycache__"),
  });
};
copy(path.join(ui, "node_modules/electron/dist"), output);
copy(path.join(root, "LICENSE"), path.join(output, "LICENSE-Sector.txt"));
fs.renameSync(
  path.join(output, "electron.exe"),
  path.join(output, "Sector.exe"),
);
fs.rmSync(path.join(output, "resources/default_app.asar"), { force: true });
const app = path.join(output, "resources/app");
for (const name of ["main", "shared", "dist", "THIRD_PARTY_NOTICES.md"])
  copy(path.join(ui, name), path.join(app, name));
fs.writeFileSync(
  path.join(app, "package.json"),
  JSON.stringify({
    name: "sector",
    productName: "Sector",
    version,
    license,
    main: "main/index.cjs",
  }),
);
copy(
  path.join(root, "src/python/sector/desktop/reset_keymap.json"),
  path.join(app, "shared/reset_keymap.json"),
);
copy(path.join(ui, "licenses"), path.join(app, "licenses"));
copy(
  path.join(ui, "renderer/overlays/fonts/LICENSE.txt"),
  path.join(app, "licenses/overlay-fonts.txt"),
);
copy(
  path.join(root, "third_party/minhook/LICENSE.txt"),
  path.join(app, "licenses/minhook.txt"),
);
function copyLicenses(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === ".bin") continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) copyLicenses(file);
    else if (/^(license|copying|notice)(\.|$)/i.test(entry.name))
      copy(
        file,
        path.join(
          app,
          "licenses/npm",
          path.relative(path.join(ui, "node_modules"), file),
        ),
      );
  }
}
copyLicenses(path.join(ui, "node_modules"));
const runtime = path.join(output, "resources/runtime");
for (const name of ["src/python", "assets/sector.ico", "scripts/sector.py"])
  copy(path.join(root, name), path.join(runtime, name));
for (const name of [
  "diagnostic-14200.exe",
  "overlay-reader.exe",
  "lmu-physical-reset-v28-25661166.dll",
])
  copy(path.join(root, "bin", name), path.join(runtime, "bin", name));
fs.mkdirSync(path.join(runtime, "compatibility"), { recursive: true });
for (const name of fs
  .readdirSync(path.join(root, "compatibility"))
  .filter((n) => /^steam-25661166-.*\.json$/.test(n))) {
  const profile = JSON.parse(
    fs
      .readFileSync(path.join(root, "compatibility", name), "utf8")
      .replace(/^\uFEFF/, ""),
  );
  delete profile.install_path;
  delete profile.previous_dll_path;
  fs.writeFileSync(
    path.join(runtime, "compatibility", name),
    JSON.stringify(profile),
  );
}
// Verify the shipped host and reader against the same profiles used at runtime.
const sha = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const telemetry = JSON.parse(
  fs.readFileSync(
    path.join(runtime, "compatibility/steam-25661166-telemetry.json"),
  ),
);
const host = JSON.parse(
  fs.readFileSync(
    path.join(runtime, "compatibility/steam-25661166-physical-reset-v28.json"),
  ),
);
if (
  sha(path.join(runtime, "bin/diagnostic-14200.exe")) !==
    telemetry.diagnostic_sha256.toLowerCase() ||
  sha(path.join(runtime, "bin/lmu-physical-reset-v28-25661166.dll")) !==
    host.dll_sha256.toLowerCase()
)
  throw new Error("Runtime binary/profile mismatch");
const pythonArchive = path.join(
  root,
  "work/release-tools/python-3.13.12-embed-amd64.zip",
);
if (!fs.existsSync(pythonArchive))
  throw new Error(
    `Download the official Python embedded archive to ${pythonArchive}`,
  );
if (
  sha(pythonArchive) !==
  "76f238f606250c87c6beac75dccd35ee99070a13490555936abb6cb64ecce3d0"
)
  throw new Error("Embedded Python archive checksum mismatch");
execFileSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-Command",
    `$env:PSModulePath = (Join-Path $PSHOME 'Modules'); Expand-Archive -LiteralPath '${pythonArchive.replaceAll("'", "''")}' -DestinationPath '${path.join(runtime, "python").replaceAll("'", "''")}'`,
  ],
  { stdio: "inherit" },
);
await rcedit(path.join(output, "Sector.exe"), {
  icon: path.join(root, "assets/sector.ico"),
  "file-version": version,
  "product-version": version,
  "version-string": {
    ProductName: "Sector",
    FileDescription: "Sector",
    CompanyName: "Sector",
    OriginalFilename: "Sector.exe",
  },
  "requested-execution-level": "asInvoker",
});
const manifest = {};
function inventory(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) inventory(file);
    else
      manifest[path.relative(runtime, file).replaceAll("\\", "/")] = sha(file);
  }
}
inventory(runtime);
fs.writeFileSync(
  path.join(runtime, "release-manifest.json"),
  JSON.stringify(manifest, null, 2),
);
fs.writeFileSync(
  path.join(output, "resources/release-id"),
  sha(path.join(runtime, "release-manifest.json")).slice(0, 16),
);
fs.writeFileSync(
  path.join(output, "README.txt"),
  [
    `Sector ${version}`,
    "主动回点和损伤修复都是实验性功能：有 bug 是预期的，后面还会继续修。",
    "包含实验性的车轮重新安装实现，实车验证还没做。",
    "",
    "快速上手",
    "1. 把整个 ZIP 解压，打开 Sector.exe。所有文件请放在一起。",
    "2. 第一次启动时确认你的 Le Mans Ultimate 目录。",
    "3. 在主动回点里选「以无 EAC 方式启动 LMU」，然后在游戏里选 Offline > Practice 并进入 DRIVE。",
    "4. 车况健康时按 F6，等「存档点已保存」出现。按 F7 回到存档点。",
    "5. 在叠加层里启用小组件，用「编辑布局」摆放，然后「锁定布局」。",
    "",
    "叠加层需要窗口化或无边框模式，刷新率跟随选定的那块显示器。",
    "在线叠加层请正常带 EAC 启动 LMU。主动回点仍然只在离线可用。",
    "检测到 EAC 时，Sector 会禁用保存/回点及其快捷键。关掉 LMU，从主动回点里重新打开。",
    "键位和音效在主动回点里改。设置走「编辑 > 设置」。",
    "「帮助 > 快速指南」重看引导，「帮助 > 更新日志」列出各版本的变化。",
    "遇到问题后，用「帮助 > 导出诊断文件 > 保存诊断文件」，把那个 JSON 文件发出来。",
    "升级后请重启 LMU，新的 v28 回点模块才能加载。车况健康时重新存一个存档点。",
    "关窗口时可选在后台运行或退出 Sector。更新前请先彻底退出。",
    "不需要安装 Node.js 或 Python。偏好设置跨版本保留。",
    "",
    "损伤修复是实验性的。车轮重新安装只支持已映射的独立轮毂悬挂。",
    "其它脱落部件和悬挂形式仍不支持。回点之后的赛道边界判罚还在排查。",
    "请在车况健康时保存，撞击结束后再回点。",
    "存档点是否可用取决于当前车辆、车局和支持的 LMU 版本。",
    "",
    "用户指南：https://github.com/sector-lmu/Sector/blob/prod/docs/README.md",
    "下载：https://github.com/sector-lmu/Sector/releases",
    "报告问题：https://github.com/sector-lmu/Sector/issues",
    "",
  ].join("\r\n"),
);
console.log(output);
const retained = (process.env.SECTOR_KEEP_RELEASES || "")
  .split(",")
  .filter((value) => /^\d+\.\d+\.\d+$/.test(value));
for (const name of pruneOldBuilds(path.dirname(output), version, retained))
  console.log(`Removed older build: ${name}`);
