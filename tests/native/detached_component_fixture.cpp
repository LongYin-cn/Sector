#include "../../src/native/restore/detached_component_plan.h"
#include "../../src/native/restore/detached_component_transaction.h"
#include "../../src/native/restore/suspension_attachment_state.h"
#ifdef NDEBUG
#undef NDEBUG
#endif
#include <cassert>
#include <cstdio>
#include <map>
#include <memory>
#include <limits>

using sector_attachment::RegistryPatch;
using sector_attachment::RegistryPlanner;

struct Memory {
    static constexpr uintptr_t base = 0x140000000, car = 0x200000, table = 0x300000;
    std::map<uintptr_t, unsigned char> bytes;
    bool pin = true;
    size_t writes = 0, fail_write = 0;
    static bool pinned(void *user) {
        return static_cast<Memory *>(user)->pin;
    }
    static bool write(void *user, uintptr_t p, const void *in, size_t n) {
        auto &m = *static_cast<Memory *>(user);
        const bool fail = ++m.writes == m.fail_write;
        // Simulate a backend that fails after partially modifying a field.
        const size_t size = fail ? (n + 1) / 2 : n;
        for (size_t i = 0; i < size; ++i)
            m.bytes[p + i] = static_cast<const unsigned char *>(in)[i];
        return !fail;
    }
    template <typename T> void put(uintptr_t p, const T &v) {
        const auto *data = reinterpret_cast<const unsigned char *>(&v);
        for (size_t i = 0; i < sizeof(v); ++i)
            bytes[p + i] = data[i];
    }
    template <typename T> T get(uintptr_t p) {
        T value{};
        assert(read(this, p, &value, sizeof(value)));
        return value;
    }
    static bool read(void *user, uintptr_t p, void *out, size_t n) {
        auto &m = *static_cast<Memory *>(user);
        for (size_t i = 0; i < n; ++i) {
            const auto found = m.bytes.find(p + i);
            if (found == m.bytes.end())
                return false;
            static_cast<unsigned char *>(out)[i] = found->second;
        }
        return true;
    }
    Memory() {
        put(car + 8, int32_t(0));
        put(base + 0x3b8aa80, table);
        put(base + 0x3b8aa10, int32_t(0));
        put(base + 0x3b8aa18, uintptr_t(0));
        for (unsigned i = 0; i < 18; ++i) {
            put(car + 0x18b40 + i, uint8_t(0));
            put(car + 0x186e0 + i * 4, uint32_t(-1));
        }
        for (unsigned i = 0; i < 4; ++i)
            put(table + i * 40, int32_t(-1));
        for (unsigned i = 0; i < 64; ++i)
            for (unsigned side : {0, 0x10}) {
                const auto row = base + 0x3b8ace0 + i * 0x20 + side;
                put(row + 4, int32_t(0));
                put(row + 8, uintptr_t(0));
            }
        for (unsigned side : {0, 0x10}) {
            put(base + 0x3b8b4e4 + side, int32_t(0));
            put(base + 0x3b8b4e8 + side, uintptr_t(0));
        }
    }
    void list(uintptr_t count, uintptr_t pointer, uintptr_t storage,
              std::initializer_list<uintptr_t> entries) {
        put(count, int32_t(entries.size()));
        put(pointer, storage);
        for (auto entry : entries) {
            put(storage, entry);
            storage += 8;
        }
    }
    void apply(const std::vector<RegistryPatch> &patches, bool reverse = false) {
        for (const auto &p : patches) {
            unsigned char current[8]{};
            assert(read(this, p.address, current, p.size));
            const auto &expected = reverse ? p.after : p.before;
            const auto &desired = reverse ? p.before : p.after;
            assert(!std::memcmp(current, expected.data(), p.size));
            for (unsigned i = 0; i < p.size; ++i)
                bytes[p.address + i] = desired[i];
        }
    }
};

