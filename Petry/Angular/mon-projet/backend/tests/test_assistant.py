import asyncio
import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from assistant import AnalysisRequest, AssistantService, summarize_history
from main import create_app


def history(prices=(100, 120, 90)):
    now = int(datetime.now(UTC).timestamp())
    return {'granularity': 21600, 'points': [
        {'time': now - (len(prices) - 1 - i) * 21600, 'price': price}
        for i, price in enumerate(prices)
    ]}


def test_metrics_are_calculated_from_closes():
    data = summarize_history(history())
    assert data['return_pct'] == -10
    assert data['max_drawdown_pct'] == 25
    assert data['samples'] == 3
    assert data['gap_count'] == 0
    assert data['volatility_pct_per_interval'] > 0


def test_insufficient_history_is_marked_unavailable():
    assert not summarize_history(history((100,)))['available']
    assert not summarize_history(history(()))['available']


def test_gaps_are_reported():
    data = history()
    data['points'][-1]['time'] += 21600
    assert summarize_history(data)['gap_count'] == 1


def test_ollama_unavailable_is_a_friendly_status():
    async def run():
        service = AssistantService()
        await service.client.aclose()
        def offline(request):
            raise httpx.ConnectError('offline')
        service.client = httpx.AsyncClient(base_url='http://ollama.test', transport=httpx.MockTransport(offline))
        try:
            assert not (await service.status())['available']
        finally:
            await service.close()
    asyncio.run(run())


def test_analysis_sends_server_evidence_and_flags_old_quotes():
    async def run():
        service = AssistantService()
        await service.client.aclose()
        captured = []
        def respond(request):
            if request.url.path == '/api/tags':
                return httpx.Response(200, json={'models': [{'name': service.model}]})
            if request.url.path == '/api/show':
                return httpx.Response(200, json={'capabilities': ['completion'], 'thinking': {'values': [False]}})
            body = json.loads(request.content)
            captured.append(body)
            return httpx.Response(200, json={
                'done': True, 'message': {'content': 'BTC a reculé de 10 % sur les clôtures observées.'},
                'done_reason': 'stop',
            })
        service.client = httpx.AsyncClient(base_url='http://ollama.test', transport=httpx.MockTransport(respond))
        old = (datetime.now(UTC) - timedelta(minutes=10)).isoformat()
        feed = SimpleNamespace(snapshot=lambda: {'status': 'live', 'coins': [
            {'product_id': 'BTC-EUR', 'price': 90, 'updated_at': old, 'change_24h': -5},
        ]})
        histories = SimpleNamespace(get=AsyncMock(side_effect=[history(), HTTPException(502, 'Historique absent.')]))
        try:
            result = await service.analyze(AnalysisRequest(question='Compare les risques.'), feed, histories,
                                           {'BTC-EUR': 'Bitcoin', 'ETH-EUR': 'Ethereum'})
            assert result['evidence']['assets'][0]['last_quote']['stale']
            assert not result['evidence']['assets'][1]['history']['available']
            assert result['answer'].startswith('BTC')
            payload = captured[0]
            assert payload['stream'] is False and payload['think'] is False
            data = json.loads(payload['messages'][1]['content'])
            assert data['tracker_data']['source'] == 'Coinbase Exchange'
            assert data['tracker_data']['assets'][0]['history']['return_pct'] == -10
        finally:
            await service.close()
    asyncio.run(run())


def test_no_history_prevents_unsupported_analysis():
    async def run():
        service = AssistantService()
        service.status = AsyncMock(return_value={'available': True})
        histories = SimpleNamespace(get=AsyncMock(return_value=history(())))
        feed = SimpleNamespace(snapshot=lambda: {'status': 'reconnecting', 'coins': []})
        try:
            with pytest.raises(HTTPException) as error:
                await service.analyze(AnalysisRequest(question='Analyse le marché.'), feed, histories, {'BTC-EUR': 'Bitcoin'})
            assert error.value.status_code == 503
        finally:
            await service.close()
    asyncio.run(run())


def test_busy_model_does_not_queue_unlimited_requests():
    async def run():
        service = AssistantService()
        try:
            async with service.busy:
                with pytest.raises(HTTPException) as error:
                    await service.analyze(AnalysisRequest(question='Analyse le marché.'), None, None, {})
                assert error.value.status_code == 429
        finally:
            await service.close()
    asyncio.run(run())


def test_assistant_route_validates_body_and_origin():
    with TestClient(create_app(start_feed=False)) as client:
        assert client.post('/api/assistant/analyze', json={'question': ' ' * 4}).status_code == 422
        assert client.post('/api/assistant/analyze', json={'question': 'Compare.', 'period': 'invalid'}).status_code == 422
        assert client.post('/api/assistant/analyze', json={'question': 'Compare.', 'model': 'external'}).status_code == 422
        assert client.post('/api/assistant/analyze', headers={'origin': 'https://example.com'}, json={'question': 'Compare.'}).status_code == 403


def test_thinking_only_model_is_not_mistaken_for_a_direct_answer_model():
    async def run():
        service = AssistantService()
        await service.client.aclose()
        def respond(request):
            if request.url.path == '/api/tags':
                return httpx.Response(200, json={'models': [{'name': service.model}]})
            return httpx.Response(200, json={'capabilities': ['completion', 'thinking'], 'thinking': {'values': [True]}})
        service.client = httpx.AsyncClient(base_url='http://ollama.test', transport=httpx.MockTransport(respond))
        try:
            state = await service.status()
            assert not state['available']
            assert 'Instruct' in state['message']
        finally:
            await service.close()
    asyncio.run(run())
