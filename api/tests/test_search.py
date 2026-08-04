from datetime import datetime
from pathlib import Path
import sys
import unittest
from zoneinfo import ZoneInfo


API_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API_DIR))

from search import (
    base_terms,
    expand_with_gemini,
    extract_with_gemini,
    filter_by_temporal_window,
)
from temporal import resolve_temporal


CENTRAL = ZoneInfo("America/Chicago")
REFERENCE = datetime(2026, 8, 4, 10, 0, tzinfo=CENTRAL)


class FakeResponse:
    def __init__(self, *, parsed=None, text=""):
        self.parsed = parsed
        self.text = text


class FakeModels:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        return self.response


class FakeClient:
    def __init__(self, response):
        self.models = FakeModels(response)


class GeminiHarnessTests(unittest.TestCase):
    def test_fake_structured_output_is_resolved_deterministically(self):
        client = FakeClient(
            FakeResponse(
                parsed={
                    "keywords": ["food", "pizza"],
                    "date_phrase": "next Tuesday",
                    "time_phrase": "evening",
                }
            )
        )

        extraction = extract_with_gemini(
            "food next Tuesday evening",
            "fake-model",
            client=client,
            reference=REFERENCE,
        )

        self.assertEqual(extraction.keywords, ("food", "pizza"))
        self.assertEqual(
            extraction.temporal.window.start.isoformat(),
            "2026-08-11T17:00:00-05:00",
        )
        call = client.models.calls[0]
        self.assertEqual(
            call["config"]["response_mime_type"],
            "application/json",
        )
        self.assertIn("response_json_schema", call["config"])

    def test_malformed_model_output_fails_closed(self):
        client = FakeClient(FakeResponse(text="not valid JSON"))

        extraction = extract_with_gemini(
            "next Tuesday evening",
            "fake-model",
            client=client,
            reference=REFERENCE,
        )
        compatibility = expand_with_gemini(
            "next Tuesday evening",
            "fake-model",
            client=client,
            reference=REFERENCE,
        )

        self.assertIsNone(extraction)
        self.assertEqual(compatibility, (None, None, None))
        # The deterministic fallback remains available to the API.
        self.assertIsNotNone(
            resolve_temporal("next Tuesday evening", reference=REFERENCE)
        )

    def test_hallucinated_phrase_cannot_shift_the_query_window(self):
        client = FakeClient(
            FakeResponse(
                parsed={
                    "keywords": ["food"],
                    "date_phrase": "tomorrow",
                    "time_phrase": "evening",
                }
            )
        )

        extraction = extract_with_gemini(
            "food next Tuesday evening",
            "fake-model",
            client=client,
            reference=REFERENCE,
        )

        self.assertIsNone(extraction.date_phrase)
        self.assertEqual(
            extraction.temporal.window.start.isoformat(),
            "2026-08-11T17:00:00-05:00",
        )

    def test_temporal_words_are_not_search_terms(self):
        self.assertEqual(base_terms("next Tuesday evening"), [])
        self.assertEqual(
            base_terms("food next Tuesday evening"),
            ["food"],
        )

    def test_utc_event_is_converted_before_window_filtering(self):
        temporal = resolve_temporal(
            "next Tuesday evening",
            reference=REFERENCE,
        )
        events = [
            {
                "title": "Evening event",
                # 00:30 UTC Wednesday is 19:30 Tuesday in Chicago.
                "start": "2026-08-12T00:30:00+00:00",
            },
            {
                "title": "At exclusive end",
                "start": "2026-08-11T21:00:00-05:00",
            },
        ]

        matched = filter_by_temporal_window(events, temporal.window)

        self.assertEqual(
            [event["title"] for event in matched],
            ["Evening event"],
        )

    def test_fall_back_filter_compares_actual_instants(self):
        temporal = resolve_temporal(
            "November 1 2026 at 1:30am",
            reference=REFERENCE,
        )
        events = [
            {
                "title": "Earlier repeated hour",
                "start": "2026-11-01T01:45:00-05:00",
            },
            {
                "title": "Later repeated hour",
                "start": "2026-11-01T01:45:00-06:00",
            },
        ]

        matched = filter_by_temporal_window(events, temporal.window)

        self.assertEqual(
            [event["title"] for event in matched],
            ["Later repeated hour"],
        )


if __name__ == "__main__":
    unittest.main()
