import pytest
import asyncio
from unittest.mock import MagicMock, patch

from scripts.benchmark_suite import _benchmark


class TestBenchmarkRetry:
    @pytest.mark.asyncio
    async def test_retry_mechanism_triggers_on_timeout(self):
        # Mock a function that times out on first call, succeeds on second
        call_count = 0
        
        def flaky_function():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise TimeoutError()
            return "success"
        
        # Run with retry enabled
        result = _benchmark(
            "test_retry",
            flaky_function,
            samples=1,
            timeout=0.1,
            max_retries=1
        )
        
        assert result["status"] == "ok"
        assert result["value"] == "success"
        assert call_count == 2

    @pytest.mark.asyncio
    async def test_retry_exhaustion_returns_timeout(self):
        # Mock a function that always times out
        def failing_function():
            raise TimeoutError()
        
        result = _benchmark(
            "test_retry_exhaust",
            failing_function,
            samples=1,
            timeout=0.1,
            max_retries=2
        )
        
        assert result["status"] == "timeout"
        assert "exceeded" in result["detail"] and "attempts" in result["detail"]