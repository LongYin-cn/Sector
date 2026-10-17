#include "../../src/native/physics/mechanical_prepare_core.h"
#include "../../src/native/physics/tire_persistent_core.h"
#include <math.h>
#include <stdio.h>
#include <string.h>
#define CHECK(x)                                                                                   \
    do {                                                                                           \
        if (!(x)) {                                                                                \
            printf("FAIL mechanical line %d\n", __LINE__);                                         \
            return 1;                                                                              \
        }                                                                                          \
    } while (0)
static int consumption_modes(void) {
    // Both fresh and previously worn tyres can have wear disabled. Disabled
    // consumption means a stable state, not absent fuel or tyre structures.
    for (unsigned mode = 0; mode < 8; ++mode) {
        const int fuel_on = mode & 1, wear_on = mode & 2, already_worn = mode & 4;
        MechanicalDependencies saved = {0}, current, normalized;
        MechanicalLinks links = {0, {1, 2, 3, 4}, {5, 6, 7, 8}};
        RigidSavedBody bodies[9] = {0};
        RigidMassProperties live[9], saved_mass[9];
        RigidPreparedBody restored[9];
        TirePersistentState persistent[4] = {0};
        FuelPrepared fuel;
        saved.fuel = (FuelSnapshot){20, fuel_on ? -.025 : 0, .735, .4, 0};
        for (int i = 0; i < 9; ++i) {
            bodies[i].mass = (RigidMassProperties){1, {1, 1, 1}};
            bodies[i].orientation[0] = bodies[i].orientation[4] = bodies[i].orientation[8] = 1;
            bodies[i].velocity_world[0] = 22;
        }
        for (int w = 0; w < 4; ++w) {
            saved.wheels[w] = (WheelInertiaInputs){.4, .001, .036, 3.618};
            persistent[w].total_mass = 1;
            for (int j = 0; j < 3; ++j) {
                saved.tires[w].total_table[j] = 2.f;
                saved.tires[w].sectors[0][j] = already_worn ? .125 : 0;
                persistent[w].cached_sector_inertia[j] = saved.tires[w].sectors[0][j];
            }
        }
        current = saved;
        if (fuel_on)
            current.fuel.quantity = 12;
        for (int w = 0; w < 4; ++w)
            for (int j = 0; j < 3; ++j)
                if (wear_on)
                    current.tires[w].sectors[0][j] += .25;
        WheelPreparedInertia wheels[4];
        TirePreparedInertia before[4], after[4];
        CHECK(!wheel_prepare_inertia(saved.wheels, wheels));
        CHECK(!tire_prepare_inertia(saved.tires, before));
        CHECK(!tire_prepare_inertia(current.tires, after));
        for (int w = 0; w < 4; ++w) {
            bodies[1 + w].mass.inverse_inertia_local[0] = wheels[w].inverse_axial;
            for (int j = 0; j < 3; ++j)
                bodies[5 + w].mass.inverse_inertia_local[j] = before[w].inverse_internal[j];
        }
        bodies[0].mass.inverse_mass = 1 / (20 * .735 + .4);
        for (int i = 0; i < 9; ++i)
            live[i] = saved_mass[i] = bodies[i].mass;
        CHECK(!tire_persistent_validate(persistent, &saved, saved_mass, 9, &links, &normalized));
        live[0].inverse_mass = 1 / (current.fuel.quantity * .735 + .4);
        for (int w = 0; w < 4; ++w)
            for (int j = 0; j < 3; ++j) {
                live[5 + w].inverse_inertia_local[j] = after[w].inverse_internal[j];
                persistent[w].cached_sector_inertia[j] = current.tires[w].sectors[0][j];
            }
        CHECK(!tire_persistent_validate(persistent, &current, live, 9, &links, &normalized));
        CHECK(mechanical_prepare(bodies, live, 9, &links, &saved, &current, restored, &fuel) == 0);
        CHECK(fuel.saved.quantity == 20 && fuel.saved.quantity_rate == saved.fuel.quantity_rate);
        for (int i = 0; i < 9; ++i) {
            CHECK(restored[i].state.mass.inverse_mass == bodies[i].mass.inverse_mass);
            CHECK(restored[i].state.velocity_world[0] == 22);
            for (int j = 0; j < 3; ++j)
                CHECK(restored[i].state.mass.inverse_inertia_local[j] ==
                      bodies[i].mass.inverse_inertia_local[j]);
        }
    }
    puts("PASS consumption modes: fuel and tyre wear on/off, fresh and worn tyres, saved mass, "
         "inertia, fuel rate and velocity preserved in eight numerical cases.");
    return 0;
}

