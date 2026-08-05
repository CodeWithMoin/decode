#!/bin/sh
# One image, three processes. Which one this container becomes is a variable,
# not a per-service start command, so the whole deployment is reproducible from
# the repository instead of from dashboard settings nobody can diff.
set -e

case "${DECODE_PROCESS:-api}" in
  api)
    # ponytail: migrate-on-boot assumes one API replica. Alembic takes no
    # advisory lock, so move this to a release step before scaling the API past
    # one instance.
    alembic upgrade head
    exec uvicorn decode.main:app --host 0.0.0.0 --port "${PORT:-8000}"
    ;;
  dispatcher)
    exec python -m decode.execution.dispatcher
    ;;
  worker)
    exec arq decode.execution.worker.WorkerSettings
    ;;
  *)
    # A typo must not silently boot an API that nothing is routing to.
    echo "unknown DECODE_PROCESS: '${DECODE_PROCESS}' (expected api, dispatcher or worker)" >&2
    exit 1
    ;;
esac
