from decimal import Decimal

import pytest

from decode import pricing
from decode.config import Settings

# A rate table the test owns, so shipping or repricing a real model never
# changes what these assertions mean.
FAKE_RATES = {"test-model": ("2.00", "8.00")}


@pytest.fixture(autouse=True)
def _rates(monkeypatch):
    monkeypatch.setattr(pricing, "RATES", FAKE_RATES)


def test_cost_is_the_published_rate_per_million():
    # 500k in at $2/M plus 100k out at $8/M.
    assert pricing.estimate_cost("test-model", 500_000, 100_000) == Decimal("1.800000")


def test_a_cheap_call_does_not_round_away():
    # Sub-cent calls are the common case; rounding to cents would store zero and
    # make a real spend invisible.
    assert pricing.estimate_cost("test-model", 10, 0) == Decimal("0.000020")


@pytest.mark.parametrize(
    "model, input_tokens, output_tokens",
    [
        ("unpriced-model", 100, 100),  # rate not on file
        (None, 100, 100),  # no model ran
        ("test-model", None, None),  # nothing metered
    ],
)
def test_unknown_price_is_none_never_zero(model, input_tokens, output_tokens):
    # Zero would claim the run was free. These three cases are all "we cannot
    # say", which has to stay distinguishable from a genuinely free fixture run.
    assert pricing.estimate_cost(model, input_tokens, output_tokens) is None


def test_the_configured_model_has_a_rate(monkeypatch):
    # Switching DECODE_OPENAI_MODEL to something absent from RATES would silently
    # stop pricing every run. Nothing else would break, which is what makes it
    # worth failing here instead.
    monkeypatch.undo()
    assert Settings().openai_model in pricing.RATES


def test_no_credit_conversion_is_performed():
    # Section 26 of the foundation plan records provider usage only: dollars are
    # a fact, credits are a product decision that does not exist yet.
    assert not hasattr(pricing, "credits")
