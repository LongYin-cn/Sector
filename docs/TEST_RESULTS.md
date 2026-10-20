# Verification and evidence

This page separates automated checks from live-game observations. Historical
counts and build-specific experiments are preserved in the [research archive](archive/README.md).

## Design B refinements: 0.2.21

- All 68 desktop unit tests passed, including Genesis and GMR-001 name matching.
- Electron UI, all ten overlay widgets and Home preview checks passed. Overlay
  coverage includes live opacity changes, rapid slider input persistence and
  steering wheel marker selection.
- Genesis, Oreca, Ligier and McLaren logos rendered in the leaderboard preview.
- Startup and onboarding checks passed, including reduced motion, skipping the
  animation, returning from the background and installation-folder selection.
- The startup lettering and Edit layout button have contrast regression checks.
  Home, Active Reset, Overlay, Settings and the splash were visually reviewed.
- The portable Sector 0.2.21 executable passed its packaged smoke test, including
  bundled Python imports, app version and overlay rendering.

These are isolated preview tests. Native reset remains v27; this UI update adds
no live-game evidence about puncture repair or lap timing.

## Design B desktop: 0.2.20

The interface now adapts the supplied Design B reference. Native reset remains
v27; this release does not add evidence about the pending live-game puncture or
lap-timing checks.

- All 68 desktop unit tests passed.
- Electron UI tests passed for sidebar mouse/keyboard navigation, key capture,
  confirmation sounds, checkpoint acknowledgements, status-log filters and
  export access, background/reopen, quit, guided tour and reduced motion.
- All ten overlay widgets passed preview tests, including settings, logos,
  column toggles, drag/resize, locking and foreground visibility.
- Home actions, onboarding, cold-start animation and diagnostic export passed
  their isolated preview tests.
- Home, Active Reset, Overlay and Settings were visually reviewed. Compact
  640 x 600 layouts were checked alongside the 1200 x 880 desktop window.
- The portable Sector 0.2.20 executable passed its packaged smoke test,
  including bundled Python imports and overlay rendering.

These checks use isolated preview profiles and simulated session data. They do
not operate LMU or claim a new live-game validation.

## Checkpoint capture and punctures: 0.2.19 / v27

The exported 0.2.18 diagnostics contain 16 failed F6 commands with result 4,
cause 0 and no physical writes, plus one successful F6. Failed captures stopped
before bodywork capture. The export does not identify the internal failed
check, so it cannot prove that every refusal had the same cause.

A local regression reproduced a timing defect: delaying snapshot reads by
150 ms made valid contact samples exceed the 100 ms freshness threshold even
though both native locks kept physics pinned. That regression failed before
the change and passes after it. Freshness is now measured at bind, before the
host diagnostic read and adapter validation. Samples already stale or from the
future at entry, invalid ownership and incorrect identity remain rejected.

Capture failures now publish distinct causes 93001 through 93014. Bodywork
causes retain their existing 920xx details. F6 also clears the prior restore
report, so fields, writes and causes cannot leak from an earlier F7.

Puncture coverage and its static/live evidence are documented in
[Tire puncture restoration](TIRE_PUNCTURE_RESTORE.md). Four-tire repair shares
the physical transaction and compensation paths. The owned-memory adapter
fixture passes normal restore, contact failure, failed compensation quarantine
and collision failure. Its 504-node model verifies all 16,191 planned fields.
A separate 504-node layout verifies 6,076 added fields, selected-node overlap
avoidance, table changes, count bounds and capacity failure without partial
publication. Loaded-host normal, empty-bodywork, missing-player and restart
fixtures pass. All 116 Python checks (including the corrected current-revision
assertion), 68 desktop tests and the isolated packaged EXE smoke check pass.
No game process was modified during these tests.

Live F6/F7, puncture repair and the finish-line timing behavior still need
verification in 0.2.19. A successful local fixture is not a live-game result.

## Sector progression: 0.2.18 / v26

On 19 October 2026, the user tested 0.2.17 with the Porsche 963 in offline
Practice at Sebring. The capture verified the loaded v25 DLL hash and read its
report mapping without writing commands, along with SDK telemetry and bounded
native scoring reads. The local evidence is
`logs/20261019T204454_lap_start_0217/` (not included in Git).

