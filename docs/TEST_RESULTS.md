# Verification and known limits

This page records the current verification scope. Release notes and published
packages are on [GitHub Releases](https://github.com/sector-lmu/Sector/releases).
Detailed research notes and raw captures are retained locally, outside Git.

## Version 1.0.0

The Windows 1.0.0 package passed its executable smoke test on 20 October 2026:
version metadata, isolated startup, bundled Python imports, Home, changelog and
overlay previews. No reset listener was started and no live reset was performed.
It retains the tested v28 binaries from 0.2.23; the promotion changes version
metadata and documentation, not native physics behavior. The pending live checks
listed below remain open in 1.0.0.

## Desktop and overlays

The current development changes passed 68 desktop unit tests and the Home UI
test. Simulated EAC discovery immediately blocks checkpoint actions and shows
the Active Reset warning while leaving overlay controls available. The warning
was also visually reviewed.

The 0.2.22 portable package passed its runtime and UI smoke test. UI, overlay,
Home and installation-folder tests covered canceled and invalid folder choices,
persistence across restart, keyboard navigation, layout controls and the fixed
GitHub issue URL. Preview tests use isolated profiles and simulated telemetry;
they do not operate the game.

The 0.2.23 candidate also passed the packaged EXE smoke test with its v28
runtime, bundled Python imports, Home controls, changelog and overlay previews.
The complete Python suite passed 121 tests and the desktop suite passed 68.
Sandbox temporary-directory restrictions required a workspace test directory
for Python and an unsandboxed run of the isolated desktop tests.

The updated SDK reader passed its native self-test and serialization test,
including penalty, finish-status and flag codes. Five read-only incident-reader
tests cover bounded vectors, short reads, changing vehicle ownership and a
temporary UI-endpoint timeout. After a timeout, memory sampling waits until the
offline context is verified again.
These diagnostic additions are included in the 1.0.0 package.

## Active Reset

Sector 1.0.0 retains the v28 native host from the 0.2.23 candidate. Sector 0.2.22
used v27. Both hosts are tied to the pinned Steam 25661166 / app build 14200 profile.
Compatibility checks validate native identities, not just a displayed version
number. Native fixtures operate on owned memory and cannot establish live
physics stability.

Earlier live trials confirmed ordinary and settled-impact resets on the tested
cars. The Mercedes-AMG LMGT3 trial confirmed visible front bodywork repair.
That result does not qualify every model, rear impact or reset during a collision.

On 20 October, Sector 0.2.22 / v27 restored a punctured front-left tire and
deformed suspension on the Peugeot 9X8 at Le Mans. SDK pressure recovered from
zero to about 166 kPa, the flat-tire flag cleared, and native suspension
deformation flags returned to zero. The user confirmed the tire was repaired.
No new penalty or disqualification appeared in the captured trial. This
qualifies the observed puncture case, not wheel detachment.

The subsequent complete wheel-detachment capture preserved the body and
constraint identities and exposed five released suspension BAR constraints.
The v28 candidate reconstructs their checkpoint limits and activation state,
clears the matching native backup entries, and removes the separated wheel from
the collision registries. These changes share lifetime pins and recovery with
the physical/bodywork restore. Preparing the operation remains read-only.

Local coverage includes:

- Eight full-adapter runs: attached and detached restoration, contact failure,
  collision refresh failure and failed recovery.
- Registry planning for active/inactive lists and multiple wheels, partial
  writes, stale plans, lost pins and retained journals after recovery failure.
- Suspension preparation with the five measured BAR lengths, duplicate/missing
  backups, changed configuration, foreign constraints and incomplete detachment.
- Strict healthy-checkpoint validation and separate observation of detached
  rigid bodies. Allowing observation does not allow saving a detached car.
- The native core suite, including synchronization, contact reconstruction,
  bodywork, typed memory and transaction recovery.
- The loaded v28 host in a fixture process: ordinary and empty-bodywork
  restoration, missing-player refusal and two clean host lifetimes.
- Five incident-capture tests and twelve hotkey/error-reporting tests.

The v28 path is limited to the verified independent-hub BAR suspension branch.
An unsupported attachment graph cannot authorize a detached restore; existing
attached-wheel resets retain their validation. The new reader could not be
verified against the live detached car because its player reference was no
longer available. A fresh healthy checkpoint and an in-game trial of v28 are
still required. No successful live reattachment is claimed.

The following remain open:

- Wheel reattachment in v28 needs live validation; older v27 packages still
  reject detached assemblies. Other suspension branches remain unsupported.
- Track-limit penalties reported after F7 are under investigation.
- Puncture restoration on other cars and different damage combinations needs
  further in-game coverage.
- The finish-line sector correction still needs an in-game retest after F7.
- The independent online overlay path has local coverage; live EAC/online
  verification remains pending.

Do not announce these pending checks as completed fixes. For each live test,
record the app/game versions, car, circuit, steps, diagnostic export and the
actual visible result. A successful write count alone is not a successful reset.

## Run the checks

See [Contributing](../CONTRIBUTING.md) for component-specific commands and the
[release guide](RELEASE.md) for packaging and executable smoke tests.
