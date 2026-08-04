from collections.abc import Mapping
from typing import Any, Protocol


class Renderer(Protocol):
    """Future renderer boundary; the walking skeleton has no adapter or endpoint."""

    async def render(self, specification: Mapping[str, Any]) -> Mapping[str, Any]: ...