- F6 succeeded before the finish line with zero physical field writes. On the
  next crossing, the lap index advanced from 1 to 2, `lapStart` changed to
  166.5203705 and `countLap` became 2. The user confirmed the timer started.
- The user then pressed F7. The first restore succeeded and changed the current
  validity flags to 1. Telemetry moved from about +303 m to -242 m relative to the
  line. The subsequent crossing from negative to positive distance left the lap
  index at 2 and `lapStart` at 166.5203705. The user confirmed no new timer.
- These samples are asynchronous. The capture did not include the sector gate
  at the instant of F6/F7; it does not alone prove the candidate field's behavior.

Static inspection of the retained, hash-pinned Steam 25661166 code identifies
the missing sector gate. The crossing routine at RVA `0xCEC170` compares
scoring `+0x18` to 2 at `0xCEC45D` before admitting finish-line event 0. Sector
events 1 and 2 require prior values 0 and 1 respectively. The native processing
routine clears the gate at a finish crossing (`0xCE9A86`) and stores the event
number on intermediate crossings (`0xCEB233`). A restore formerly left this
field at its post-save value while moving the car into a different sector.

The v26 adapter captures this bounded integer (0..2), publishes it only with a
successful checkpoint, and restores it in the same typed transaction as the
pose. The shared whitelist and all three admission paths include this field.
The timing invalidation policy remains separate: no lap number, start timestamp,
record or timing eligibility is restored from the checkpoint. Fixture sources
cover sector restoration, compensation and rejection of malformed/duplicate
gates; execution and the live v26 trial are pending.

The v26 native DLL and portable 0.2.18 EXE compiled successfully. No fixture
executables, automated suites or new in-game trial were run for this candidate.
The 0.2.17 read-only capture completed with 2,610 valid scoring samples.

The next manual check requires restarting LMU to unload v25 and opening 0.2.18.
Create a new F6 checkpoint before the line, cross it to start timing, then F7 and
cross again. The interrupted attempt must remain untimed and the new lap must
start. Checkpoints in each intermediate sector also need qualification. This
candidate is not yet a verified in-game fix.

## Lap scoring: 0.2.17 / v25

Before packaging, no automated tests, live captures or in-game trials were run
for this change, at the user's request. The later live result is recorded above.
Updated fixture sources are pending execution. The v25 DLL
and portable 0.2.17 package compiled successfully. The native build omitted
`FrameDirectory`, so it compiled fixture binaries without executing them; the
desktop build ran `npm run release`, with no test or app-launch command.
Compilation alone does not validate native lap timing or finish-line behavior.

Code inspection found that F7 wrote zero to all three scoring flags, suppressing
both counting and timing. The replacement policy preserves native no-count states
and downgrades counted attempts to flag 1, with matching remembered and computed
caches. All three transaction admission paths validate the complete triplet
against the same policy, including refusal of mixed caches or revived timing.
Offsets and the optional failure-latch policy are unchanged. F6 does not call the
scoring writer. Its reported effect on first-lap timing remains unconfirmed.

The flag meanings are documented by the local LMU SDK's `mCountLapFlag` and the
count/next-lap branches recorded in `steam-25661166-scoring-research.json`.
There is no new guessed lap-start offset or asynchronous telemetry gate.

Deferred manual procedure, using the Porsche 963 at Le Mans:

1. Quit Sector and restart LMU to remove the earlier native module, then use the
   new build in offline Practice without EAC, with a fresh session.
2. Save before the timing line with F6 only. Cross it without F7 and confirm the
   clock starts. If it does not, export diagnostics before any further reset;
   that isolates the save-only report from the changed F7 policy.
3. In another fresh session, save and restore before the first timing-line
   crossing, then cross normally. Confirm the first timed lap starts.
4. With a pre-line checkpoint, start a timed lap, let the clock advance, then
   press F7. The interrupted attempt must not set a last or best time. Cross the
   line again and confirm the next attempt starts normally.
5. Repeat F7 from a checkpoint within a timed lap, including an off-track state.
   Existing next-lap penalties must remain, and leaving the off-track area must
   not revive timing on the interrupted attempt.

The Sebring save-only step subsequently passed; the restore/re-crossing step
failed. The original Le Mans scenario and the other steps remain unverified.

