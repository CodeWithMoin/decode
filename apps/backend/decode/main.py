import logging

from fastapi import FastAPI
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from .api import request_context
from .artifacts.router import router as artifacts_router
from .config import get_settings
from .db import SessionLocal
from .execution.router import router as execution_router
from .problems import AppProblem, problem_handler
from .projects.router import router as projects_router
from .renders.router import router as renders_router
from .voice_router import router as voice_router

logger = logging.getLogger(__name__)


app = FastAPI(title="Decode API", version="0.1.0")
app.middleware("http")(request_context)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[get_settings().frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Content-Type", "Idempotency-Key", "Last-Event-ID", "X-Request-ID"],
)
app.add_exception_handler(AppProblem, problem_handler)  # type: ignore[arg-type]


@app.exception_handler(RequestValidationError)
async def validation_problem(request, exc):
    return JSONResponse(
        {
            "code": "validation_failed",
            "status": 422,
            "detail": "Request validation failed.",
            "request_id": request.state.request_id,
            "retryable": False,
            "field_errors": jsonable_encoder(exc.errors()),
        },
        status_code=422,
    )


@app.exception_handler(Exception)
async def unexpected_problem(request, exc):
    logger.exception(
        "unexpected API exception",
        exc_info=exc,
        extra={"request_id": request.state.request_id},
    )
    return JSONResponse(
        {
            "code": "internal_error",
            "status": 500,
            "detail": "An unexpected server error occurred.",
            "request_id": request.state.request_id,
            "retryable": True,
        },
        status_code=500,
    )


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/ready")
async def ready():
    async with SessionLocal() as session:
        await session.execute(text("SELECT 1"))
    return {"status": "ready"}


app.include_router(projects_router, prefix="/api/v1")
app.include_router(artifacts_router, prefix="/api/v1")
app.include_router(execution_router, prefix="/api/v1")
app.include_router(renders_router, prefix="/api/v1")
app.include_router(voice_router, prefix="/api/v1")
