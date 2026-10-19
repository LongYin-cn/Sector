#include "../../src/native/restore/physical_scoring_transaction.h"
#ifdef NDEBUG
#undef NDEBUG
#endif
#include <assert.h>
#include <stdio.h>
#include <string.h>
static RestorePlan physical, joint;
static unsigned char car[64], score[0x27400], prior_car[64], prior_score[0x27400];
static int writes, fail_at, lose_context_at, context_ok = 1;
static int context(void *user, uint64_t epoch) {
    (void)user;
    return context_ok && epoch == 77;
}
static int allowed(void *user, uint32_t slot, uint32_t off, uint32_t n) {
    return user == car ? (slot == 0 && off == 8 && n == 8)
                       : scoring_field_allowed_25661166(slot, off, n);
}
static int read_field(void *user, uint32_t slot, uint32_t off, void *out, uint32_t n) {
    if (!allowed(user, slot, off, n))
        return 0;
    memcpy(out, (unsigned char *)user + off, n);
    return 1;
}
static int write_field(void *user, uint32_t slot, uint32_t off, const void *in, uint32_t n) {
    if (!allowed(user, slot, off, n))
        return 0;
    ++writes;
    memcpy((unsigned char *)user + off, in, writes == fail_at ? n / 2 : n);
    if (writes == lose_context_at)
        context_ok = 0;
    return writes != fail_at;
}
static void init(void) {
    memset(car, 0x5a, sizeof(car));
    memset(score, 0x7b, sizeof(score));
    int32_t valid = 2;
    memcpy(score + 0x160, &valid, 4);
    memcpy(score + 0x27290, &valid, 4);
    memcpy(score + 0x27360, &valid, 4);
    memcpy(prior_car, car, sizeof(car));
    memcpy(prior_score, score, sizeof(score));
    memset(&physical, 0, sizeof(physical));
    physical.epoch = 77;
    physical.count = 1;
    RestoreField *f = physical.fields;
    f->object_slot = 0;
    f->field_offset = 8;
    f->size = 8;
    memcpy(f->expected, car + 8, 8);
    double value = 123.5;
    memcpy(f->desired, &value, 8);
    LapGuardFlags flags = {2, 2, 2, 1, 0};
    assert(restore_joint_prepare(&physical, &flags, &joint) == 0);
    writes = fail_at = lose_context_at = 0;
    context_ok = 1;
}
int main(void) {
    RestoreBackend p = {car, context, allowed, read_field, write_field},
                   s = {score, context, allowed, read_field, write_field};
    RestoreReport report;
    init();
    assert(restore_joint_execute(&joint, &p, &s, &report) == 0 && writes == 4);
    memcpy(prior_car + 8, joint.fields[0].desired, 8);
    const unsigned offsets[3] = {0x160, 0x27290, 0x27360};
    for (unsigned i = 0; i < 3; i++)
        memcpy(prior_score + offsets[i], joint.fields[i + 1].desired, 4);
    assert(!memcmp(car, prior_car, sizeof(car)) && !memcmp(score, prior_score, sizeof(score)));
    for (int failure = 1; failure <= 4; failure++) {
        init();
        fail_at = failure;
        assert(restore_joint_execute(&joint, &p, &s, &report) == RESTORE_WRITE_FAILED);
        assert(report.restored == report.attempted && !memcmp(car, prior_car, sizeof(car)) &&
               !memcmp(score, prior_score, sizeof(score)));
        init();
        lose_context_at = failure;
        assert(restore_joint_execute(&joint, &p, &s, &report) == RESTORE_CONTEXT_CHANGED);
        assert(report.restored == report.attempted && !memcmp(car, prior_car, sizeof(car)) &&
               !memcmp(score, prior_score, sizeof(score)));
    }
    init();
    score[0x160] = 1;
    assert(restore_joint_execute(&joint, &p, &s, &report) == RESTORE_STATE_CHANGED && writes == 0);
    init();
    joint.fields[3].field_offset = 0x2735c;
    assert(restore_joint_execute(&joint, &p, &s, &report) == RESTORE_BAD_PLAN && writes == 0);
    init();
    joint.fields[3].desired[0] = 2;
    assert(restore_joint_execute(&joint, &p, &s, &report) == RESTORE_BAD_PLAN && writes == 0);
    init();
    // The old all-zero plan must not silently suppress counted laps again.
    for (unsigned i = 1; i < 4; ++i)
        memset(joint.fields[i].desired, 0, 4);
    assert(restore_joint_execute(&joint, &p, &s, &report) == RESTORE_BAD_PLAN && writes == 0);
    // Preserve an initial out lap and keep an already untimed lap untimed.
    for (int32_t current = 0; current <= 1; ++current) {
        init();
        LapGuardFlags flags = {current, current, current, 1, 0};
        for (unsigned i = 0; i < 3; ++i)
            memcpy(score + offsets[i], &current, 4);
        memcpy(prior_score, score, sizeof(score));
        assert(restore_joint_prepare(&physical, &flags, &joint) == RESTORE_OK);
        assert(restore_joint_execute(&joint, &p, &s, &report) == RESTORE_OK);
        assert(!memcmp(score, prior_score, sizeof(score)));
    }
    init();
    joint.count = 3;
    assert(restore_joint_execute(&joint, &p, &s, &report) == RESTORE_BAD_PLAN && writes == 0);
    // Sector gate uses the checkpoint's value. It is compensated with physics.
    for (int fault = 0; fault <= 1; ++fault) {
        init();
        int32_t sector = 0, saved_sector = 2;
        memcpy(score + 0x18, &sector, 4);
        memcpy(prior_score, score, sizeof(score));
        RestoreField *gate = joint.fields + joint.count++;
        memset(gate, 0, sizeof(*gate));
        gate->object_slot = RESTORE_SCORING_SLOT;
        gate->field_offset = 0x18;
        gate->size = 4;
        memcpy(gate->expected, &sector, 4);
        memcpy(gate->desired, &saved_sector, 4);
        fail_at = fault ? 5 : 0;
        assert(restore_joint_execute(&joint, &p, &s, &report) ==
               (fault ? RESTORE_WRITE_FAILED : RESTORE_OK));
        memcpy(&sector, score + 0x18, 4);
        assert(sector == (fault ? 0 : 2));
        if (fault)
            assert(!memcmp(score, prior_score, sizeof(score)) &&
                   !memcmp(car, prior_car, sizeof(car)));
        // Invalid sector values and duplicate gates are refused before writes.
        writes = 0;
        gate->desired[0] = 3;
        assert(restore_joint_execute(&joint, &p, &s, &report) == RESTORE_BAD_PLAN && writes == 0);
        gate->desired[0] = 2;
        joint.fields[joint.count++] = *gate;
        assert(restore_joint_execute(&joint, &p, &s, &report) == RESTORE_BAD_PLAN && writes == 0);
    }
    puts("PASS joint physics/scoring: exact fields and untouched record bytes; four partial-write "
         "and four context-loss rollbacks; stale flags, old offset, revived timing and incomplete "
         "plan rejected.");
    return 0;
}
