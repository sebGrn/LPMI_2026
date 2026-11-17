from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
import pytest

from main import MarketFeed, create_app


def ticker(**overrides):
    return {"type": "ticker", "product_id": "BTC-EUR", "price": "60000",
            "open_24h": "50000", "high_24h": "61000", "low_24h": "49000", **overrides}


def test_ticker_conversion_and_change():
    feed = MarketFeed()
    feed.ingest(ticker())
    coin = feed.snapshot()["coins"][0]
    assert coin["price"] == 60000
    assert coin["change_24h"] == pytest.approx(20)
    assert coin["symbol"] == "BTC"


@pytest.mark.parametrize("price", ["NaN", "Infinity", "invalid", None, "-2", "0"])
def test_invalid_prices_are_not_broadcast(price):
    feed = MarketFeed()
    feed.ingest(ticker(price=price))
    assert feed.snapshot()["coins"] == []


def test_missing_opening_and_unknown_product():
    feed = MarketFeed()
    feed.ingest(ticker(product_id="UNKNOWN-EUR"))
    assert feed.snapshot()["coins"] == []
    feed.ingest(ticker(open_24h="0"))
    assert feed.snapshot()["coins"][0]["change_24h"] is None


def test_stale_feed_keeps_last_prices_but_is_not_live():
    feed = MarketFeed()
    feed.ingest(ticker())
    feed.connected = True
    feed.last_message = datetime.now(UTC)
    assert feed.snapshot()["status"] == "live"
    feed.last_message -= timedelta(seconds=40)
    assert feed.snapshot()["status"] == "reconnecting"
    assert len(feed.snapshot()["coins"]) == 1


def test_http_and_websocket_share_snapshot():
    app = create_app(start_feed=False)
    app.state.feed.ingest(ticker())
    with TestClient(app) as client:
        assert client.get("/api/health").json()["status"] == "ok"
        expected = client.get("/api/prices").json()
        with client.websocket_connect("/ws/prices", headers={"origin": "http://localhost:4200"}) as socket:
            assert socket.receive_json() == expected


def test_websocket_rejects_unknown_origins():
    with TestClient(create_app(start_feed=False)) as client:
        with pytest.raises(WebSocketDisconnect) as error:
            with client.websocket_connect("/ws/prices", headers={"origin": "https://example.com"}):
                pass
        assert error.value.code == 1008
