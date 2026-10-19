#ifndef LMU_LAP_GUARD_CORE_H
#define LMU_LAP_GUARD_CORE_H
#include <stdint.h>

/* Value payload only; no process pointers and no record/lap-time fields.
 * Offsets are build-specific (see compatibility/14200-scoring-research.json),
 * apply to native scoring, NOT telemetry, and do not authorize game writes.
 * The owner-thread adapter must acquire a coherent view and validate context.
 */
typedef struct LapGuardFlags {
    int32_t current;       /* +0x160 */
    int32_t remembered;    /* 14130: +27288; 14200: +27290 */
    int32_t last_computed; /* 14130: +27354; older 14200: +2735C; Steam 25661166: +27360 */
    uint8_t next_timed;    /* +0x164; existing next-lap restriction is preserved */
    uint8_t off_track;     /* 14130: +272B0; 14200: +272B8 */
} LapGuardFlags;

static inline int lap_guard_flags_valid(const LapGuardFlags *s) {
    return s && s->current >= 0 && s->current <= 2 && s->remembered >= 0 && s->remembered <= 2 &&
           s->last_computed >= 0 && s->last_computed <= 2 && s->next_timed <= 1 &&
           s->off_track <= 1;
}

/* Restore only: a save must never call this as a scoring mutation.
 * Native states are 0 (do not count), 1 (count without a time), 2 (count and time).
 * Preserve a native no-count state, such as the initial out lap. For a counted
 * attempt, remove timing eligibility without disabling the finish-line count.
 * Synchronize the caches too, including a temporarily invalid attempt whose
 * remembered value is still 2. Otherwise leaving an off-track area can revive
 * the interrupted time, or the next lap can inherit a stale invalid flag.
 * Keep next_timed unchanged: a reset must neither penalize nor clear a penalty
 * on the next lap. No lap number, start time, sector time or record is rewound.
 * This function only writes a caller-owned value object, never live game RAM.
 */
static inline int lap_guard_prepare(const LapGuardFlags *before, LapGuardFlags *after) {
    if (!after || !lap_guard_flags_valid(before))
        return 0;
    *after = *before;
    if (before->current != 0) {
        after->current = 1;
        after->remembered = 1;
        after->last_computed = 1;
    }
    return 1;
}
#endif
