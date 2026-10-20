# Verification and known limits

This page records the current verification scope. Release notes and published
packages are on [GitHub Releases](https://github.com/sector-lmu/Sector/releases).
Detailed research notes and raw captures are retained locally, outside Git.

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

The updated SDK reader passed its native self-test and serialization test,
including penalty, finish-status and flag codes. Four read-only incident-reader
tests cover bounded vectors, short reads and changing vehicle ownership.
These diagnostic additions are source changes, not a newly published package.

## Active Reset

The native host remains v27, tied to the pinned Steam 25661166 / app build 14200
profile. Compatibility checks validate native identities, not just a displayed
version number. Native fixtures operate on owned memory and cannot establish
live physics stability.

Earlier live trials confirmed ordinary and settled-impact resets on the tested
cars. The Mercedes-AMG LMGT3 trial confirmed visible front bodywork repair.
That result does not qualify every model, rear impact or reset during a collision.

The following remain open:

- Wheel reattachment is not implemented; detached assemblies are still rejected.
- Track-limit penalties reported after F7 are under investigation.
- Puncture restoration has fixture coverage but still needs an in-game trial.
- The finish-line sector correction still needs an in-game retest after F7.
- The independent online overlay path has local coverage; live EAC/online
  verification remains pending.

Do not announce these pending checks as completed fixes. For each live test,
record the app/game versions, car, circuit, steps, diagnostic export and the
actual visible result. A successful write count alone is not a successful reset.

## Run the checks

See [Contributing](../CONTRIBUTING.md) for component-specific commands and the
[release guide](RELEASE.md) for packaging and executable smoke tests.
