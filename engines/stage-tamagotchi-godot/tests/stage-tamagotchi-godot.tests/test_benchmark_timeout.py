"""
Tests for timeout handling in the AMADEUS Benchmark Suite.

Ensures that individual probes fail fast when they exceed their configured timeout,
preventing the entire suite from hanging.
"""

import time
import pytest

from scripts.benchmark_suite import _benchmark, _time


def test_benchmark_timeout_propagates():
    """Test that _benchmark raises TimeoutError when the probe exceeds its timeout."""
    # Create a probe that sleeps longer than the timeout
    def slow_probe():
        time.sleep(0.1)  # Sleep for 100ms
        return "done"

    # Should timeout with a 50ms timeout
    result = _benchmark("test_probe", slow_probe, timeout=0.05)
    assert result["status"] == "timeout"
    assert "exceeded" in result["detail"]


def test_time_function_timeout():
    """Test that _time raises TimeoutError when the function exceeds timeout."""
    def slow_func():
        time.sleep(0.1)
        return 42

    with pytest.raises(TimeoutError):
        _time(slow_func, timeout=0.05)


def test_benchmark_success_with_timeout():
    """Test that _benchmark succeeds when the probe completes within timeout."""
    def fast_probe():
        return "fast"

    result = _benchmark("test_probe", fast_probe, timeout=1.0)
    assert result["status"] == "ok"
    assert result["value"] is None
