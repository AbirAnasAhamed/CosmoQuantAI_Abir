from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from app.core.security import verify_token
from app.db.session import SessionLocal
from app.models import User
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

class IPWhitelistMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Exclude open endpoints
        if request.url.path.startswith("/docs") or \
           request.url.path.startswith("/redoc") or \
           request.url.path.endswith("/openapi.json") or \
           request.url.path.startswith(f"{settings.API_V1_STR}/auth") or \
           request.method == "OPTIONS":
             return await call_next(request)

        client_ip = request.client.host
        auth_header = request.headers.get("Authorization")
        
        if auth_header:
            try:
                parts = auth_header.split()
                if len(parts) == 2 and parts[0].lower() == 'bearer':
                    token = parts[1]
                    payload = verify_token(token)
                    
                    if payload and "sub" in payload:
                        email = payload["sub"]
                        
                        # Check DB
                        db = SessionLocal()
                        try:
                            user = db.query(User).filter(User.email == email).first()
                            
                            if user and user.is_ip_whitelist_enabled:
                                allowed = user.allowed_ips or []
                                if client_ip not in allowed:
                                    logger.warning(f"BLOCKED IP {client_ip} for user {email}")
                                    return JSONResponse(
                                        status_code=status.HTTP_403_FORBIDDEN,
                                        content={"detail": f"IP Address {client_ip} not authorized. Please disable whitelist or add this IP from an authorized device."}
                                    )
                        finally:
                            db.close()
            except Exception as e:
                # Log error but don't crash request, let auth middleware handle token if invalid
                # logger.error(f"IP Whitelist check failed: {e}")
                pass

        return await call_next(request)
