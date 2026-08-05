"""Exercise the configured object store end to end: put, get, delete.

Storage is the one provider whose configuration cannot be checked by booting the
app — a wrong endpoint, region, bucket or key only fails on the first upload,
which in production is a user losing their source file. Run this after changing
any DECODE_R2_* variable.
"""

import asyncio
import traceback

from decode.config import get_settings
from decode.providers.storage import object_store

KEY = "verification/object-store-check.txt"
BODY = b"decode object store verification"


async def verify() -> None:
    settings = get_settings()
    print(f"backend  = {settings.object_store}")
    print(f"bucket   = {settings.r2_bucket}")
    print(f"endpoint = {settings.r2_endpoint_url}")
    # Presence only. Never print credential values.
    print(f"key id   = {'set' if settings.r2_access_key_id else 'MISSING'}")
    print(f"secret   = {'set' if settings.r2_secret_access_key else 'MISSING'}")

    store = object_store(settings)

    async def chunks():
        yield BODY

    size, key, digest = await store.put(KEY, chunks(), settings.max_source_bytes)
    print(f"put      = {size} bytes, key={key}, sha256={digest[:12]}…")

    fetched = await store.get(KEY)
    assert fetched == BODY, f"round trip mismatch: {fetched!r}"
    print(f"get      = {len(fetched)} bytes, matches what was written")

    await store.delete(KEY)
    print("delete   = ok")
    print("object_store=passed")


if __name__ == "__main__":
    try:
        asyncio.run(verify())
    except Exception:
        traceback.print_exc()
        print("object_store=failed")
        raise SystemExit(1) from None
