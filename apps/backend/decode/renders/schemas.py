from pydantic import BaseModel


class StartRender(BaseModel):
    """Scene data the renderer needs. A complete cut as JSON."""
    scenes: list[dict]
    visual_pick: dict[int, str] = {}


class RenderResponse(BaseModel):
    render_id: str
    status: str
