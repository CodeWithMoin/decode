import pytest


@pytest.mark.asyncio
async def test_voice_range_header_passes_cors_preflight(client):
    response = await client.options(
        "/api/v1/voice/narration/example.mp3",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "range",
        },
    )

    assert response.status_code == 200
    assert "range" in response.headers["access-control-allow-headers"].lower()