static void suspension_tests() {
    using namespace sector_attachment;
    Memory m;
    RestoreBindings bindings{};
    bindings.epoch = 7;
    bindings.body_count = 5;
    bindings.constraint_count = 5;
    bindings.address[104] = 0x500000;
    for (unsigned i = 0; i < 5; ++i)
        bindings.address[i] = 0x600000 + i * 0x1000;
    const uintptr_t supports[3]{0x700000, 0x700008, 0x700008};
    m.put(0x502440, supports);
    m.put(supports[0], bindings.address[0]);
    const uintptr_t empty[3]{};
    m.put(0x502640, empty);
    for (unsigned w = 0; w < 4; ++w) {
        bindings.address[RESTORE_WHEEL_BASE + w] = 0x800000 + w * 0x1000;
        m.put(bindings.address[RESTORE_WHEEL_BASE + w] + 0x1d8, bindings.address[w + 1]);
        m.put(bindings.address[RESTORE_WHEEL_BASE + w] + 0x300, uint16_t(0));
    }
    // Measured healthy limits for the five released Peugeot front suspension bars.
    const double lengths[5]{0.5115350294156396, 0.5517713254635779, 0.3475135981119174,
                            0.3445608741811082, 0.35723196108371447};
    for (unsigned i = 0; i < 5; ++i) {
        const uintptr_t p = bindings.address[RESTORE_CONSTRAINT_BASE + i] = 0x900000 + i * 0x1000;
        bindings.constraint_kind[i] = 1;
        m.put(p + 0xa0, std::array<uintptr_t, 2>{bindings.address[0], bindings.address[2]});
        m.put(p + 0x80, std::array<double, 2>{lengths[i], lengths[i]});
        m.put(p + 0x48, std::array<unsigned char, 2>{1, 0});
        m.put(p + 0x4e, uint8_t(3));
    }
    auto read = [&](uintptr_t p, auto &out) { return Memory::read(&m, p, &out, sizeof(out)); };
    SuspensionCheckpoint checkpoint;
    assert(capture_suspension(bindings, checkpoint, read));
    auto plan = std::make_unique<RestorePlan>();
    plan->epoch = bindings.epoch;
    plan->count = 1;
    plan->fields[0].object_slot = 0;
    plan->fields[0].field_offset = 8;
    plan->fields[0].size = 8;
    unsigned mask = 99;
    assert(plan_suspension(checkpoint, bindings, *plan, mask, read));
    assert(mask == 0 && plan->count == 1);
    const uintptr_t backups[3]{0xa00000, 0xa00000 + 5 * 56, 0xa00000 + 6 * 56};
    m.put(0x502640, backups);
    m.put(bindings.address[RESTORE_WHEEL_BASE + 1] + 0x300, uint16_t(0x101));
    for (unsigned i = 0; i < 5; ++i) {
        const auto p = bindings.address[RESTORE_CONSTRAINT_BASE + i];
        m.put(backups[0] + i * 56, p);
        m.put(backups[0] + i * 56 + 8, std::array<double, 6>{lengths[i], 0, 0, lengths[i], 0, 0});
        const double inf = std::numeric_limits<double>::infinity();
        m.put(p + 0x80, std::array<double, 2>{-inf, inf});
        m.put(p + 0x48, uint16_t(0));
        m.put(p + 0x4e, uint8_t(0));
    }
    const auto detached = m.bytes;
    SuspensionCheckpoint rejected;
    assert(!capture_suspension(bindings, rejected, read) && !rejected.occupied);
    assert(plan_suspension(checkpoint, bindings, *plan, mask, read));
    assert(mask == 2 && plan->count == 18 && m.bytes == detached);
    for (unsigned i = 1; i < plan->count; ++i) {
        const auto &p = plan->fields[i];
        unsigned char expected[128]{};
        const auto address = bindings.address[p.object_slot] + p.field_offset;
        assert(Memory::read(&m, address, expected, p.size));
        assert(!std::memcmp(expected, p.expected, p.size));
        assert(Memory::write(&m, address, p.desired, p.size));
    }
    assert(m.get<uintptr_t>(0x502648) == backups[0]);
    assert(m.get<uint16_t>(bindings.address[RESTORE_WHEEL_BASE + 1] + 0x300) == 0);
    SuspensionCheckpoint repaired;
    assert(capture_suspension(bindings, repaired, read));
    for (unsigned i = 0; i < 5; ++i) {
        assert(!std::memcmp(repaired.bars[i].limits, checkpoint.bars[i].limits, 16));
        assert(repaired.bars[i].active == 3 && repaired.bars[i].mode[0] == 1);
    }
    for (unsigned invalid = 0; invalid < 8; ++invalid) {
        m.bytes = detached;
        plan->count = 1;
        const auto bar = bindings.address[RESTORE_CONSTRAINT_BASE];
        if (invalid == 0)
            m.put(backups[0] + 56, bar); // Duplicate backup.
        if (invalid == 1)
            m.put(backups[0] + 8, double(42)); // Configuration changed.
        if (invalid == 2)
            m.put(bar + 0x80, double(0)); // Constraint not released.
        if (invalid == 3)
            m.put(0x502648, backups[1] - 56); // Missing backup.
        if (invalid == 4)
            m.put(backups[0], uintptr_t(0xb00000)); // Foreign constraint.
        if (invalid == 5)
            m.put(supports[0], bindings.address[1]); // Changed support graph.
        if (invalid == 6)
            m.put(bindings.address[RESTORE_WHEEL_BASE + 1] + 0x300, uint16_t(0x100));
        if (invalid == 7)
            m.put(bar + 0x4e, uint8_t(3)); // Partial native reattachment.
        const auto before = m.bytes;
        mask = 99;
        assert(!plan_suspension(checkpoint, bindings, *plan, mask, read));
        assert(plan->count == 1 && mask == 0 && m.bytes == before);
    }
}

