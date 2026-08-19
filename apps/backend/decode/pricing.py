"""What a run cost, in dollars.

Token counts are facts the provider reported. Cost is arithmetic Decode does on
top of them, and it is only as good as the rate table below — which is why an
unknown model returns None rather than a confident zero. A wrong price that
looks authoritative is worse than a visible gap.

Rates are USD per one million tokens, matching how every provider publishes
them. Update this table when a provider changes its pricing or a new model is
enabled; nothing else needs to change.

Not modelled yet, deliberately. Both errors run in the same direction, so a
figure here is an upper bound rather than a guess:

- Cached input tokens bill at a tenth of the rate ($0.02 against $0.20 on luna).
  The Responses API reports them, but `ProviderUsage` does not carry them yet, so
  every input token is priced at full rate. Reflection is where this bites: its
  second turn re-sends the whole conversation, which is exactly the input a cache
  would discount.
- Long-context requests bill at roughly double. Priced at the short-context rate
  regardless of how large the source was.
- Per-request and per-tool surcharges.
"""

from __future__ import annotations

from decimal import Decimal

# model name -> (input USD per 1M tokens, output USD per 1M tokens)
#
# Standard tier, short context, from developers.openai.com/api/docs/pricing as of
# 2026-08-07. Strings rather than floats because Decimal("0.20") is exact and
# Decimal(0.20) is not.
#
# A model absent from this table is recorded unpriced, which is the honest state
# rather than an outage — so all three gpt-5.6 variants are listed, not just the
# one currently configured.
RATES: dict[str, tuple[str, str]] = {
    "gpt-5.6-luna": ("0.20", "1.20"),
    "gpt-5.6-terra": ("2.00", "12.00"),
    "gpt-5.6-sol": ("5.00", "30.00"),
    # The orchestrator's chat model, so room turns count toward the daily
    # dollar limit instead of recording as unpriced.
    "gpt-5.4-mini": ("0.75", "4.50"),
}


def resolve_cost(
    reported_usd: float | None,
    model: str | None,
    input_tokens: int | None,
    output_tokens: int | None,
) -> Decimal | None:
    """The provider's own figure when it reported one, the rate table otherwise.

    A reported cost is exact where the table is an upper-bound estimate, and it
    prices models the table has never heard of — which is what makes routing
    through OpenRouter maintenance-free.
    """
    if reported_usd is not None:
        return Decimal(str(reported_usd))
    return estimate_cost(model, input_tokens, output_tokens)


def estimate_cost(
    model: str | None, input_tokens: int | None, output_tokens: int | None
) -> Decimal | None:
    """USD for one metered call, or None when it cannot be known.

    None covers three genuinely different situations that share one honest
    answer: no model ran, the run reported no token counts, or the model's rate
    is not on file. A deterministic department hits the first two and is
    correctly recorded as unpriced rather than free.
    """
    if model is None or input_tokens is None or output_tokens is None:
        return None
    rate = RATES.get(model)
    if rate is None:
        return None
    input_rate, output_rate = Decimal(rate[0]), Decimal(rate[1])
    cost = (Decimal(input_tokens) * input_rate + Decimal(output_tokens) * output_rate) / Decimal(
        1_000_000
    )
    # The column stores six decimal places; a cheap call must not round to zero
    # and disappear, so quantize at the storage precision rather than at cents.
    return cost.quantize(Decimal("0.000001"))
