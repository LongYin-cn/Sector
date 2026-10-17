# Bodywork checkpoint and synchronization

## Empty models in 0.2.15 / v24

The supplied 0.2.14 diagnostic export identifies `92004`, check `component_count`,
with a stable count of zero across seven save attempts on the Oreca 07. No
physical or graphics writes took place. The export does not contain the user's
damage setting, so it does not establish why LMU selected that representation.

V24 accepts zero deformable components as an explicit empty model. It still
requires a readable player graphics root, a lifetime pin, unchanged generation,
consistent count/pointer reads and valid severity. The native loader can skip
component construction; its clear path can also retain the allocation with
count zero. Sector never reads unused entries in that allocation. Empty models
retain root severity in the transaction but have no vertex buffers to restore.
Nonempty models follow the existing full vertex restoration path.

Changing between empty and populated models, replacing the allocation or
reconstructing the model invalidates the checkpoint before any writes. Negative
counts, invalid pointers and unsupported populated buffers still fail. This is
not a retry that discards a failed graphics capture.

Fuel consumption and tyre wear are state, not capture prerequisites: a zero
fuel rate, unchanged quantity and zero or unchanged tyre wear remain valid.
Sector does not edit session multipliers or enable damage/consumption. Numerical
fixtures cover both consumption switches independently, with fresh and already
worn tyres. Owned-process host tests cover both empty and populated graphics.
These checks do not replace verification of the release on the affected PC.

## Detailed refusal diagnostics in 0.2.14 / v23

This experimental release diagnoses error 92004 without relaxing admission or
changing restore writes. Seventeen named layout checks identify invalid root or
array ranges, component/part/vertex/submesh counts, damage values, replay and
dirty flags, event counts, vertex budget and overlapping restore spans.

The native report adds the check ID, one-based component and mesh indices, mesh
flags, observed value and applicable limit. Zero indices mean no component or
mesh has been selected. The Python acknowledgement adds the stable check name.
Native host v23 appends 48 bytes to the v21/v22 IPC; older resident modules retain
their original layout and require a restart before the new diagnostics apply.

**Help → Export diagnostics** collects recent reports and desktop events in one
JSON file. It includes app/OS/graphics versions and available car/track context,
but excludes memory dumps, raw physics captures and checkpoint payloads. The
desktop event log rotates at 256 KiB, repeated unchanged states are suppressed,
and exports read at most 256 KiB per file, 30 files and 4 MiB of source text.
Truncation and omissions are recorded. Windows user-directory names are masked;
no data is uploaded. Existing native report files are retained in the versioned
runtime workspace.

The later diagnostic export identified the zero-count admission failure
addressed above. Other 92004 layout checks remain distinct failures.

Sector 0.2.9 introduces native host v21. It integrates CPU bodywork buffers with
the existing physical reset transaction for the verified Steam 25661166 profile.
Automated tests pass. The 0.2.10 packaged test also confirms visible front
bodywork repair on the Mercedes-AMG LMGT3 after a settled impact.

## Healthy-save correction in 0.2.10 / v22

The first 0.2.9 live test refused F6 with cause `92006` before any restore writes.
The repaired Oreca had zero damage severity, zero events and four vertex buffers
matching their originals. Submesh flags were `0x7`, `0x7`, `0x5`, `0x5`, `0x5`.
V21 incorrectly rejected any submesh with bit `0x2`, although native repair
clearing that bit does not make it a reliable damage indicator.

V22 removes that specific admission error. Severity, event history, exact
original vertex comparison, topology and lifetime checks still apply. Regression
tests reproduce the old refusal and check healthy flags `0x5`, `0x7` and `0xa2`,
while each actual damage indicator still independently rejects a save.
Both loaded-host and combined-adapter fixtures now start with bit `0x2` set.
The packaged v22 retest accepted the healthy checkpoint and completed five
restores. The two impact restores each verified 118 graphics writes across
seven meshes (6,981,920 vertex bytes), alongside 10,114 physical fields and four
contact rebuilds. No compensation was needed. The capture observed six changed
meshes and a damage event before repair; all seven meshes subsequently matched
their originals and damage severity/events returned to zero. The user confirmed
that the front bodywork also appeared repaired in LMU. This qualifies the tested
Mercedes-AMG LMGT3 case, not every model, rear impact or continuing collision.

## What is captured and restored

A healthy save captures each graphics component's CPU vertex data, mesh topology
and allocation generation. Restore validates the same model and original vertex
buffers, journals the current bytes, restores the saved bytes, clears damage
events and severity, and marks the component for the game's normal render upload.
As in native repair, only bit `0x2` in submesh flags is cleared. Other flags are preserved.

