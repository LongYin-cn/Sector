#include "lap_scoring_plan.h"
#include <string.h>
int scoring_field_allowed_25661166(uint32_t slot, uint32_t offset, uint32_t size) {
    return slot == 0 && size == 4 &&
           (offset == 0xd4 || offset == 0x160 || offset == 0x27290 || offset == 0x27360);
}
int lap_scoring_plan(const LapGuardFlags *before, uint64_t epoch, RestorePlan *out) {
    LapGuardFlags after;
    if (!out || !epoch || !lap_guard_prepare(before, &after))
        return 0;
    const uint32_t offsets[3] = {0x160, 0x27290, 0x27360};
    const int32_t values[3] = {before->current, before->remembered, before->last_computed};
    const int32_t desired[3] = {after.current, after.remembered, after.last_computed};
    RestoreField fields[3];
    memset(fields, 0, sizeof(fields));
    for (unsigned i = 0; i < 3; i++) {
        fields[i].field_offset = offsets[i];
        fields[i].size = 4;
        memcpy(fields[i].expected, &values[i], 4);
        memcpy(fields[i].desired, &desired[i], 4);
    }
    memcpy(out->fields, fields, sizeof(fields));
    out->epoch = epoch;
    out->count = 3;
    return 1;
}

int lap_scoring_fields_valid(const RestorePlan *plan, uint32_t slot) {
    if (!plan || !plan->epoch || plan->count > RESTORE_MAX_FIELDS)
        return 0;
    unsigned mask = 0;
    LapGuardFlags before = {0}, after;
    int32_t desired[3] = {0};
    for (size_t i = 0; i < plan->count; ++i) {
        const RestoreField *f = plan->fields + i;
        if (f->object_slot != slot)
            continue;
        if (f->reserved || !scoring_field_allowed_25661166(0, f->field_offset, f->size))
            return 0;
        const int failure = f->field_offset == 0xd4;
        const unsigned index = f->field_offset == 0x160 ? 0 : f->field_offset == 0x27290 ? 1 : 2;
        const unsigned bit = failure ? 8 : 1u << index;
        int32_t expected, value;
        memcpy(&expected, f->expected, 4);
        memcpy(&value, f->desired, 4);
        if ((mask & bit) || expected < 0 || expected > (failure ? 9 : 2))
            return 0;
        mask |= bit;
        if (failure) {
            if (value != 0)
                return 0;
        } else {
            if (index == 0)
                before.current = expected;
            else if (index == 1)
                before.remembered = expected;
            else
                before.last_computed = expected;
            desired[index] = value;
        }
    }
    // Validate the triplet together, not just three independently legal values.
    return (mask == 7 || mask == 15) && lap_guard_prepare(&before, &after) &&
           desired[0] == after.current && desired[1] == after.remembered &&
           desired[2] == after.last_computed;
}
