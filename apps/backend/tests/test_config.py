import pytest
from pydantic import ValidationError

from decode.config import Settings


def test_production_requires_explicit_trusted_access_boundary():
    with pytest.raises(ValidationError):
        Settings(environment="production", trusted_access_boundary_confirmed=False)
    assert Settings(
        environment="production", trusted_access_boundary_confirmed=True
    ).trusted_access_boundary_confirmed
