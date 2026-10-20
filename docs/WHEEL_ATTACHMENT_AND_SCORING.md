# Wheel attachment and reset penalties

Status on 20 October 2026: investigation and capture tooling, not a completed
repair. The shipped reset host remains v27. Detached wheels are still rejected.
The EAC banner and diagnostic changes do not change physical restoration.

## Wheel detachment

The reader rejects wheel `+0x301` before preparing a restore. Removing that
check alone would leave the detached assembly's constraint state inconsistent
with the saved pose. The existing attached-wheel projection check would also
be invalid for a detached assembly.

Static analysis of the locally captured Steam 25661166 executable identifies
the following paths. These are executable RVAs, not portable API addresses.

| Routine | Observed behavior |
| --- | --- |
| `EEB800` | Sets attachment state for one wheel; calls the constraint backup or restoration helper, updates body state and suspension deformation, then updates the tire model. |
| `ECFA80` | Appends a 56-byte backup containing a constraint pointer and six scalar parameters, then changes those parameters through the native virtual setter. |
| `ECF930` | Restores the six parameters from that backup, replaces the consumed entry with the last entry, and shortens the vector. |
| `ECF1F0` | Restores suspension deformation from the native baseline and refreshes dependent alignment. |

The backup vector is at physics `+0x2640/+0x2648/+0x2650`. Its entries contain a
pointer followed by six doubles. Getter slot `+0x98` and setter slot `+0x88`
operate on parameter numbers `0x17` through `0x1c`. The native service path
calls `EEB800` with the attachment argument cleared.

This establishes more than a flag change, but it does not establish that
calling the service routine during Sector's transaction is safe. The routine
also changes body pose, velocity, spin and tire state. Graphics component
reattachment has a separate native path. A successful physical call would not
by itself prove that the visible wheel is restored.

Before integration, capture an attached state, a detached state and a native
repair where possible. Confirm:

1. Which body, hub and constraint identities survive detachment on the tested car.
2. Which backup records belong to each wheel and how native repair consumes them.
3. Which graphics components change attachment state.
4. How a failed repair can restore all affected fields and vector contents.

`HOST_PREPARE` must remain read-only. Do not invoke a native repair during
preflight and treat an attempted undo as equivalent to a read-only check.

## Penalties after F7

The current policy invalidates the interrupted counted attempt while preserving
native no-count states, the next-lap restriction, lap number, start time and
records. The saved sector gate is restored with the pose. It does not reset
outstanding penalties.

The user reports a red indication and track-limit penalties after resets.
That description alone does not distinguish an invalid lap, a penalty,
disqualification or a session flag. Diagnostic events now preserve the SDK
codes independently:

- Session game phase and yellow-flag state.
- Player outstanding penalties, finish status and flag.
- Count-lap flag, track-limit steps and lap-invalidated state.
- Sector's successful restore count.

Repeated identical events are deduplicated by the diagnostic logger. These
records are included in the existing diagnostic export.

Static scoring analysis identifies timing and accumulated state around
`+0x27260` through `+0x273b8`, but not every field has a verified meaning.
In particular, `+0x2735c` is a floating-point accumulator in this build,
not the current count-lap cache at `+0x27360`. Do not zero this region or
clear legitimate penalties as a proposed fix.

## Read-only capture

The researcher-side command is:

```powershell
python scripts/sector.py research.capture_reset_incident --pid <LMU_PID> --output logs/reset-incident.jsonl --seconds 600
```

Use a new output filename. The command requires the pinned game build and
offline Practice without EAC. It opens a read-only process handle, samples at
10 Hz, rechecks the session and protection context, and stops after the
requested duration. It neither loads a DLL nor invokes game functions.

Each sample contains:

- Player, physics and scoring ownership links, checked again after the reads.
- Bounded body, constraint and suspension-backup vectors.
- Four wheels' attachment/deformation flags and body, hub and tire identities.
- Selected scoring fields and an explicitly unnamed scoring window.

Vector metadata is checked again after reading its entries. Samples are
asynchronous observations, not atomic checkpoints. Even a sample passing
these checks cannot replace an owner-thread snapshot.

### Separate the two trials

First use a healthy car and save on the track. Record an ordinary F7, then a
separate off-track F7, keeping the same checkpoint. Compare SDK penalty codes
and native scoring transitions before and after each command.

For detachment, use a new healthy baseline and save once. Record one wheel
detachment and one rejected F7, then remain on that vehicle for inspection.
Avoid combining the initial detachment investigation with repeated resets
or a session restart. Record the car, circuit and exact observed outcome.

The current executable cannot reattach the wheel. This capture is intended to
determine the missing state before writing and qualifying that implementation.

## Evidence and checks

The code analysis used a local live-code reconstruction with SHA-256
`1aa6b2eed9f85f6cf1383c4ad298cc7b3f77f97c5516c915ade68a54c62660c9`.
The executable identity and offsets are limited to Steam build 25661166.
Captured proprietary code and raw process observations stay outside Git.

Local checks cover SDK code serialization and read-only incident sampling,
including malformed vector bounds, short reads and changing ownership.
No detachment repair or penalty correction has yet passed an in-game trial.
These remain open work before publishing the requested 1.0.0 as a completed
fix and merging it to production.
