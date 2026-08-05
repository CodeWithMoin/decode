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
    producer: str = "fake"
    evaluator: str = "fake"
    local_object_root: Path = Path(".data/objects")
    max_source_bytes: int = 25 * 1024 * 1024
    upload_stale_seconds: int = 300
    environment: str = "development"
    trusted_access_boundary_confirmed: bool = False
    r2_endpoint_url: str | None = None
    r2_access_key_id: str | None = None
    r2_secret_access_key: str | None = None
    r2_bucket: str | None = None

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
