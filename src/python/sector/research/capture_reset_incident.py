"""Bounded, read-only wheel-attachment and scoring observations for Steam 25661166.

Samples are asynchronous diagnostics, not atomic checkpoints. This module never
loads a DLL, invokes a game function or writes to the game process.
"""

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import struct
import time


def sample(read_process, base):
    """Read only named player links and bounded vectors; accept no raw addresses."""
    consumed = 0

    def raw(address, size):
        nonlocal consumed
        if (
            not 0x10000 <= address < 0x800000000000
            or not 0 < size <= 4096
            or address + size > 0x800000000000
            or consumed + size > 32768
        ):
            raise ValueError("Incident read budget or address rejected")
        consumed += size
        value = read_process(address, size)
        if len(value) != size:
            raise ValueError("Incomplete incident read")
        return value

    def unpack(address, fmt):
        return struct.unpack(fmt, raw(address, struct.calcsize(fmt)))

    def ptr(address):
        return unpack(address, "<Q")[0]

    def vector(address, stride):
        begin, end, capacity = unpack(address, "<3Q")
        if begin == end == capacity == 0:
            return {"storage": [0, 0, 0], "entries": []}
        if (
            not 0x10000 <= begin <= end <= capacity < 0x800000000000
            or (end - begin) % stride
            or (capacity - begin) % stride
            or (capacity - begin) // stride > 64
        ):
            raise ValueError("Incident vector bounds rejected")
        rows = [raw(address, stride).hex() for address in range(begin, end, stride)]
        if [begin, end, capacity] != list(unpack(address, "<3Q")):
            raise ValueError("Incident vector changed during sample")
        return {"storage": [begin, end, capacity], "entries": rows}

    owner = ptr(base + 0x1E194C8)
    physics = ptr(owner + 0x159A8)
    vehicle = ptr(physics + 0x4BC0)
    score = vehicle + 0x1CEC8
    if ptr(score) != owner or ptr(owner) != vehicle:
        raise ValueError("Incident ownership mismatch")
    result = {
        "owner": owner,
        "physics": physics,
        "vehicle": vehicle,
        "bodies": vector(physics + 0x23F8, 8),
        "constraints": vector(physics + 0x2410, 8),
        # ECFA80 appends a constraint pointer and six parameters here.
        # ECF930 restores those parameters and removes the 56-byte entry.
        "suspension_backups": vector(physics + 0x2640, 56),
        "wheels": [],
        "scoring": {
            "sector": unpack(score + 0x18, "<i")[0],
            "count_lap": unpack(score + 0x160, "<i")[0],
            "next_timed": raw(score + 0x164, 1)[0],
            "off_track": raw(score + 0x272B8, 1)[0],
            # Preserve unknown fields by offset, without assigning guessed meanings.
            "window_27260": raw(score + 0x27260, 0x158).hex(),
        },
    }
    for corner in range(4):
        wheel = physics + 0x618 + corner * 0x6B0
        result["wheels"].append(
            {
                "flags_300_302": list(raw(wheel + 0x300, 3)),
                "body": ptr(wheel + 0x1D0),
                "hub": ptr(wheel + 0x1D8),
                "tire": ptr(wheel + 0x3E8),
                "deformation": raw(wheel + 0x308, 32).hex(),
            }
        )
    if (
        ptr(base + 0x1E194C8) != owner
        or ptr(owner + 0x159A8) != physics
        or ptr(physics + 0x4BC0) != vehicle
        or ptr(owner) != vehicle
        or ptr(score) != owner
    ):
        raise ValueError("Incident ownership changed during sample")
    result["bytes_read"] = consumed
    return result


def main():
    # Windows dependencies stay outside the pure reader for fixture testing.
    from sector.observers.run_physics_observer import k, modules, read_process
    from sector.telemetry.capture_preparation_steam25661166 import verify_telemetry
    from sector.telemetry.capture_context import get_json

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pid", type=int, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--seconds", type=int, default=600)
    args = parser.parse_args()
    if not 1 <= args.seconds <= 1800:
        parser.error("Duration must be between 1 and 1800 seconds")
    verify_telemetry(args.pid)
    loaded = modules(args.pid)
    if any("easyanti" in item["name"].lower() for item in loaded):
        raise ValueError("EAC detected; incident capture refused")
    base = next(item["base"] for item in loaded if item["name"].lower() == "le mans ultimate.exe")
    handle = k.OpenProcess(0x410, False, args.pid)
    if not handle:
        raise OSError("Read-only process access denied")
    try:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("x", encoding="utf-8") as output:
            deadline = time.monotonic() + args.seconds
            next_context = 0
            print("Read-only wheel/scoring incident capture active.", flush=True)
            while time.monotonic() < deadline:
                started = time.monotonic()
                if started >= next_context:
                    next_context = started + 1
                    state = get_json("/navigation/state")["state"]
                    if (
                        state.get("appBuild") != 14200
                        or state.get("settingMode") != "SETTING_GRANDPRIX"
                        or state.get("gameSession")
                        not in ("PRACTICE1", "PRACTICE2", "PRACTICE3", "PRACTICE4")
                        or any("easyanti" in m["name"].lower() for m in modules(args.pid))
                    ):
                        raise ValueError("Offline Practice context lost; capture stopped")
                row = {"utc": datetime.now(timezone.utc).isoformat(), "writes": 0}
                try:
                    row["sample"] = sample(
                        lambda addr, size: read_process(handle, addr, size), base
                    )
                except (OSError, ValueError) as error:
                    row["error"] = str(error)
                row["duration_ms"] = round((time.monotonic() - started) * 1000, 3)
                output.write(json.dumps(row, allow_nan=False) + "\n")
                output.flush()
                time.sleep(max(0, 0.1 - (time.monotonic() - started)))
    finally:
        k.CloseHandle(handle)


if __name__ == "__main__":
    main()
