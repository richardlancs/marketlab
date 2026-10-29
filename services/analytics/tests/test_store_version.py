"""Next.js recalculates a stored profile whose version isn't its own, so the two must match."""

import re
from pathlib import Path

from analytics import store


def test_next_knows_the_analytics_version():
    source = (Path(__file__).parents[3] / "lib" / "analytics" / "profile.ts").read_text()
    match = re.search(r'export const ANALYTICS_VERSION = "([^"]+)"', source)
    assert match and match.group(1) == store.ANALYTICS_VERSION
