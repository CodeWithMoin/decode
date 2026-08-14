"""Decode's departments — the craft, not the plumbing.

Each subpackage is one department: its own prompts, tools and skills, behind the
single contract in `contracts.py`. Vendor adapters (object storage, the renderer
port) live in `providers/` instead, because they are how Decode talks to other
systems rather than what Decode knows how to do.

This module is the public surface. Import from here, not from the file layout,
so departments can be reorganised without touching call sites.
"""

from .contracts import SourceInput

# The factories are deliberately not re-exported here. `architect` is also the
# name of a subpackage, and once that is imported the module shadows the
# function — silently, and only for one of them. Import from .registry instead.
__all__ = ["SourceInput"]