The graphics root is the player owner plus `0x38`, separate from its collision
subobject at plus `0x8`. Native repair copies the component's original vertices
and requests an upload. Sector does not call that repair function on an assumed
thread or treat a cleared damage flag alone as a complete repair.

The damaged Oreca capture contains four CPU meshes. Its 6,408 differing bytes
are at vertex attribute offset 27; this capture does not demonstrate changed
vertex positions. The local replay reproduces and restores those bytes. It does
not establish that LMU subsequently uploads them or renders an intact car.

## Thread and lifetime contract

Physics, scoring and player lifetime are pinned by the existing host. The new
graphics gate additionally observes player model loading, clearing, construction,
destruction, asynchronous part publication, impact updates and native repair.
Ten target prologs are verified before hooks are installed.

Native operations register activity but release the gate while executing. A
loader can therefore wait for another thread's publication job without keeping
the gate locked. Reset takes a nonblocking pin only while no operation is active,
then takes every component critical section with `TryEnterCriticalSection`.
The pin and component locks remain held through physical writes, graphics writes,
contact/collision rebuilding and finalization. New native operations wait for
that brief pin. Reconstruction changes the generation even if addresses repeat.

All graphics spans are preflighted before the first graphics write, checked after
writing, and journaled for compensation. A physical contact or collision failure
also restores the pre-reset graphics bytes. A failed recovery quarantines the
host, suppresses further simulation callbacks and requires an LMU restart.
No automatic retry or partial graphics fallback is used.

## Limits

- Only healthy, fully loaded checkpoints are accepted.
- CPU buffers are supported; the native GPU-mapped buffer flag is rejected.
- Bounds are 32 components, 256 meshes, 4,096 submeshes per mesh and 32 MiB of
  vertex data. Malformed layouts, overlapping spans and changed topology fail
  before writes.
- Punctures and detached assemblies remain unsupported.
- Restoration during a continuing impact and other vehicle models need separate
  live qualification. There is no speed or distance cap in this implementation.

## Source map

| File | Responsibility |
| --- | --- |
| `src/native/restore/bodywork_checkpoint.*` | Graphics capture, validation, journal and rollback |
| `src/native/runtime/graphics_lifetime.*` | Graphics activity tracking and generation pins |
| `src/native/runtime/graphics_lifetime_hooks.cpp` | Typed hooks around native graphics operations |
| `src/native/restore/vehicle_restore_adapter.*` | Combined physical and graphics transaction |
| `src/native/runtime/physical_reset_host.*` | Physics boundary, command dispatch and reports |
| `src/native/runtime/reset_hook_targets.*` | Verified native hook target signatures |
| `src/python/sector/runtime/reset_host_runner.py` | Host admission, commands and acknowledgements |

Descriptive filenames replace numeric suffixes in the active runtime. Actual
Steam build IDs, compatibility hashes and host revisions remain explicit in
profiles and DLL names. Historical observer versions retain their identifiers
because they describe different recording layouts.

## Local verification

`scripts/build/Build-BodyworkRestore.ps1` exercises captured-buffer replay,
partial and silently corrupted writes at every journal span, rollback failure,
pin loss, topology changes, lock contention and asynchronous publication.
`Build-VehicleRestoreAdapter.ps1` checks combined success and contact/collision
compensation. `Build-PhysicalResetHost.ps1` loads the actual host into an owned
fixture process, exercises save/restore, rejects a stale graphics generation
without physical writes, permits a fresh save and tests clean host restart.
`Build-ActiveResetBoundary.ps1` verifies suppression of simulation after a
finalization failure. None of these fixtures opens LMU.

## Packaged live test

1. Quit the previous Sector process completely and restart LMU without EAC.
2. Open Sector 0.2.10. Start a fresh Offline Practice and enter DRIVE with a healthy car.
3. Press F6 once and wait for `Checkpoint saved`. Move a short distance and press
   F7 once. Confirm teleport and stable driving before testing damage.
4. Keep the healthy checkpoint. Produce one front or rear impact without losing
   a wheel. After the impact ends, press F7 once.
5. Check the front and rear visually, suspension, teleport and continued driving.
   Record the result and remain on the same vehicle for inspection.

Stop after a refusal or instability and preserve the exact error message.
The host acknowledgement now logs component/mesh counts, vertex bytes, graphics
result, attempted writes, verified writes and recovery writes alongside the
existing physical report. Causes `92003` and `92007` distinguish an update in
progress from a reconstructed model that requires a new checkpoint.
