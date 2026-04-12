import logging
from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from typing import Union

logger = logging.getLogger(__name__)

async def http_exception_handler(request: Request, exc: HTTPException):
    """
    Handle standard HTTPExceptions.
    Returns structured JSON: {"error": true, "message": "...", "details": ...}
    """
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": True,
            "message": exc.detail,
        },
    )

async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Handle Pydantic validation errors.
    Joins multiple errors into a single readable string.
    """
    error_messages = []
    for error in exc.errors():
        # Get the field name. Location is usually ('body', 'email') etc.
        # We take the last part as the field name.
        field = error.get("loc", [])[-1] if error.get("loc") else "Unknown field"
        msg = error.get("msg", "Invalid value")
        
        # Clean up some common pydantic messages if desired, or just use as is
        # e.g. "field required" -> "Field 'email' is required"
        if msg == "field required":
            error_messages.append(f"Field '{field}' is required")
        else:
            error_messages.append(f"Field '{field}' is invalid: {msg}")

    # Join multiple errors with "; "
    final_message = "; ".join(error_messages)

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": True,
            "message": "Validation Error",
            "details": final_message
        },
    )

async def general_exception_handler(request: Request, exc: Exception):
    """
    Handle unexpected 500 errors.
    Logs the full stack trace but returns a generic message to the client.
    """
    # Log the actual error for debugging
    logger.error(f"Global Exception Handler caught: {exc}", exc_info=True)

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": True,
            "message": "Internal server error. Please try again later.",
        },
    )
