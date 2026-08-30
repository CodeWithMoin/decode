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
    # "auto" follows the Visualizer provider so an existing real-renderer
    # deployment cannot silently gain fixture direction after an upgrade.
    visual_director: str = "auto"
    visualizer: str = "fake"
    # The visualizer's output substrate: "off" emits raw Remotion f(frame)
    # modules (the shipped path, byte-identical); "auto" emits a relational cast
    # plus a verb script played by @decode/motion-api. Default off; opt in per
    # deployment. See docs/CHOREOGRAPHY-API.md §Migration plan.
    choreography: str = "off"
    voice: str = "fake"
    # Use the model when credentials are present, otherwise keep local/test
    # environments deterministic without an extra switch.
    orchestrator: str = "auto"
    # Who decides the next production step after one finishes: "auto" lets the
    # model choose among ready steps (falling back to the classic order when
    # unavailable); "chain" is always the classic order.
    conductor: str = "auto"
    evaluator: str = "fake"
    openai_api_key: str | None = None
    openai_model: str = "gpt-5.6-luna"
    # Run ONLY the Motion Designer on a different model. When set (an OpenRouter id
    # like "google/gemini-3.6-flash"), the visualizer's client is pointed at
    # OpenRouter with `openrouter_api_key` while the rest of the author stack stays
    # on OpenAI. None = the visualizer uses `openai_model` like everyone else.
    visualizer_model: str | None = None
    # The side chat answers a human mid-thought; routing a message to one tool
    # does not need the scene-authoring model, it needs to be quick. Overridable
    # via DECODE_ORCHESTRATOR_MODEL.
    orchestrator_model: str = "gpt-5.4-mini"
    # Any OpenAI-compatible endpoint (e.g. DeepSeek) — set DECODE_OPENAI_BASE_URL
    # and point openai_model at that provider's model. None = OpenAI's default.
    openai_base_url: str | None = None
    # OpenRouter — one gateway (Chat Completions) for every non-OpenAI model
    # (Gemini, Claude, DeepSeek, Kimi …). Each model is a plain id string in
    # decode/agents/models.py; adding one is a one-line entry, not new code. The
    # OpenAI Responses-API path above stays for gpt-5.6-luna generation; roles move
    # onto OpenRouter one at a time. Vision is the first (a Gemini judge).
    openrouter_api_key: str | None = None
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    # The vision judge's model (OpenRouter id). Flash is fast/cheap — right for a
    # gate that runs per scene and per repair round; swap to a -pro for accuracy.
    vision_model: str = "google/gemini-3.6-flash"
    # Evaluation is a separate model call with a separate quality/cost profile.
    # It may share credentials without coupling its model choice to generation.
    openai_evaluator_model: str = "gpt-5.6-luna"
    # Speech-to-text for narration word-timing alignment. The synthesized audio is
    # transcribed with word timestamps, which are mapped back onto the known
    # narration tokens so the choreography lands each reveal on the spoken word.
    # Empty key or a base_url without an audio endpoint → falls back to an even
    # split (see agents/voice). DECODE_OPENAI_TRANSCRIBE_MODEL overrides.
    openai_transcribe_model: str = "whisper-1"
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
    # Cost circuit-breakers. Jobs are the unit of spend (one job ≈ one
    # model-backed stage; a build is ~5, each with parallel scene calls), chat
    # turns are one model call each, and the concurrency cap bounds how many
    # provider calls the worker holds open at once across all projects.
    daily_project_job_budget: int = 60
    daily_project_chat_budget: int = 200
    max_concurrent_model_calls: int = 4
    # Hard dollar ceiling per project per day, summed from usage_records'
    # estimated_cost_usd. Unpriced calls (NULL cost — an unknown model) don't
    # count toward it, so the job/chat budgets above remain the backstop.
    daily_project_cost_limit_usd: float = 5.0
    # The vision gate: after a scene generates, render three stills and have a
    # multimodal model judge what a viewer would see; a fail earns one repair
    # round. "auto" = on when a key is present; "off" skips it entirely.
    vision_gate: str = "auto"

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
