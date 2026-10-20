# Building a Windows release

Read the development version from `src/ui/electron/package.json`; published
packages are listed on [GitHub Releases](https://github.com/sector-lmu/Sector/releases).
A portable package starts with
`Sector.exe`; keep its adjacent DLLs and resources together. It bundles Electron,
CPython 3.13.12, the telemetry reader/diagnostic and the current reset host.
The package is unsigned and does not require installed Node.js or Python.

## Prerequisites

| Requirement | Purpose |
| --- | --- |
| Windows x64 and PowerShell 7 | Native builds, launcher and packaging |
| Node.js 22.12+ with npm | Electron dependencies, UI build and release script |
| Python 3.11+ for source tooling | Python tests, captures and replay |
| Zig 0.16.0 | Native component builds |
| Locally verified LMU SDK, profiles and recorded fixture inputs | Exact native layout and compatibility verification |
| Pinned embedded Python archive | Bundled portable runtime |

The repository does not distribute game binaries, proprietary SDK headers,
decompiled code or local compatibility manifests. A fresh clone can build a UI
preview after installing its dependencies, but cannot reproduce the native release
without these separately prepared prerequisites. A matching app version string
does not replace the pinned compatibility checks.

## Build procedure

1. Close Sector and LMU before rebuilding native outputs. Never replace a DLL
   still resident in the game.
2. On the configured development machine, run:

   ```powershell
   ./scripts/build/Build-ResetDesktop.ps1 -ZigPath 'C:\tools\zig\zig.exe'
   ```

   This builds the desktop backend, overlay reader and renderer and runs their
   configured checks. The recorded host fixture inputs must be available locally.
3. Place the official [CPython 3.13.12 embedded x64 archive](https://www.python.org/ftp/python/3.13.12/python-3.13.12-embed-amd64.zip)
   at `work/release-tools/python-3.13.12-embed-amd64.zip`. The packager verifies its
   pinned SHA-256.
4. From `src/ui/electron`, run:

   ```powershell
   npm ci
   node node_modules/electron/install.js
   npm run release
   npm run test:release
   ```

The output is `releases/Sector-<version>-win-x64/`. The builder refuses an existing
destination; preserve or deliberately remove a previous output before rebuilding.
Generated releases are ignored by Git. Building or committing a version does not
publish a GitHub release or promote `prod`.

## Publish an approved release

1. Finish the changes on `dev`, including the README and version history. Run
   the applicable tests, build the portable package and test the packaged EXE.
2. Preserve an earlier local package before rebuilding the same version. Never
   move or overwrite a package that is currently running.
3. Check that the package contains no logs, captures, caches or local installation
   paths. Include its complete runtime, notices and quick-start instructions.
4. ZIP the complete `Sector-<version>-win-x64` folder and generate `SHA256SUMS.txt`.
   Reopen the archive and verify its contents before uploading.
5. For an experimental release, push `dev` and tag the tested commit `v<version>`.
   Leave `prod` unchanged. A stable promotion requires explicit approval to
   merge `dev` into `prod`; never force-update published tags.
6. Create the GitHub prerelease with notes, the Windows ZIP and checksum file.
   Do not mark an experimental build as the latest stable release.
   Verify its published assets and target commit. Binaries belong in release
   assets, not Git history.

Keep evidence precise: automated fixtures do not establish live-game behavior.
Record the tested car, circuit and scenario; one successful repair does not
establish that every model or impact is supported.

## Package contents and validation

Packaging uses Electron's [manual distribution layout](https://www.electronjs.org/docs/latest/tutorial/application-distribution)
and Python's [embedded distribution](https://docs.python.org/3/using/windows.html#the-embeddable-package).
The EXE receives the Sector icon and package version. Native hashes must match
the included sanitized compatibility profiles. SDK headers, captures and local
installation paths are excluded.

The package includes `LICENSE-Sector.txt` alongside Electron's original `LICENSE`
and Chromium notices. Dependency and font notices are retained under
`resources/app/licenses/`, with `THIRD_PARTY_NOTICES.md` in the application payload.
The root [MIT license](../LICENSE) applies to original Sector code/documentation;
it does not replace third-party terms.

`npm run test:release` launches the actual EXE in isolated preview and checks
the version, UI, overlays, bundled Python imports and absence of a reset listener.
It does not perform a live reset. For first-run changes, also run
`npm run test:onboarding`; `node tests/onboarding-smoke.mjs --packaged` repeats
onboarding checks against the built EXE. See [test coverage](TEST_RESULTS.md).

## Runtime files and user preferences

On packaged startup, runtime resources are copied into Electron's user-data
directory under `runtime/<version>-<content-id>/`. Native logs and IPC files live
inside that writable workspace. Content-specific directories prevent replacement
of modules that might still be loaded.

Preferences remain in `%LOCALAPPDATA%/LMUActiveReset/`: `settings.json`,
`overlays.json` and `onboarding.json`. Installation selection and onboarding
completion survive a runtime upgrade. First-run detection and manual selection
are described in the [user guide](README.md).

## Branch policy

Commit completed development parts to `dev`. `prod` is the default branch and
changes only on explicit approval to promote a release. Version changes must keep
the Electron package/lockfile and current user documentation consistent.
