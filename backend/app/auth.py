"""FastAPI auth dependency — JWT verification (Supabase) or mock (local dev)."""
from __future__ import annotations
import os

from fastapi import HTTPException, Request

from .db import USE_ACTUAL_DB


def get_current_user(request: Request) -> dict:
    if not USE_ACTUAL_DB:
        return {"sub": "local-dev-user"}

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = auth_header[len("Bearer "):]
    import jwt  # PyJWT

    jwt_secret = os.environ.get("SUPABASE_JWT_SECRET")
    if not jwt_secret:
        raise HTTPException(status_code=500, detail="SUPABASE_JWT_SECRET is not configured")

    try:
        payload = jwt.decode(
            token,
            jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    return payload
