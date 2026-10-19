#pragma once
#include "../../src/native/restore/tire_puncture_state.h"
#include <memory>

// Uses the contact fixture's 504-node pools. No game process or addresses.
struct TirePunctureFixtureModel {
    std::array<std::array<unsigned char, 9 * 0x1cc8>, 4> tables{};
    uintptr_t tires[4]{}, wheels[4]{};
    static constexpr unsigned added_fields = 4 * (7 + 9 * (2 + 54) + 504 * 2);

    void initialize(RestoreBindings &bindings) {
        for (unsigned w = 0; w < 4; ++w) {
            tires[w] = bindings.address[96 + w];
            wheels[w] = bindings.address[100 + w];
            auto *t = reinterpret_cast<unsigned char *>(tires[w]);
            auto *wheel = reinterpret_cast<unsigned char *>(wheels[w]);
            put(t + 8, static_cast<unsigned char>(0));
            put(wheel + 0x3e0, static_cast<unsigned char>(0));
            put(wheel + 0x3b8, double{170});
            put(wheel + 0x3c8, double{.95});
            put(t + 0x310, uint32_t{504});
            put(t + 0xef0, reinterpret_cast<uintptr_t>(tables[w].data()));
            put(t + 0x9e8, uint64_t{1234});
            for (unsigned i = 0; i < 8; ++i)
                put(t + 0xc90 + i * 8, double{8} + i);
            for (unsigned i = 0; i < 6; ++i)
                put(t + 0x1088 + i * 8, double{24} + i);
            put(t + 0xfa0, double{3});
            put(t + 0xfa8, double{4});
            for (unsigned r = 0; r < 9; ++r) {
                auto *p = tables[w].data() + r * 0x1cc8;
                put(p + 0x1b0, double{5});
                put(p + 0x1b8, double{6});
                put(p + 0x1f0, double{7});
                for (unsigned i = 0; i < 1716; ++i)
                    put(p + 0x1f8 + i * 4, float{.5f} + r);
            }
            const auto pool = get<uintptr_t>(t + 0x318);
            for (unsigned row = 0; row < 72; ++row)
                for (unsigned k = 0; k < 7; ++k)
                    bindings.address[RESTORE_THERMAL_BASE + (w * 72 + row) * 9 + k] =
                        pool + (row * 7 + k) * 0x110;
            for (unsigned n = 0; n < 504; ++n) {
                auto *p = reinterpret_cast<unsigned char *>(pool + n * 0x110);
                for (unsigned i = 0; i < 6; ++i)
                    put(p + 0x30 + i * 8, double{40} + i);
                put(p + 0x100, uint64_t{55});
                put(p + 0x108, uint64_t{66});
            }
        }
    }

    void damage(unsigned w) {
        auto *t = reinterpret_cast<unsigned char *>(tires[w]);
        auto *wheel = reinterpret_cast<unsigned char *>(wheels[w]);
        put(t + 8, static_cast<unsigned char>(1));
        put(wheel + 0x3e0, static_cast<unsigned char>(1));
        put(wheel + 0x3b8, double{0});
        put(wheel + 0x3c8, double{.001});
        put(t + 0xfa0, double{.25});
        put(t + 0xfa8, double{.5});
        for (unsigned i = 0; i < 8; ++i)
            put(t + 0xc90 + i * 8, get<double>(t + 0xc90 + i * 8) * .125);
        for (unsigned i = 0; i < 6; ++i)
            put(t + 0x1088 + i * 8, get<double>(t + 0x1088 + i * 8) * .125);
        for (unsigned r = 0; r < 9; ++r) {
            auto *p = tables[w].data() + r * 0x1cc8;
            put(p + 0x1b0, double{10});
            put(p + 0x1b8, double{12});
            put(p + 0x1f0, double{3.5});
            for (unsigned i = 0; i < 1716; ++i)
                put(p + 0x1f8 + i * 4, get<float>(p + 0x1f8 + i * 4) * .25f);
        }
        const auto pool = get<uintptr_t>(t + 0x318);
        for (unsigned n = 0; n < 504; ++n) {
            auto *p = reinterpret_cast<unsigned char *>(pool + n * 0x110);
            for (unsigned i = 0; i < 6; ++i)
                put(p + 0x30 + i * 8, double{80} + i);
            put(p + 0x100, uint64_t{77});
            put(p + 0x108, uint64_t{1234});
        }
    }
};

static void check_selected_puncture_nodes() {
    auto saved = std::make_unique<sector_puncture::State>();
    auto current = std::make_unique<sector_puncture::State>();
    auto plan = std::make_unique<RestorePlan>();
    RestoreBindings bindings{};
    bindings.epoch = plan->epoch = 1;
    for (unsigned w = 0; w < 4; ++w) {
        auto &s = (*saved)[w];
        s.tire = bindings.address[96 + w] = 0x10000 + w * 0x2000;
        bindings.address[100 + w] = 0x20000 + w * 0x2000;
        s.table = 0x100000 + w * 0x100000;
        s.pool = 0x10000000 + w * 0x1000000;
        s.nodes.resize(504);
        (*current)[w] = s;
        for (unsigned row = 0; row < 72; ++row)
            for (unsigned k = 0; k < 7; ++k)
                bindings.address[RESTORE_THERMAL_BASE + (w * 72 + row) * 9 + k] =
                    s.pool + (row * 7 + k) * 0x110;
    }
    assert(sector_puncture::plan(*saved, *current, bindings, *plan));
    assert(plan->count == 6076);
    for (size_t i = 0; i < plan->count; ++i) {
        const auto &f = plan->fields[i];
        assert(restore_binding_field(&bindings, f.object_slot, f.field_offset, f.size));
        if (f.object_slot >= RESTORE_PUNCTURE_POOL_BASE)
            assert(f.size == 8 &&
                   (f.field_offset % 0x110 == 0x38 || f.field_offset % 0x110 == 0x108));
    }
    assert(!restore_binding_field(&bindings, RESTORE_PUNCTURE_POOL_BASE, 504 * 0x110 + 0x38, 8));
    assert(!restore_binding_field(&bindings, RESTORE_PUNCTURE_TABLE_BASE, 0x1cc0, 128));
    const auto count = plan->count;
    (*current)[3].table += 0x10000;
    assert(!sector_puncture::plan(*saved, *current, bindings, *plan));
    assert(plan->count == count);
    (*current)[3] = (*saved)[3];
    plan->count = RESTORE_MAX_FIELDS - 1;
    assert(!sector_puncture::plan(*saved, *current, bindings, *plan));
    assert(plan->count == RESTORE_MAX_FIELDS - 1);
}
