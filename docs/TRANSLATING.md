# 翻译维护指南

Sector 的界面文案全部走内置的 i18n 层，没有第三方 i18n 依赖。这份文档说明改文案时该动哪里、怎么自检。

## 结构

| 位置 | 作用 |
| --- | --- |
| `tools/i18n/sources/*.json` | **词典源片段**，按模块分文件（`core` / `main` / `pages` / `overlay` / `backend` / `preferences` / `lead`）。译文只在这里改。 |
| `tools/i18n/merge-locales.mjs` | 把片段合并成 `shared/locales/{en,zh-CN}.json`（扁平 key、按 key 排序、校验占位符）。 |
| `tools/i18n/check-keys.mjs` | 扫描源码里的 `t("…")` / `tr("…")` / `messageKey`，报告缺键、占位符不一致、中英相同的可疑条目。 |
| `src/ui/electron/shared/locales/{en,zh-CN}.json` | **生成物，不要手改**。改完片段跑 `npm run i18n` 覆盖。 |
| `src/ui/electron/shared/i18n.cjs` | 运行时：`createT(locale)`、`translateMaybe`、`normalizeLocale`、`forcedLocale`。 |
| `src/ui/electron/renderer/i18n.jsx` | 渲染层：`LocaleProvider` / `useT()` / `useLocale()` / `useFormat()` / `useErrorMessage()`。 |
| `src/ui/electron/shared/changelog.zh.json` | 更新日志的中文版，结构与 `changelog.json` 一一对应。 |

片段里的每条 key 都要有 `en` 和 `zh-CN` 两份，`{}` 占位符两边必须一致，否则合并直接报错退出。

## 改文案的流程

```powershell
cd src/ui/electron
npm run i18n        # 片段 -> shared/locales/*.json
npm run i18n:check  # 缺键 / 占位符 / 可疑自检
npm run build
npm test
```

英文（`en`）是**源语言**：它的值就是改造前的界面原文，所以任何英文 UI 测试的定位器都还成立，改中文时不要动 `en` 分支，除非确实改了英文原文。

## 约定

- 状态、错误一律存 **key**（如 `status.waitingForLmu`、`error.settingsUnreadable`），渲染时才翻译；跨进程（Python → 主进程 → 渲染层）传的是 `message_key` + `message_params`，`message` 字段保留英文规范句作为兜底。
- 需要拼长句的地方用 `{name}` 占位，让中文可以重排语序，不要用字符串拼接。
- 技术名词与缩写保留英文：`EAC`、`F6`/`F7`、`PB`、`VE`、`DELTA`、`km/h`、`°C`、`FL/FR/RL/RR`、级别徽标 `ERROR/WARN/OK/INFO`。
- 中英文之间留一个空格（`LMU 未运行`）。
- 叠加层 widget 里的标签受固定列宽限制（10–12px 字号），中文优先写短（`TRACK LIMITS` → 赛道边界、`CLEAN AVG` → 干净圈均值），不要为了放长文案去加宽列。

## 字体

中文用 `renderer/overlays/fonts/NotoSansSC-Sector.woff2`（约 1.04 MB 的子集，由 `Noto Sans SC` 可变字体裁出 GB2312 一级字 + 词典用字）。它通过**同族名 + CJK unicode-range 别名**挂到 `IBM Plex Sans`（主窗口）、`Barlow Semi Condensed` 与 `JetBrains Mono`（叠加层）上，因此界面与 widget 模板里的 `font-family` 一处都不用改。

新增了很多生僻字（子集里没有）时，重新生成子集即可：把字体源文件与裁剪参数喂给 `fontTools.subset`，产物覆盖同名 woff2。否则这些字会落到系统的宋体上，与整体排版不一致。

## 语言开关

- 默认语言 `zh-CN`，可在「编辑 → 设置 → 语言与地区」实时切换，选择写进 `settings.json` 的 `language` 字段。
- 命令行 `--lang=en` / `--lang=zh-CN` 可强制某一语言；`--smoke`（自动化测试）同样会钉死英文，所以英文 UI 测试无需改动。

## 这套汉化的验证范围

改动在一台没有 LMU 安装、也没有原生工具链的机器上完成，验证到下面这些线为止：

| 项目 | 结果 |
| --- | --- |
| `npm test`（纯逻辑） | 68/68 通过 |
| `test:ui`（Electron / overlay / home 三个套件） | 通过 |
| `test:onboarding` / `test:startup` / `test:diagnostics` | 通过 |
| `test:telemetry` / `test:release` | 跑不了：需要 `bin/overlay-reader.exe` 等原生产物 |
| 中文界面文本审计（三个 tab + 六个弹窗） | 无漏翻、无 pageerror |
| 英文界面回归 | 无中文泄漏 |
| 十个叠加层 widget 截图 | 中文不裁切；英文与改造前逐字节相同 |
| 首次启动 + 八步导览 | 中文文案完整 |

`test:telemetry` 与 `test:release` 阻塞的原因见 `docs/RELEASE.md`：原生组件要用 Zig 0.16 构建，并且需要本地已验证的 LMU SDK、兼容性清单与录制的固件输入 —— 这些都不随仓库分发。要在有这些前置条件的机器上验收，跑 `./scripts/build/Build-ResetDesktop.ps1 -ZigPath <zig.exe>` 之后再执行这两个套件即可，汉化本身不涉及它们。

