#ifndef LMU_RESTORE_BINDINGS_25661166_H
#define LMU_RESTORE_BINDINGS_25661166_H
#include "vehicle_restore_plan.h"
/* Ephemeral addresses, never serialized in a saved checkpoint. Capture and
 * validate on the physical thread, freeze until transaction/rollback ends. */
#define RESTORE_THERMAL_BASE 108
#define RESTORE_COLLISION_EXPORT_SLOT (108 + 4 * 72 * 9)
#define RESTORE_PUNCTURE_TABLE_BASE (RESTORE_COLLISION_EXPORT_SLOT + 1)
#define RESTORE_PUNCTURE_POOL_BASE (RESTORE_PUNCTURE_TABLE_BASE + 4 * 9)
#define RESTORE_OBJECT_COUNT (RESTORE_PUNCTURE_POOL_BASE + 4)
typedef struct RestoreBindings {
    uint64_t epoch;
    uintptr_t address[RESTORE_OBJECT_COUNT];
    uint32_t body_count, constraint_count, constraint_kind[64], engine_channels;
    uint32_t puncture_nodes[4];
} RestoreBindings;
int restore_binding_field(const RestoreBindings *, uint32_t slot, uint32_t offset, uint32_t size);
int restore_bindings_validate(const RestoreBindings *, const RestorePlan *);
#endif
