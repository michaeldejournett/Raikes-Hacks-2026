from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
import unittest
from zoneinfo import ZoneInfo


API_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API_DIR))

from temporal import resolve_temporal, strip_temporal_phrases


CENTRAL = ZoneInfo("America/Chicago")
REFERENCE = datetime(2026, 8, 4, 10, 0, tzinfo=CENTRAL)


class TemporalResolverTests(unittest.TestCase):
    def test_next_tuesday_evening_is_explicit_central_window(self):
        result = resolve_temporal(
            "next Tuesday evening",
            reference=REFERENCE,
        )

        self.assertIsNotNone(result)
        self.assertEqual(
            result.window.start.isoformat(),
            "2026-08-11T17:00:00-05:00",
        )
        self.assertEqual(
            result.window.end.isoformat(),
            "2026-08-11T21:00:00-05:00",
        )
        self.assertEqual(result.window.timezone, "America/Chicago")
        self.assertEqual(
            result.window.as_dict()["end_exclusive"],
            True,
        )

    def test_subject_survives_when_temporal_phrases_are_removed(self):
        self.assertEqual(
            strip_temporal_phrases("food next Tuesday evening"),
            "food",
        )

    def test_next_weekend_is_distinct_from_this_weekend(self):
        this_weekend = resolve_temporal("this weekend", reference=REFERENCE)
        next_weekend = resolve_temporal("next weekend", reference=REFERENCE)

        self.assertEqual(
            this_weekend.window.start.isoformat(),
            "2026-08-08T00:00:00-05:00",
        )
        self.assertEqual(
            next_weekend.window.start.isoformat(),
            "2026-08-15T00:00:00-05:00",
        )

    def test_reference_is_converted_to_central_before_relative_math(self):
        utc_reference = datetime(
            2026,
            8,
            4,
            0,
            30,
            tzinfo=ZoneInfo("UTC"),
        )
        result = resolve_temporal("tomorrow morning", reference=utc_reference)

        # 00:30 UTC on August 4 is still August 3 in Chicago.
        self.assertEqual(
            result.window.start.isoformat(),
            "2026-08-04T06:00:00-05:00",
        )

    def test_nonexistent_spring_time_shifts_forward(self):
        result = resolve_temporal(
            "March 8 2026 at 2:30am",
            reference=REFERENCE,
        )

        self.assertEqual(
            result.window.start.isoformat(),
            "2026-03-08T03:30:00-05:00",
        )
        self.assertEqual(
            result.window.end.isoformat(),
            "2026-03-08T04:30:00-05:00",
        )
        self.assertEqual(
            result.window.start.astimezone(timezone.utc).isoformat(),
            "2026-03-08T08:30:00+00:00",
        )
        self.assertGreater(
            result.window.end.astimezone(timezone.utc),
            result.window.start.astimezone(timezone.utc),
        )

    def test_ambiguous_fall_time_uses_later_occurrence(self):
        result = resolve_temporal(
            "November 1 2026 at 1:30am",
            reference=REFERENCE,
        )

        self.assertEqual(
            result.window.start.isoformat(),
            "2026-11-01T01:30:00-06:00",
        )
        self.assertEqual(
            result.window.start.astimezone(timezone.utc).isoformat(),
            "2026-11-01T07:30:00+00:00",
        )
        self.assertEqual(
            result.window.end.astimezone(timezone.utc).isoformat(),
            "2026-11-01T08:30:00+00:00",
        )

    def test_overnight_range_advances_end_date(self):
        result = resolve_temporal(
            "February 2 2026 from 11pm to 1am",
            reference=REFERENCE,
        )

        self.assertEqual(
            result.window.start.isoformat(),
            "2026-02-02T23:00:00-06:00",
        )
        self.assertEqual(
            result.window.end.isoformat(),
            "2026-02-03T01:00:00-06:00",
        )
        self.assertEqual(
            result.window.end.astimezone(timezone.utc)
            - result.window.start.astimezone(timezone.utc),
            timedelta(hours=2),
        )


if __name__ == "__main__":
    unittest.main()
