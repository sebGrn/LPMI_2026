"""Public Coinbase market data, shared by all dashboard clients."""

import asyncio
import json
import logging
import math
import os
from contextlib import asynccontextmanager, suppress
from datetime import UTC, datetime

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from websockets.asyncio.client import connect

from history import HistoryService, Period
from assistant import AnalysisRequest, AssistantService

logger = logging.getLogger("uvicorn.error")
PRODUCTS = {
    "BTC-EUR": "Bitcoin",
    "ETH-EUR": "Ethereum",
    "SOL-EUR": "Solana",
    "ADA-EUR": "Cardano",
}
FEED_URL = "wss://ws-feed.exchange.coinbase.com"


def number(value: object) -> float | None:
    try:
        result = float(value)  # type: ignore[arg-type]
        return result if math.isfinite(result) and result >= 0 else None
    except (TypeError, ValueError, OverflowError):
        return None


class MarketFeed:
    def __init__(self) -> None:
        self.prices: dict[str, dict] = {}
        self.connected = False
        self.last_message: datetime | None = None

    def ingest(self, message: dict) -> None:
        if message.get("type") != "ticker":
            return
        product = message.get("product_id")
        price = number(message.get("price"))
        if product not in PRODUCTS or price is None or price <= 0:
            return
        opening = number(message.get("open_24h"))
        self.prices[product] = {
            "product_id": product,
            "name": PRODUCTS[product],
            "symbol": product.split("-")[0],
            "price": price,
            "change_24h": (price / opening - 1) * 100 if opening else None,
            "high_24h": number(message.get("high_24h")),
            "low_24h": number(message.get("low_24h")),
            "updated_at": datetime.now(UTC).isoformat(),
        }

    def snapshot(self) -> dict:
        fresh = self.last_message and (datetime.now(UTC) - self.last_message).total_seconds() < 30
        return {
            "source": "Coinbase Exchange",
            "currency": "EUR",
            "status": "live" if self.connected and fresh else "reconnecting",
            "coins": [self.prices[p] for p in PRODUCTS if p in self.prices],
        }

    async def run(self) -> None:
        delay = 1
        while True:
            try:
                async with connect(FEED_URL, open_timeout=15, ping_interval=20) as socket:
                    await socket.send(json.dumps({
                        "type": "subscribe",
                        "product_ids": list(PRODUCTS),
                        "channels": ["ticker", "heartbeat"],
                    }))
                    while True:
                        raw = await asyncio.wait_for(socket.recv(), timeout=35)
                        message = json.loads(raw)
                        if message.get("type") == "error":
                            raise ValueError(f"Coinbase: {message.get('message', 'subscription rejected')}")
                        self.last_message = datetime.now(UTC)
                        self.connected = True
                        delay = 1
                        self.ingest(message)
            except (OSError, TimeoutError, ValueError) as error:
                logger.warning("Flux Coinbase indisponible (%s); nouvel essai dans %ss", error, delay)
            except Exception:
                # Includes websocket closures; CancelledError propagates on shutdown.
                logger.exception("Connexion Coinbase interrompue")
            finally:
                self.connected = False
            await asyncio.sleep(delay)
            delay = min(delay * 2, 30)


def create_app(start_feed: bool = True) -> FastAPI:
    feed = MarketFeed()
    history = HistoryService()
    assistant = AssistantService()
    origins = [origin.strip() for origin in os.getenv(
        "ALLOWED_ORIGINS", "http://localhost:4200,http://127.0.0.1:4200"
    ).split(",") if origin.strip()]

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        task = asyncio.create_task(feed.run()) if start_feed else None
        try:
            yield
        finally:
            if task:
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task
            await history.close()
            await assistant.close()

    app = FastAPI(title="Crypto Dashboard API", lifespan=lifespan)
    app.state.feed = feed
    app.state.history = history
    app.state.assistant = assistant
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

    @app.get("/api/health")
    async def health():
        return {"status": "ok", "feed_status": feed.snapshot()["status"]}

    @app.get("/api/prices")
    async def prices():
        return feed.snapshot()

    @app.get("/api/history/{product}")
    async def price_history(product: str, period: Period = "day", timezone: str = "UTC"):
        if product not in PRODUCTS:
            raise HTTPException(404, "Cryptomonnaie inconnue.")
        return await history.get(product, period, timezone)

    @app.get("/api/assistant/status")
    async def assistant_status():
        return await assistant.status()

    @app.post("/api/assistant/analyze")
    async def analyze_market(body: AnalysisRequest, request: Request):
        origin = request.headers.get("origin")
        if origin and origin not in origins:
            raise HTTPException(403, "Origine non autorisée.")
        return await assistant.analyze(body, feed, history, PRODUCTS)

    @app.websocket("/ws/prices")
    async def stream(socket: WebSocket):
        if socket.headers.get("origin") not in origins:
            await socket.close(code=1008)
            return
        await socket.accept()

        async def publish():
            while True:
                await socket.send_json(feed.snapshot())
                await asyncio.sleep(1)

        async def receive():
            # Detect closed tabs immediately, even when the market is quiet.
            while True:
                await socket.receive_text()

        tasks = [asyncio.create_task(publish()), asyncio.create_task(receive())]
        try:
            done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                task.result()
        except (WebSocketDisconnect, OSError):
            pass
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

    return app


app = create_app()