int main() {
    suspension_tests();
    // The live Peugeot capture used inactive bucket 63 and the inactive tail.
    for (unsigned mask : {1u, 2u, 3u}) {
        Memory m;
        std::vector<uintptr_t> nodes;
        for (unsigned wheel = 0; wheel < 2; ++wheel)
            if (mask & (1u << wheel)) {
                m.put(Memory::car + 0x18b40 + wheel, uint8_t(1));
                nodes.push_back(Memory::table + wheel * 40);
            }
        const auto bucket = Memory::base + 0x3b8ace0 + 63 * 0x20 + 0x10;
        for (auto row : {bucket, Memory::base + 0x3b8b4f0}) {
            const uintptr_t storage = row == bucket ? 0x400000 : 0x410000;
            m.put(row + 4, int32_t(nodes.size()));
            m.put(row + 8, storage);
            for (size_t i = 0; i < nodes.size(); ++i)
                m.put(storage + i * 8, nodes[i]);
        }
        const auto before = m.bytes;
        RegistryPlanner planner({&m, Memory::read});
        std::vector<RegistryPatch> patches;
        assert(planner.wheels(Memory::base, Memory::car, mask, patches));
        assert(!patches.empty() && m.bytes == before);
        m.apply(patches);
        assert(m.get<int32_t>(bucket + 4) == 0);
        assert(m.get<int32_t>(Memory::base + 0x3b8b4f4) == 0);
        for (unsigned wheel = 0; wheel < 2; ++wheel)
            assert(m.get<uint8_t>(Memory::car + 0x18b40 + wheel) == 0);
        m.apply(patches, true);
        assert(m.bytes == before);
    }
    {
        Memory m;
        constexpr auto node = Memory::table, other = uintptr_t(0x310000);
        m.put(Memory::car + 0x18b40, uint8_t(1));
        m.put(node, int32_t(0));
        m.put(other, int32_t(1));
        m.list(Memory::base + 0x3b8aa10, Memory::base + 0x3b8aa18, 0x400000, {node, other});
        m.list(Memory::base + 0x3b8ace4, Memory::base + 0x3b8ace8, 0x410000, {node, other});
        const auto before = m.bytes;
        RegistryPlanner planner({&m, Memory::read});
        std::vector<RegistryPatch> patches;
        assert(planner.wheels(Memory::base, Memory::car, 1, patches));
        m.apply(patches);
        assert(m.get<int32_t>(node) == -1 && m.get<int32_t>(other) == 0);
        assert(m.get<uintptr_t>(0x400000) == other);
        assert(m.get<int32_t>(Memory::base + 0x3b8aa10) == 1);
        m.apply(patches, true);
        assert(m.bytes == before);
    }
    for (unsigned invalid = 0; invalid < 4; ++invalid) {
        Memory m;
        m.put(Memory::car + 0x18b40, uint8_t(1));
        if (invalid == 0)
            m.put(Memory::base + 0x3b8acf4, int32_t(4097));
        if (invalid == 1) {
            m.put(Memory::table, int32_t(1));
            m.put(Memory::base + 0x3b8aa10, int32_t(0));
        }
        if (invalid == 2) {
            m.put(Memory::car + 0x186e0, uint8_t(4));
            m.put(Memory::car + 0x18b44, uint8_t(1));
        }
        if (invalid == 3)
            m.list(Memory::base + 0x3b8acf4, Memory::base + 0x3b8acf8, 0x400000,
                   {Memory::table, Memory::table});
        const auto before = m.bytes;
        RegistryPlanner planner({&m, Memory::read});
        std::vector<RegistryPatch> patches(1);
        assert(!planner.wheels(Memory::base, Memory::car, 1, patches));
        assert(patches.empty() && m.bytes == before);
    }
    size_t fields = 0;
    for (unsigned attempt = 0; attempt < 12; ++attempt) {
        Memory m;
        m.put(Memory::car + 0x18b40, uint8_t(1));
        m.list(Memory::base + 0x3b8acf4, Memory::base + 0x3b8acf8, 0x400000,
               {Memory::table, Memory::table + 40});
        const auto before = m.bytes;
        sector_attachment::RegistryTransaction tx(
            {&m, Memory::pinned, Memory::read, Memory::write});
        assert(tx.begin(Memory::base, Memory::car, 1));
        fields = tx.field_count();
        assert(fields >= 3 && fields < 12 && !m.writes);
        m.fail_write = attempt;
        const bool applied = tx.apply();
        assert(applied == (attempt == 0 || attempt > fields));
        m.fail_write = 0;
        assert(tx.finish(false));
        assert(!tx.active() && m.bytes == before);
    }
    {
        Memory m;
        m.put(Memory::car + 0x18b40, uint8_t(1));
        sector_attachment::RegistryTransaction tx(
            {&m, Memory::pinned, Memory::read, Memory::write});
        assert(tx.begin(Memory::base, Memory::car, 1));
        m.put(Memory::car + 0x18b40, uint8_t(2));
        assert(!tx.apply() && !m.writes); // Stale plan is not written.
        m.put(Memory::car + 0x18b40, uint8_t(1));
        m.pin = false;
        assert(!tx.apply() && !tx.finish(false) && tx.active() && !m.writes);
        m.pin = true;
        assert(tx.apply());
        m.fail_write = m.writes + 1;
        assert(!tx.finish(false) && tx.active()); // Failed recovery retains its journal.
        assert(tx.finish(false));
        assert(tx.begin(Memory::base, Memory::car, 1));
        assert(tx.apply() && tx.finish(true));
        assert(!tx.active() && m.get<uint8_t>(Memory::car + 0x18b40) == 0);
    }
    std::puts("PASS detached suspension, registries, partial writes, recovery and pin loss");
}
