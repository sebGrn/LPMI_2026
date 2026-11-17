import asyncio
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from history import HISTORY_START, HistoryService, candle_windows, history_range
from main import create_app


@pytest.mark.parametrize('now, expected', [
    (datetime(2026, 3, 29, 12, tzinfo=UTC), datetime(2026, 3, 28, 23, tzinfo=UTC)),
    (datetime(2026, 10, 25, 12, tzinfo=UTC), datetime(2026, 10, 24, 22, tzinfo=UTC)),
])
def test_today_starts_at_local_midnight_even_across_dst(now, expected):
    start, granularity = history_range('day', 'Europe/Paris', now)
    assert start == expected
    assert granularity == 300


def test_calendar_month_and_leap_year():
    start, _ = history_range('month', 'UTC', datetime(2026, 3, 31, 10, tzinfo=UTC))
    assert start == datetime(2026, 2, 28, 10, tzinfo=UTC)
    start, _ = history_range('year', 'UTC', datetime(2024, 2, 29, 10, tzinfo=UTC))
    assert start == datetime(2023, 2, 28, 10, tzinfo=UTC)


def test_windows_cover_a_full_year_without_exceeding_coinbase_limit():
    start = int(datetime(2025, 1, 1, tzinfo=UTC).timestamp())
    end = int(datetime(2026, 1, 1, tzinfo=UTC).timestamp())
    windows = list(candle_windows(start, end, 86400))
    assert len(windows) == 2
    assert windows[0][0] == start and windows[-1][1] == end
    assert windows[0][1] == windows[1][0]
    assert all(right - left <= 299 * 86400 for left, right in windows)


def test_http_pagination_sorts_deduplicates_filters_and_caches():
    async def run():
        service = HistoryService()
        await service.client.aclose()
        requests = []
        def respond(request):
            requests.append(request)
            left = int(datetime.fromisoformat(request.url.params['start']).timestamp())
            # Coinbase can include rows before the requested start, and duplicate boundaries.
            return httpx.Response(200, json=[
                [left + 86400, 1, 3, 1, 2, 1], [left, 1, 3, 1, 1, 1],
                [left, 1, 3, 1, 1, 1], [0, 1, 3, 1, 1, 1],
                [left, 1, 3, 1, 'NaN', 1],
            ])
        service.client = httpx.AsyncClient(transport=httpx.MockTransport(respond))
        try:
            now = datetime(2026, 1, 1, tzinfo=UTC)
            result = await service.get('BTC-EUR', 'year', 'UTC', now)
            assert len(requests) == 2
            times = [p['time'] for p in result['points']]
            assert times == sorted(set(times))
            assert len(times) == 4
            assert times[0] == int(datetime(2025, 1, 2, tzinfo=UTC).timestamp())
            assert await service.get('BTC-EUR', 'year', 'UTC', now) == result
            assert len(requests) == 2
        finally:
            await service.close()
    asyncio.run(run())


def test_max_scans_past_empty_pages_until_the_start_of_crypto_history():
    async def run():
        service = HistoryService()
        now = datetime(2026, 10, 19, tzinfo=UTC)
        end = int(now.timestamp())
        async def candles(product, left, right, granularity):
            if left == int(HISTORY_START.timestamp()) or right == end:
                return [[left, 1, 3, 1, 2, 1]]
            return []
        service.candles = AsyncMock(side_effect=candles)
        try:
            result = await service.get('BTC-EUR', 'max', 'UTC', now)
            assert service.candles.await_count > 20
            assert len(result['points']) == 2
            assert result['points'][0]['time'] == int(HISTORY_START.timestamp()) + 86400
        finally:
            await service.close()
    asyncio.run(run())


def test_failed_page_does_not_return_or_cache_a_partial_history():
    async def run():
        service = HistoryService()
        service.candles = AsyncMock(side_effect=[
            [[1735689600, 1, 3, 1, 2, 1]], httpx.ConnectError('offline'),
        ])
        try:
            with pytest.raises(HTTPException) as error:
                await service.get('BTC-EUR', 'year', 'UTC', datetime(2026, 1, 1, tzinfo=UTC))
            assert error.value.status_code == 502
            assert not service.cache
        finally:
            await service.close()
    asyncio.run(run())


def test_history_route_validates_product_period_and_timezone():
    with TestClient(create_app(start_feed=False)) as client:
        assert client.get('/api/history/UNKNOWN?period=day').status_code == 404
        assert client.get('/api/history/BTC-EUR?period=invalid').status_code == 422
        assert client.get('/api/history/BTC-EUR?period=day&timezone=Invalid/Zone').status_code == 422
