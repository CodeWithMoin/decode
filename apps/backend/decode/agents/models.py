"""Model definitions — one line per model, run through OpenRouter.

OpenRouter is the single gateway: one endpoint (Chat Completions), one key, every
non-OpenAI model as a plain id string. Adding Kimi K3 / DeepSeek / Claude is a new
entry in `MODELS`, never new code. Per-model quirks (temperature, whether the model
does structured output) live on the definition.

The OpenAI Responses-API path (agent_runtime / evaluator) stays for now; roles move
onto OpenRouter one at a time. The vision judge is the first consumer.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..config import Settings


@dataclass(frozen=True)
class ModelDef:
    # OpenRouter id, e.g. "google/gemini-2.5-flash", "anthropic/claude-...", "moonshotai/kimi-k3".
    model: str
    temperature: float | None = None


def models(settings: Settings) -> dict[str, ModelDef]:
    """The role → model table. One line per role; grow it as roles move to OpenRouter."""
    return {
        "vision": ModelDef(settings.vision_model),
    }


def openrouter_client(settings: Settings):
    from openai import AsyncOpenAI

    return AsyncOpenAI(api_key=settings.openrouter_api_key, base_url=settings.openrouter_base_url)


async def structured_chat(
    settings: Settings,
    defn: ModelDef,
    *,
    system: str,
    text: str,
    image_data_urls: list[str] | None,
    schema: type,
):
    """One Chat-Completions call with structured output, via OpenRouter. Returns the
    validated Pydantic object (`schema`). Images use the Chat-Completions image shape
    (`image_url`), not the Responses `input_image` shape."""
    client = openrouter_client(settings)
    content: list[dict] = [{"type": "text", "text": text}]
    for url in image_data_urls or []:
        content.append({"type": "image_url", "image_url": {"url": url}})
    kwargs: dict = {}
    if defn.temperature is not None:
        kwargs["temperature"] = defn.temperature
    response = await client.chat.completions.parse(
        model=defn.model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": content},
        ],
        response_format=schema,
        **kwargs,
    )
    return response.choices[0].message.parsed
