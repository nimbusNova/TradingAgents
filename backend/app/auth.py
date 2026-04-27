"""FastAPI auth dependency — JWT verification (Supabase) or mock (local dev)."""
from __future__ import annotations
import os

from fastapi import HTTPException, Request
from supabase import create_client

from .db import USE_ACTUAL_DB

_supabase_url: str | None = os.environ.get("SUPABASE_URL")
_supabase_service_key: str | None = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")


def get_current_user(request: Request) -> dict:
    if not USE_ACTUAL_DB:
        return {"sub": "local-dev-user"}

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = auth_header[len("Bearer "):]

    if not _supabase_url or not _supabase_service_key:
        raise HTTPException(status_code=500, detail="Supabase credentials are not configured")

    try:
        client = create_client(_supabase_url, _supabase_service_key)
        response = client.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    if not response.user:
        raise HTTPException(status_code=401, detail="Invalid token")

    return {"sub": response.user.id, "email": response.user.email}
