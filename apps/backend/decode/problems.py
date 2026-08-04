from fastapi import Request
from fastapi.responses import JSONResponse


class AppProblem(Exception):
    def __init__(self, status: int, code: str, detail: str, *, retryable: bool = False, **meta):
        self.status, self.code, self.detail, self.retryable, self.meta = (
            status,
            code,
            detail,
            retryable,
            meta,
        )


async def problem_handler(request: Request, exc: AppProblem) -> JSONResponse:
    return JSONResponse(
        {
            "code": exc.code,
            "status": exc.status,
            "detail": exc.detail,
            "request_id": request.state.request_id,
            "retryable": exc.retryable,
            **exc.meta,
        },
        status_code=exc.status,
    )