## Active Reset launch and EAC status: 0.2.16

The launch button now lives in Active Reset and opens the selected game
executable directly. Guide explains offline launch, EAC blocking and online
overlay use. The native reset module remains v24.

All 66 desktop model tests and 115 Python tests pass. New cases verify EAC
blocking before admission even with an unreadable game path, rejection of both
desktop commands, cooperative listener stop after late detection, removal of
a queued command, protection against stale status overwrites and recovery after
the game restarts. Native EAC-module refusals also retain the explicit block.

Electron tests pass for all eight Guide steps, compact layout, shortcut editing,
Home actions and widgets. The EAC preview verifies the banner and disabled
Save/Restore while overlay controls remain enabled. The portable 0.2.16 EXE
passes isolated startup, bundled runtime imports and UI/overlay smoke tests.
These tests do not launch LMU or reproduce a live EAC session.

## Empty bodywork and consumption modes: 0.2.15 / v24

The bodywork fixture now accepts empty models with either null or retained
component allocations, without reading unused components or writing clean
graphics. It verifies root-severity restoration and rollback, pin loss,
generation changes, count changes during capture, and transitions between empty
and populated models. Existing populated-model repair and 70 write-fault cases
still pass, as do graphics lifetime tests.

The loaded v24 host completes save/prepare/restore with both empty and populated
bodywork, verifying all 10,114 physical fields and four contact rebuilds. The
empty case uses a zero fuel consumption rate and performs no graphics writes.
Both cases reject malformed counts and stale model generations before writing.
Absent-player rejection, same-process host restart and the combined adapter's
normal, recovery and quarantine cases pass.

Eight numerical cases cover the independent fuel-consumption and tyre-wear
switches with fresh or previously worn tyres. Both persistent tyre cache
validation and mechanical restoration accept zero/unchanged wear. Saved fuel
quantity/rate, mass, inertia and velocity are preserved. No session settings
are written. All 115 Python and 63 desktop model tests pass. The packaged EXE
passes isolated startup, bundled Python imports and UI/overlay checks. Diagnostic
export passes cancellation, write-failure, JSON contents and confirmation tests
against the packaged application.

On 18 October 2026, the user confirmed that 0.2.15 also works on the affected
PC. This confirms that reported failure, not every car/settings combination. The
diagnostic report established the zero-count rejection but did not include the
user's damage multiplier. These fixtures do not establish that every car,
damage setting or LMU configuration has been tested in game.

## Experimental diagnostic release: 0.2.14 / v23

The bodywork fixture exercises all seventeen named layout refusals without
writing game state, in addition to existing restore and rollback cases. The
loaded v23 host fixture reproduces a negative part count and verifies cause
92004, check ID 8, component/mesh indices and signed observed/limit values across
the native IPC. It also passes normal restore, absent-player refusal and restart
in an owned process. No live game is opened by these tests.

All 115 Python tests and 63 desktop model tests pass. Coverage includes the
328/384/432-byte IPC versions, detailed acknowledgement decoding, log rotation,
duplicate suppression, export limits, user-path masking and capture exclusion.
Electron tests cover the updated Help menu, export cancellation, write failure,
successful JSON contents and UI confirmation, plus existing Home and widget
behavior. The packaged EXE passes isolated startup and the same diagnostic
export scenarios, including cancellation and unwritable destinations. Live
diagnosis was pending at release time; the subsequent export and correction
are described in the 0.2.15 section above.

## First-run setup and online overlay discovery: 0.2.13

All 61 desktop model tests pass. New cases cover protected-process discovery,
EAC and online reset rejection, a later switch to offline Practice, shutdown
during admission, and standings with scoring-only opponent data. Native reader
self-tests pass after removing the game process handle.

Source and packaged onboarding tests verify Escape and outside-click dismissal
are blocked, a native directory picker is requested with the owning window,
cancel and invalid folders leave setup incomplete, and a valid folder enables
the optional tour. The packaged EXE passes isolated startup, bundled Python
imports and widget checks. These checks never attach a reset module to LMU.
The full Electron UI suite passes, including tray reopening, all ten widgets,
layout persistence and Home actions. Native SDK serialization into the wheel,
stint, hybrid and leaderboard models also passes. The first UI run timed out
because the source launcher tried to reinstall dependencies while Electron was
open after the version change; installing the lockfile before launching tests
resolved the development-environment failure.

