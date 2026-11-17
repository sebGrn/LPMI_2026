"""Coinbase candles, paginated without truncating long histories."""

import asyncio
import calendar
import math
import time
from datetime import UTC, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
from fastapi import HTTPException

Period = Literal['day', 'week', 'month', 'year', 'max']
# All supported assets were launched after this date. Empty pages are kept scanning,
# including gaps before a pair was listed and gaps in Coinbase's historical data.
HISTORY_START = datetime(2009, 1, 1, tzinfo=UTC)
GRANULARITIES = {'day': 300, 'week': 3600, 'month': 21600, 'year': 86400, 'max': 86400}


def history_range(period: Period, timezone: str, now: datetime) -> tuple[datetime, int]:
    try:
        local = now.astimezone(ZoneInfo(timezone))
    except (ZoneInfoNotFoundError, ValueError):
        raise HTTPException(422, 'Fuseau horaire inconnu.') from None
    if period == 'day':
        start = local.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == 'week':
        start = local - timedelta(days=7)
    elif period == 'month':
        year, month = (local.year, local.month - 1) if local.month > 1 else (local.year - 1, 12)
        start = local.replace(year=year, month=month, day=min(local.day, calendar.monthrange(year, month)[1]))
    elif period == 'year':
        year = local.year - 1
        start = local.replace(year=year, day=min(local.day, calendar.monthrange(year, local.month)[1]))
    else:
        start = HISTORY_START
    return start.astimezone(UTC), GRANULARITIES[period]


def candle_windows(start: int, end: int, granularity: int):
    # Aligned, overlapping boundaries and <300 buckets respect Coinbase's limit.
    cursor = start // granularity * granularity
    while cursor < end:
        stop = min(cursor + 299 * granularity, end)
        yield cursor, stop
        cursor = stop


class HistoryService:
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=12, headers={'User-Agent': 'CryptoScope/1.0'})
        self.cache: dict[tuple, tuple[float, dict]] = {}
        self.locks: dict[tuple, asyncio.Lock] = {}
        self.request_lock = asyncio.Lock()
        self.next_request = 0.0

    async def close(self):
        await self.client.aclose()

    async def candles(self, product: str, start: int, end: int, granularity: int) -> list:
        for attempt in range(3):
            # Pace public REST requests across simultaneous dashboard clients.
            async with self.request_lock:
                await asyncio.sleep(max(0, self.next_request - time.monotonic()))
                self.next_request = time.monotonic() + 0.2
                response = await self.client.get(
                    f'https://api.exchange.coinbase.com/products/{product}/candles',
                    params={'start': datetime.fromtimestamp(start, UTC).isoformat(),
                            'end': datetime.fromtimestamp(end, UTC).isoformat(),
                            'granularity': granularity},
                )
            if response.status_code == 429 or response.status_code >= 500:
                if attempt < 2:
                    await asyncio.sleep(0.5 * (attempt + 1))
                    continue
            response.raise_for_status()
            rows = response.json()
            if not isinstance(rows, list):
                raise ValueError('Invalid Coinbase candles')
            return rows
        raise ValueError('Coinbase unavailable')

    async def get(self, product: str, period: Period, timezone: str, now: datetime | None = None) -> dict:
        now = now or datetime.now(UTC)
        start, granularity = history_range(period, timezone, now)
        # Keep the current day distinct across local midnights. Other periods use
        # short-lived rolling-window snapshots per timezone.
        key = (product, period, start.isoformat() if period == 'day' else timezone)
        async with self.locks.setdefault(key, asyncio.Lock()):
            cached = self.cache.get(key)
            if cached and cached[0] > time.monotonic():
                return cached[1]
            start_ts, end_ts = int(start.timestamp()), int(now.timestamp())
            prices: dict[int, float] = {}
            try:
                async with asyncio.timeout(60):
                    for left, right in candle_windows(start_ts, end_ts, granularity):
                        for row in await self.candles(product, left, right, granularity):
                            if not isinstance(row, list) or len(row) < 5:
                                continue
                            timestamp, price = float(row[0]), float(row[4])
                            if not math.isfinite(timestamp) or not math.isfinite(price) or price <= 0:
                                continue
                            if start_ts <= timestamp <= end_ts:
                                # A close belongs at the end of its candle. The
                                # current, incomplete candle ends at fetch time.
                                prices[min(int(timestamp) + granularity, end_ts)] = price
            except TimeoutError:
                raise HTTPException(504, 'Le chargement de l’historique a expiré. Réessayez.') from None
            except (httpx.HTTPError, ValueError, TypeError, OverflowError):
                raise HTTPException(502, 'Historique Coinbase indisponible. Réessayez dans un instant.') from None
            result = {
                'product_id': product, 'period': period, 'currency': 'EUR',
                'source': 'Coinbase Exchange', 'timezone': timezone,
                'start': start_ts, 'end': end_ts, 'granularity': granularity,
                'points': [{'time': timestamp, 'price': prices[timestamp]} for timestamp in sorted(prices)],
            }
            # No partial history is cached if any page fails.
            self.cache[key] = (time.monotonic() + (3600 if period == 'max' else 60), result)
            # Expire old day/timezone entries in a long-running development server.
            self.cache = {k: v for k, v in self.cache.items() if v[0] > time.monotonic()}
            return result
