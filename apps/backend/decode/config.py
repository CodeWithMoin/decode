from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="DECODE_", env_file=".env", extra="ignore")
    database_url: str = "sqlite+aiosqlite:///./decode.db"
    redis_url: str = "redis://localhost:6379/0"
    frontend_origin: str = "http://localhost:3000"
    actor_id: str = "internal-private-beta-user"
    object_store: str = "local"
    # One switch per department, named for the department rather than the crew
    # role it presents as. Eight departments present as five crew roles, so crew
    # names cannot address them one to one — Visualizer and Renderer are both
    # Motion Designer.
    intake: str = "fake"
    architect: str = "fake"
    author: str = "fake"
    visualizer: str = "fake"
    voice: str = "fake"
    # Use the model when credentials are present, otherwise keep local/test
    # environments deterministic without an extra switch.
    orchestrator: str = "auto"
    evaluator: str = "fake"
    openai_api_key: str | None = None
    openai_model: str = "gpt-5.6-luna"
    # The side chat answers a human mid-thought; routing a message to one tool
    # does not need the scene-authoring model, it needs to be quick. Overridable
    # via DECODE_ORCHESTRATOR_MODEL.
    orchestrator_model: str = "gpt-5.4-mini"
    # Any OpenAI-compatible endpoint (e.g. DeepSeek) — set DECODE_OPENAI_BASE_URL
    # and point openai_model at that provider's model. None = OpenAI's default.
    openai_base_url: str | None = None
    # Evaluation is a separate model call with a separate quality/cost profile.
    # It may share credentials without coupling its model choice to generation.
    openai_evaluator_model: str = "gpt-5.6-luna"
    # Absent keys mean tracing is off, which is the normal case for tests and
    # for a dev loop that is not working on prompts. Points at the opt-in stack
    # in compose.langfuse.yaml, never at Langfuse Cloud by default: traces carry
    # the creator's source material.
    #
    # DECODE_-prefixed like every other setting. Langfuse's UI hands you the bare
    # LANGFUSE_PUBLIC_KEY name, so the keys need renaming when you paste them.
    langfuse_public_key: str | None = None
    langfuse_secret_key: str | None = None
    langfuse_host: str = "http://localhost:3001"
    local_object_root: Path = Path(".data/objects")
    max_source_bytes: int = 25 * 1024 * 1024
    upload_stale_seconds: int = 300
    environment: str = "development"
    trusted_access_boundary_confirmed: bool = False
    r2_endpoint_url: str | None = None
    r2_access_key_id: str | None = None
    r2_secret_access_key: str | None = None
    r2_bucket: str | None = None
    fish_audio_api_key: str | None = None
    fish_audio_base_url: str = "https://api.fish.audio"
    fish_audio_reference_id: str | None = None
    # The TTS backbone Fish Audio selects, sent as the `model` header.
    # `s2.1-pro-free` is the free tier; paid keys can use `s2-pro` or `s1`.
    fish_audio_model: str = "s2.1-pro-free"
    render_output_dir: str = "apps/frontend/public/renders"
    render_script_path: str = "scripts/render-video.ts"
    render_cwd: str = "apps/frontend"
    render_node_bin: str = "npx"
    render_timeout_seconds: int = 300
    render_fps: int = 24  # HyperFrames export frame rate (matches DECODE_FPS)

    @model_validator(mode="after")
    def require_private_production_boundary(self):
        if self.environment == "production" and not self.trusted_access_boundary_confirmed:
            raise ValueError(
                "Production startup requires DECODE_TRUSTED_ACCESS_BOUNDARY_CONFIRMED=true"
            )
        return self

    @property
    def sync_database_url(self) -> str:
        return self.database_url.replace("+asyncpg", "+psycopg").replace("+aiosqlite", "")


@lru_cache
def get_settings() -> Settings:
    return Settings()