### Remaining live check

1. Quit the previous Sector instance completely and open 0.2.13.
2. Launch LMU normally through Steam with EAC and join an online session.
3. Use windowed or borderless mode, enable overlays and enter DRIVE.
4. Check changing Inputs and lap values, standings and Relative gaps. Some
   opponent resource readings can remain unavailable in the public SDK.
5. Confirm Active Reset stays unavailable; do not use F6/F7 for this check.
6. Switch away from LMU and return, then leave the session and rejoin. Check
   widget visibility and reconnection.

The user deferred this live check. EAC-enabled online operation is not yet
verified on the running game.

## Display synchronization and visibility: 0.2.12

The reader timer measured 143.99 Hz at a 144 Hz target and 59.93 Hz at a 59.94 Hz
target. Native self-tests cover fragmented display-rate commands and pause
serialization. All 56 desktop model tests and 114 Python tests pass, including
fast pause expiry, independent scoring timeout and bounded reset continuity.
The Electron widget smoke checks zero native hide events during the simulated
F7 handoff, pause/resume visibility and a selected display at 143.856 Hz.
SDK serialization and isolated startup of the packaged 0.2.12 EXE also pass.
Live pause/F7 visibility still needs observation in LMU.

## Overlay refresh: 0.2.11

The reader's 120-deadline test measured 59.99 Hz. The short paused-game SDK check
measured 59.20 output frames per second; it did not validate changing gaps while
driving. Native projection checks, SDK serialization through the widget models,
all 50 desktop model tests, the ten-widget UI smoke and packaged EXE smoke pass.
The gap estimates and their limits are described in
[Overlay telemetry](OVERLAY_TELEMETRY.md).

## Healthy-save regression: 0.2.10 / v22

The 0.2.9 live capture recorded cause `92006` for healthy-save attempts without
any restore writes. Damage severity and events were zero, all four CPU vertex
buffers matched their originals, but the first two submeshes had flags `0x7`.
The old admission treated bit `0x2` as proof of damage. The new regression fails
against v21 at healthy capture, and v22 removes that incorrect classification.
Healthy flags are tested independently of severity, events and vertex changes.
The corrected graphics fixture, combined adapter, loaded host and 113 Python
tests pass. The packaged 0.2.10 EXE passes isolated startup and embedded-runtime
checks. The read-only incident capture recorded 5,748 samples and no game writes.
The packaged retest succeeded on the Mercedes-AMG LMGT3. The recorder collected
4,294 samples over 228.625 seconds, without issuing commands or process writes.
The user initiated one save and five successful restores. Two impact restores
each verified 118 graphics writes, seven meshes and 6,981,920 vertex bytes,
alongside 10,114 physical fields and four contacts, without compensation.
Before repair, six meshes differed from their originals and a damage event was
present. After repair, all seven matched, with zero severity and events. The
user confirmed that the front bodywork was visibly repaired. This is evidence
for that vehicle and impact case; rear impacts and other models remain untested.

## Bodywork integration: 0.2.9 / v21

- Graphics fixture: 35 journal spans and 70 partial/corrupt write fault cases,
  including compensation, failed recovery, topology changes and lock contention.
- Captured CPU-buffer replay: 2,889,128 bytes and 6,408 differing bytes restored.
- Real-thread graphics lifetime tests: asynchronous publication, busy admission,
  pin ownership, nested operations and generation changes.
- Combined adapter: successful physical and graphics restore, contact failure,
  collision rebuild failure and fatal recovery handling.
- Loaded host: save/restore, graphics reconstruction refusal before writes,
  fresh checkpoint after reconstruction, missing player and clean restart.
- Boundary finalization failure suppresses both current and future simulation.
- 113 Python tests and 46 desktop model tests pass.
- The complete native core suite passes, including real hook/fence fixtures.
- Packaged 0.2.9 passes isolated EXE startup, embedded Python imports, UI and
  overlay checks without connecting to LMU.

