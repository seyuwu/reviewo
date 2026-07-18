from collections import deque
from datetime import UTC, datetime, timedelta
from threading import Lock


class HourlyRateLimiter:
    """In-memory sliding window: max N welcomes per hour."""

    def __init__(self, max_per_hour: int) -> None:
        self._max_per_hour = max_per_hour
        self._timestamps: deque[datetime] = deque()
        self._lock = Lock()

    def allow(self) -> bool:
        if self._max_per_hour <= 0:
            return False

        now = datetime.now(UTC)
        cutoff = now - timedelta(hours=1)

        with self._lock:
            while self._timestamps and self._timestamps[0] < cutoff:
                self._timestamps.popleft()

            if len(self._timestamps) >= self._max_per_hour:
                return False

            self._timestamps.append(now)
            return True