int main(void) {
    CHECK(!consumption_modes());
    MechanicalDependencies a = {0}, b;
    MechanicalLinks links = {0, {1, 2, 3, 4}, {5, 6, 7, 8}};
    RigidSavedBody saved[10] = {0};
    RigidMassProperties current[10];
    RigidPreparedBody out[10], prior[10];
    FuelPrepared fuel, oldfuel;
    a.fuel = (FuelSnapshot){13.6, -.1, .735, .4, 0};
    for (int i = 0; i < 10; i++) {
        saved[i].mass = (RigidMassProperties){1, {1, 1, 1}};
        saved[i].orientation[0] = saved[i].orientation[4] = saved[i].orientation[8] = 1;
        current[i] = saved[i].mass;
    }
    for (int w = 0; w < 4; w++) {
        a.wheels[w] = (WheelInertiaInputs){.4, .001, .036, 3.618};
        for (int j = 0; j < 3; j++)
            a.tires[w].total_table[j] = 1.f;
    }
    b = a;
    b.fuel.quantity = 8;
    for (int w = 0; w < 4; w++) {
        b.wheels[w].term_5d8 = .035;
        b.tires[w].total_table[0] = 1.25f;
    }
    WheelPreparedInertia wa[4], wb[4];
    CHECK(!wheel_prepare_inertia(a.wheels, wa));
    CHECK(!wheel_prepare_inertia(b.wheels, wb));
    for (int w = 0; w < 4; w++) {
        saved[1 + w].mass.inverse_inertia_local[0] = wa[w].inverse_axial;
        current[1 + w].inverse_inertia_local[0] = wb[w].inverse_axial;
        current[5 + w].inverse_inertia_local[0] = .8;
    }
    saved[0].mass.inverse_mass = 1 / (13.6 * .735 + .4);
    current[0].inverse_mass = 1 / (8 * .735 + .4);
    CHECK(mechanical_prepare(saved, current, 10, &links, &a, &b, out, &fuel) == MECHANICAL_OK);
    CHECK(out[4].state.mass.inverse_inertia_local[0] == wa[3].inverse_axial &&
          out[8].state.mass.inverse_inertia_local[0] == 1 && fuel.saved.quantity == 13.6);
    memset(out, 0xa5, sizeof(out));
    memcpy(prior, out, sizeof(out));
    memset(&fuel, 0xa5, sizeof(fuel));
    memcpy(&oldfuel, &fuel, sizeof(fuel));
    current[9].inverse_mass = .5;
    CHECK(mechanical_prepare(saved, current, 10, &links, &a, &b, out, &fuel) ==
          MECHANICAL_OTHER_CHANGE);
    current[9].inverse_mass = 1;
    current[4].inverse_inertia_local[2] = .9;
    CHECK(mechanical_prepare(saved, current, 10, &links, &a, &b, out, &fuel) ==
          MECHANICAL_OTHER_CHANGE);
    current[4].inverse_inertia_local[2] = 1;
    links.tires[3] = links.wheels[3];
    CHECK(mechanical_prepare(saved, current, 10, &links, &a, &b, out, &fuel) ==
          MECHANICAL_LINKS_INVALID);
    links.tires[3] = 8;
    b.wheels[3].factor_4f0 = 4;
    CHECK(mechanical_prepare(saved, current, 10, &links, &a, &b, out, &fuel) ==
          MECHANICAL_CONFIG_CHANGED);
    b.wheels[3].factor_4f0 = 3.618;
    b.tires[3].total_table[2] = NAN;
    CHECK(mechanical_prepare(saved, current, 10, &links, &a, &b, out, &fuel) ==
          MECHANICAL_DEPENDENCY_INVALID);
    b.tires[3].total_table[2] = 1;
    current[8].inverse_inertia_local[2] = 2;
    CHECK(mechanical_prepare(saved, current, 10, &links, &a, &b, out, &fuel) ==
          MECHANICAL_BODY_MISMATCH);
    CHECK(!memcmp(out, prior, sizeof(out)) && !memcmp(&fuel, &oldfuel, sizeof(fuel)));
    puts("PASS mechanical: joint fuel/wheel/tire changes, exact saved properties; unrelated "
         "changes, transverse inertia, bad links/configuration/last tire rejected without "
         "publication. No live restore.");
    return 0;
}