These checks use owned memory and isolated processes. The v22 packaged retest
above adds live front-bodywork evidence. For additional vehicle cases, follow the
[bodywork test procedure](BODYWORK_RESTORE.md#packaged-live-test).

## Aerodynamic recovery: 0.2.8 live result

Recording `20261017T160130779569Z_physical_reset_host_v20` includes successful
ordinary and impact restores. The impact reports verified 10,114 physical fields,
four contacts and all 17 saved aerodynamic fields, without compensation. The
user still observed front and rear bodywork damage. This confirms the recorded
aerodynamic values, not visual repair or every possible impact condition.

## Paused startup: 0.2.8

The first 0.2.7 connection attempt returned native status/error `4/112` before
any save, restore or physical write. LMU reported `MultiStintState=PAUSED`
while `inControlOfVehicle=true` and `inMonitor=false`; SDK simulation time
remained unchanged. The native owner-discovery timeout expired, and the
shutdown summary confirmed every original hook target was restored.

The launcher now requires `MultiStintState=DRIVING` before loading the host.
Its two-sample admission restarts when pause or missing state interrupts the
sequence. The regression reproduces that sequence, and all 110 Python tests
pass. Native v20 was unchanged. At that point aerodynamic recovery still awaited
a live test; the subsequent successful recording is described above.

## Impact recovery: 0.2.6 live result and 0.2.7 candidate

The Oreca 07 / Monza 0.2.6 trial passed ordinary and settled-impact reset:
the user confirmed teleport, stable simulation and repaired suspension. The
front bodywork remained visibly damaged. Report 15 verified 10,097 writes and
four contacts; the measured hinge axes returned to their saved directions.
This does not yet verify reset during a continuing collision.

The native repair comparison found seven aerodynamic coefficients left damaged
by F7. Their repaired values and ten dependent caches are now included in v20.
The local fixture verifies all 10,114 fields on success and compensation after
contact/collision faults. It rejects damaged replacement saves, inconsistent
caches, nonfinite configuration and changed setup while preserving the previous
checkpoint. Loaded-host save/restore, missing-player refusal and restart pass.
All 109 Python tests, 46 desktop model tests and the isolated packaged 0.2.7
executable smoke test pass.
At the 0.2.7 checkpoint the aerodynamic change had not run in LMU and visual
mesh repair was unimplemented. The subsequent v20/v21 results are recorded above. The native-repair recording crossed a vehicle lifetime change
and cannot establish the graphical repair sequence on an unchanged generation.

The 0.2.4 impact capture reproduced a refusal at the wheel damage flags. SDK
samples distinguished attached deformation, puncture and wheel detachment.
The capture was read-only; the user was still running 0.2.4 during that test.

The 0.2.5 / v18 update passes:

- Analytical wheel deformation tests: independent quarter-turn rotation and
  world angular velocity expectations, invalid rotation data and detached-state
  refusal. Healthy checkpoint validation remains strict.
- Complete adapter restore with the measured front-right deformation vector,
  damage flag, saved constraint state and failure latch. Contact/rebuild faults
  verify compensation of all 10,093 fields; failed compensation quarantines.
- Loaded native host save/restore, missing-player refusal and clean restart.
- 109 Python tests and 46 desktop model tests.
- Packaged 0.2.5 executable startup, embedded Python imports, UI and overlays
  in an isolated preview smoke test.

**The packaged 0.2.5 impact test failed.** Two restore commands on the Alpine
A424 wrote and verified all 10,131 planned fields, but the second, requested
during an impact, was followed by a game crash (`0xC0000005`). The user saw
suspension recovery while the front bodywork remained damaged. The physical
trace shows front-left tire divergence beginning inside the first resumed
Dynamics call. The dump records a tire lookup fault at executable RVA
`EF394D`; it does not by itself establish which missing state caused divergence.

Offline analysis then found a concrete omission: native suspension damage
updates PureHinge's body-B reference axis at `+0x68`, while the restore plan
only restored the angular row basis at `+0xA8/+0x150`. Version 0.2.6 / v19
includes the two reference axes at `+0x50/+0x68` in capture, preflight, restore,
readback and compensation. The snapshot file ABI is unchanged.

The adapter fixture now changes the body-B axis independently of the restored
row basis, verifies its corrected alignment, and checks compensation after
contact/collision failures. The recorded fixture has four hinges and 10,097
planned fields. Zero-length and nonfinite axes reject a replacement save while
preserving the previous checkpoint. The subsequent live result is recorded above.
Visible bodywork, detached suspension and puncture repair remain incomplete.

V19 also passes loaded-host save/restore, missing-player admission refusal and
two successive clean host lifetimes. All 109 Python tests, 46 desktop model
tests and the isolated packaged 0.2.6 smoke test pass.

See [impact investigation](IMPACT_RESET_INCIDENT.md) for evidence and the next
test procedure. Do not use 0.2.5 to repeat the impact test.

## Live check: 17 October 2026

Packaged 0.2.4 and native v17 connected in offline Practice without the earlier
resident-identity errors. The BMW M Hybrid V8 at Monza Curva Grande completed
two saves and eight restores, with every command successful. Each restore
verified 10,123 fields and rebuilt four contacts without compensation. The
800-record trace contains no gaps or nonfinite body values; saved and applied
pose, velocity and angular momentum match on all five traced bodies.

Changing to an Oreca 07 in the same game process also passed re-admission with
stopped v17 modules resident. The first five P2 restores succeeded with 10,085
verified fields, four contacts and no compensation. This checks the two different
vehicle plan sizes and live resident-module reuse checks.

SDK data contained 37 cars, including eleven P2 and fifteen GT3 entries. Every
entry resolved to a manufacturer logo through the production model. The user
confirmed the combined save/restore and logo test. This is one live session,
not qualification of all cars, impact recovery or long-session logo continuity.
See [physical reset status](PHYSICAL_RESET_STATUS.md) for the recording reference.

## Automated coverage

The 0.2.4 update passed 46 Node tests and the native SDK serialization check.
Regressions cover cached per-car identity during missing telemetry, invalidation
on car/session changes and removal of Brake lock from existing saved layouts.
Tyre flat-spot coverage remains active. The desktop and ten-widget Electron
smoke checks passed, along with Home and the packaged 0.2.4 EXE. Documentation
screenshots were regenerated for the ten remaining widgets. The live check above
adds in-session evidence; longer-session logo continuity remains to be qualified.

The latest reported unknown-v17 error came from the 0.2.2 runtime logs, not the
0.2.3 supervisor. The 0.2.3 runtime had no reset logs. Launching a new executable
while an older instance owns the desktop lock previously reopened that older
instance silently; 0.2.4 adds an explicit notice to quit it before changing versions.

The 0.2.3 update passed 108 Python tests and 49 Node tests. New regressions cover
current and previous-release resident identity, changed DLLs/profiles/manifests,
unrecognized paths, active or failed modules, v17 IPC and restored hook targets.
Logo tests cover team-only names, per-car models, vehicle filenames and missing
opponent identity. The native SDK fixture also checks stale and duplicate model
associations. Native SDK serialization, Electron desktop/overlay/Home suites and
the packaged 0.2.3 EXE smoke test passed. The mixed-class leaderboard screenshot
also confirms visible Oreca, Ligier and McLaren logos with team-only names.
Live reset reconnection and in-session logos still need validation.

The 0.2.2 update passed 48 Node tests, 100 Python tests and the native host's
save/prepare/restore, callback-refusal and restart fixtures. Native PREPARE now
performs complete read-only preflight and reports its verified field count.
Python regressions cover different vehicle plan sizes, partial or absent
verification, failure replies, stale identity and duplicate acknowledgements.
Desktop, overlay and Home smoke suites passed with the new pedal-limit model.
The packaged 0.2.2 EXE passed isolated startup, bundled Python imports, UI and
overlay smoke checks.
Live V17 recovery and threshold accuracy still require in-game validation.

| Area | Entry point | What it verifies |
| --- | --- | --- |
| Native core | `scripts/test/Test-Core.ps1` | State mathematics, restore plans, transaction/rollback and coordination fixtures |
| Native host | `scripts/build/Build-PhysicalResetHost.ps1` | Native plan verification, contacts, collision reconstruction, callback refusal and restart cases |
| Python | `python scripts/sector.py test` | Supervision, acknowledgements, key behavior, lifecycle, analysis and source layout |
| Desktop/controller | `npm test` in `src/ui/electron` | Settings, discovery, runtime ownership and overlay models |
| Desktop/widgets | `npm run test:ui` | Real Electron interactions in isolated preview, including all ten widgets |
| SDK/widget integration | `npm run test:telemetry` | Compiled native reader's synthetic SDK frame through production wheel and stint models |
| Onboarding | `npm run test:onboarding` | Automatic/manual selection, invalid/canceled paths, tutorial choices and persistence |
| Startup | `npm run test:startup` | SVG drawing, automatic exit, click/key skip, reduced motion and no replay on background restore or reload |
| Portable package | `npm run test:release` | Actual EXE in preview, version, bundled Python imports, UI and no active reset listener |

The 0.2.1 update passed 46 Node unit tests, 98 Python tests, desktop, overlay,
Home and packaged EXE smoke checks, formatting and the renderer build. Native adapter
fixtures verify restoration of failure code 4 and preservation of that code
during compensation. Host fixtures verify the full plan, missing callbacks and
restart. The restore-flow fixture also rejects stale/unknown failure values,
duplicate latch fields and attempts to restore a nonzero failure. Live impact
recovery remains unqualified. Overlay smoke checks cover geometry synchronization
during a drag, class badges and manufacturer logos for all four classes.

The 0.2.0 Home update passed desktop, Home, overlay, onboarding and packaged EXE
smoke checks. Startup-specific coverage last passed with 0.1.10.
The unchanged native SDK reader last passed its self-test and
serialization fixture with 0.1.9. These are recorded development results, not an
automatically updated CI status.

Desktop reset fixtures cover single-use requests, duplicate/busy rejection,
host identity, expiry, shutdown and native acknowledgement correlation. Home
checks verify that overlay toggles preserve other buttons, clicks do not open
key capture, and every release is accessible in Help > Changelog. The new
desktop click path has not yet been exercised in a live LMU session.

Deployment-map fixtures cover LMH and LMDh model recognition, both SDK encodings,
range boundaries, valid recommendation steps, unknown vehicles and clearing
learning after a vehicle change. Electron verifies the compact map row without
step indicators. This update has not yet been validated in a live LMU session.

New fixtures cover old-layout migration, per-wheel brake-lock detection, tyre
temperatures and replacement, measured fuel/energy consumption, lap reserves,
missing data and reset acknowledgements. Flat spot fixtures exercise sustained
locks, sensitivity, rotation, load, off-road/airborne wheels, short spikes,
duplicate timestamps, missing frames and history reset. Additional fixtures cover
speed/slip-angle/pedal-based lock forecasting, player placement in every class,
per-car resources, hybrid power/state, clean-lap learning and map recommendations.
Electron checks all eleven widget windows, visibility switches, shrinking geometry,
adjustable flat spot sensitivity and a Hypercar player inside the Hypercar section.
Screenshots use sample data. Flat spot and lock-prediction thresholds still require
live-game calibration; these tests do not establish real damage-detection accuracy.

The native v15 fixtures include a 1,000-metre displacement with changed heading
and saved/current velocities of 80/-100 m/s, all 10,084 fields, four contacts,
missing-callback refusal and consecutive host instances. They model native
collision helpers on owned memory; they cannot prove game behavior by themselves.

## Live reset evidence

On 16 October 2026, seven v15 restores succeeded in the captured LMU session.
All fields verified, four contacts were rebuilt per reset and no compensation
ran. The current speed reached 242.61 km/h, with distances up to 797.36 metres
from the saved point. The user confirmed successful teleports, including turns.

The 20 recorded Dynamics steps after each restore showed no recurrence of the
immediate collision jump. This is a short post-restore observation window, not
proof of universal or long-session stability. See [current status](PHYSICAL_RESET_STATUS.md)
and the full [collision investigation](HIGH_SPEED_RESET_INCIDENT.md).

## What still needs live testing

Broader cars/tracks, repeated long-session restores, lifecycle changes, lap
validity and damage behavior remain to be qualified. The complete desktop and
overlay workflow also needs in-game testing; sample widgets and preview gating
checks are not evidence of a working HUD on every display configuration.

Follow the [manual test procedure](TEST_RESET_COLLISIONI.md). Retain rejected
commands, failures and trace gaps in reports. Native field equality, a success
sound and an unchanged process exit code each answer different questions; none
alone establishes stable vehicle motion.
