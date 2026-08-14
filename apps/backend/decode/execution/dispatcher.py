import asyncio
import logging

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings
from sqlalchemy import select

from ..config import get_settings
from ..db import SessionLocal, utcnow
from ..models import OutboxEvent

logger = logging.getLogger(__name__)


async def dispatch_once(redis: ArqRedis) -> int:
    """Enqueue every committed-but-undispatched outbox event.

    The pool is a parameter rather than something built here: this runs once a
    second forever, and connecting and disconnecting on every cycle is ~86k
    pools a day for work that needs one.
    """
    count = 0
    async with SessionLocal() as session:
        rows = list(
            (
                await session.scalars(
                    select(OutboxEvent)
                    .where(OutboxEvent.published_at.is_(None))
                    .order_by(OutboxEvent.created_at)
                    .with_for_update(skip_locked=True)
                    .limit(100)
                )
            ).all()
        )
        for event in rows:
            await redis.enqueue_job(
                "execute_run", event.payload["run_id"], _job_id=f"run:{event.payload['run_id']}"
            )
            event.published_at = utcnow()
            event.attempts += 1
            count += 1
        await session.commit()
    return count


async def main() -> None:
    redis = await create_pool(RedisSettings.from_dsn(get_settings().redis_url))
    try:
        while True:
            try:
                await dispatch_once(redis)
            except Exception:
                logger.exception("outbox dispatch cycle failed")
            await asyncio.sleep(1)
    finally:
        await redis.aclose()


if __name__ == "__main__":
    asyncio.run(main())
