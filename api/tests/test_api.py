from datetime import datetime
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from zoneinfo import ZoneInfo


API_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API_DIR))

import api as api_module
from temporal import resolve_temporal


CENTRAL = ZoneInfo("America/Chicago")
REFERENCE = datetime(2026, 8, 4, 10, 0, tzinfo=CENTRAL)


class SearchApiContractTests(unittest.TestCase):
    def test_pure_temporal_query_exposes_combined_window(self):
        temporal = resolve_temporal(
            "next Tuesday evening",
            reference=REFERENCE,
        )
        events = [
            {
                "url": "https://example.test/evening",
                "title": "Evening event",
                "start": "2026-08-12T00:30:00+00:00",
            },
            {
                "url": "https://example.test/late",
                "title": "Late event",
                "start": "2026-08-11T21:00:00-05:00",
            },
        ]

        original_events = api_module._events
        api_module._events = events
        try:
            with patch.object(
                api_module,
                "resolve_temporal",
                return_value=temporal,
            ):
                response = api_module.search_events(
                    q="next Tuesday evening",
                    top=10,
                    model="unused",
                    no_llm=True,
                )
        finally:
            api_module._events = original_events

        self.assertEqual(response["terms"], [])
        self.assertEqual(response["count"], 1)
        self.assertEqual(
            response["temporal_window"],
            {
                "start": "2026-08-11T17:00:00-05:00",
                "end": "2026-08-11T21:00:00-05:00",
                "timezone": "America/Chicago",
                "end_exclusive": True,
            },
        )

    def test_openapi_search_parameters_name_gemini(self):
        parameters = api_module.app.openapi()["paths"]["/search"]["get"]["parameters"]
        descriptions = {
            parameter["name"]: parameter["description"]
            for parameter in parameters
        }

        self.assertIn("Gemini", descriptions["model"])
        self.assertIn("Gemini", descriptions["no_llm"])
        self.assertNotIn("Ollama", descriptions["model"])
        self.assertNotIn("Ollama", descriptions["no_llm"])


if __name__ == "__main__":
    unittest.main()
