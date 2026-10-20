from contextlib import nullcontext
import io
import json
import struct
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from sector.research import capture_reset_incident as incident
from sector.research.capture_reset_incident import sample


class IncidentCaptureTests(unittest.TestCase):
    def setUp(self):
        self.base, self.owner, self.physics, self.vehicle = (
            0x140000000,
            0x200000,
            0x300000,
            0x400000,
        )
        self.score = self.vehicle + 0x1CEC8
        self.regions = {}
        self.put(self.base + 0x1E194C8, "<Q", self.owner)
        self.put(self.owner + 0x159A8, "<Q", self.physics)
        self.put(self.owner, "<Q", self.vehicle)
        self.put(self.physics + 0x4BC0, "<Q", self.vehicle)
        self.put(self.score, "<Q", self.owner)
        for offset in (0x23F8, 0x2410):
            self.put(self.physics + offset, "<3Q", 0, 0, 0)
        self.put(self.physics + 0x2640, "<3Q", 0x500000, 0x500038, 0x500070)
        self.put(0x500000, "<Q6d", 0x600000, 1, 2, 3, 4, 5, 6)
        self.put(self.score + 0x18, "<i", 2)
        self.put(self.score + 0x160, "<i", 1)
        self.put(self.score + 0x164, "<B", 1)
        self.regions[self.score + 0x27260] = bytes(0x158)
        for corner in range(4):
            wheel = self.physics + 0x618 + corner * 0x6B0
            self.put(wheel + 0x300, "<3B", 0, int(corner == 0), 0)
            for offset in (0x1D0, 0x1D8, 0x3E8):
                self.put(wheel + offset, "<Q", 0x700000 + offset + corner * 0x1000)
            self.regions[wheel + 0x308] = bytes(32)

    def put(self, address, fmt, *values):
        self.regions[address] = struct.pack(fmt, *values)

    def read(self, address, size):
        for start, data in self.regions.items():
            if start <= address and address + size <= start + len(data):
                return data[address - start : address - start + size]
        raise AssertionError(f"Unexpected read at {address:x}, size {size}")

    def test_detachment_and_native_backup_are_observed_without_mutating_memory(self):
        before = self.regions.copy()
        result = sample(self.read, self.base)
        self.assertEqual(result["wheels"][0]["flags_300_302"], [0, 1, 0])
        self.assertEqual(len(result["suspension_backups"]["entries"]), 1)
        self.assertEqual(result["scoring"]["count_lap"], 1)
        self.assertLess(result["bytes_read"], 32768)
        self.assertEqual(before, self.regions)

    def test_bad_vector_rejected_before_reading_entries(self):
        for end in (0x500001, 0x500000 + 65 * 56):
            with self.subTest(end=end):
                self.put(self.physics + 0x2640, "<3Q", 0x500000, end, end)
                with self.assertRaisesRegex(ValueError, "vector bounds"):
                    sample(self.read, self.base)

    def test_owner_change_cannot_be_reported_as_a_valid_sample(self):
        calls = 0

        def changing(address, size):
            nonlocal calls
            if address == self.base + 0x1E194C8:
                calls += 1
                if calls > 1:
                    return struct.pack("<Q", self.owner + 8)
            return self.read(address, size)

        with self.assertRaisesRegex(ValueError, "ownership changed"):
            sample(changing, self.base)

    def test_short_reads_rejected(self):
        with self.assertRaisesRegex(ValueError, "Incomplete"):
            sample(lambda address, size: b"", self.base)

    def test_context_timeout_skips_reads_until_context_is_verified_again(self):
        output = io.StringIO()
        kernel = SimpleNamespace(OpenProcess=Mock(return_value=1), CloseHandle=Mock())
        fetch = Mock(
            side_effect=[
                TimeoutError("UI endpoint stalled"),
                {
                    "state": {
                        "appBuild": 14200,
                        "settingMode": "SETTING_GRANDPRIX",
                        "gameSession": "PRACTICE1",
                    }
                },
            ]
        )
        dependencies = {
            "sector.observers.run_physics_observer": SimpleNamespace(
                k=kernel,
                modules=Mock(return_value=[{"name": "Le Mans Ultimate.exe", "base": self.base}]),
                read_process=Mock(),
            ),
            "sector.telemetry.capture_preparation_steam25661166": SimpleNamespace(
                verify_telemetry=Mock()
            ),
            "sector.telemetry.capture_context": SimpleNamespace(get_json=fetch),
        }

        def observed(*args):
            self.assertEqual(fetch.call_count, 2)
            return {"verified": True}

        with (
            patch.dict(sys.modules, dependencies),
            patch.object(
                sys,
                "argv",
                ["capture", "--pid", "123", "--output", "unused.jsonl", "--seconds", "1"],
            ),
            patch.object(incident.Path, "mkdir"),
            patch.object(incident.Path, "open", return_value=nullcontext(output)),
            patch.object(incident.time, "monotonic", side_effect=[0, 0, 0, 0.2, 0.2, 0.2, 0.2, 2]),
            patch.object(incident.time, "sleep"),
            patch.object(incident, "sample", side_effect=observed) as reader,
            patch("builtins.print"),
        ):
            incident.main()
        rows = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["context_unavailable"], "UI endpoint stalled")
        self.assertNotIn("sample", rows[0])
        self.assertEqual(rows[1]["sample"], {"verified": True})
        reader.assert_called_once()
        kernel.CloseHandle.assert_called_once_with(1)


if __name__ == "__main__":
    unittest.main()
