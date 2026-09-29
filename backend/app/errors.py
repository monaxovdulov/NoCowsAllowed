import logging
from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


class AppError(Exception):
    def __init__(
        self,
        *,
        status_code: int,
        code: str,
        message: str,
        action: str | None = None,
        details: Any | None = None,
    ) -> None:
        super().__init__(code)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.action = action
        self.details = details

    def payload(self) -> dict[str, Any]:
        result: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.action is not None:
            result["action"] = self.action
        if self.details is not None:
            result["details"] = self.details
        return result


async def app_error_handler(_: Request, error: AppError) -> JSONResponse:
    return JSONResponse(status_code=error.status_code, content=error.payload())


async def request_validation_error_handler(
    _: Request, error: RequestValidationError
) -> JSONResponse:
    details = [
        {
            "field": ".".join(str(part) for part in item["loc"][1:]) or "request",
            "message": _validation_message(item["type"]),
        }
        for item in error.errors()
    ]
    return JSONResponse(
        status_code=422,
        content={
            "code": "NCA_REQUEST_INVALID",
            "message": "Проверьте введённые данные.",
            "details": details,
        },
    )


async def unexpected_error_handler(request: Request, error: Exception) -> JSONResponse:
    logger.exception(
        "NCA_UNEXPECTED_REQUEST_ERROR method=%s path=%s",
        request.method,
        request.url.path,
    )
    return JSONResponse(
        status_code=500,
        content={
            "code": "NCA_INTERNAL_ERROR",
            "message": "Не удалось выполнить запрос.",
        },
    )


def _validation_message(error_type: str) -> str:
    if error_type == "missing":
        return "Обязательное поле не заполнено."
    if error_type in {"string_too_long", "too_long"}:
        return "Значение слишком длинное."
    if error_type in {"string_too_short", "too_short"}:
        return "Значение слишком короткое."
    if error_type.startswith("date_"):
        return "Введите корректную дату."
    if error_type in {"enum", "literal_error"}:
        return "Выберите допустимое значение."
    return "Проверьте значение поля."
