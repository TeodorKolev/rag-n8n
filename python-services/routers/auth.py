"""
Authentication routes — login, register, verify
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from jose import jwt
from passlib.context import CryptContext
from pydantic import BaseModel

from config import settings
from middleware.auth import get_current_user
from services.database import DatabaseService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

VALID_DEPARTMENTS = {"finance", "care", "sales", "hr", "general"}
VALID_ROLES = {"user", "admin", "manager"}


# ---------- Request / Response models ----------

class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    password: str
    first_name: str
    last_name: str
    role: Optional[str] = "user"
    department: Optional[str] = "general"


class UserResponse(BaseModel):
    id: str
    email: str
    role: str
    department: Optional[str]
    first_name: str
    last_name: str


class AuthResponse(BaseModel):
    message: str
    token: str
    user: UserResponse


# ---------- Helpers ----------

def _create_token(user: dict) -> str:
    expire = datetime.now(timezone.utc) + timedelta(seconds=settings.jwt_expires_in)
    payload = {
        "sub": str(user["id"]),
        "userId": str(user["id"]),
        "email": user["email"],
        "role": user["role"],
        "department": user.get("department"),
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def _user_response(user: dict) -> UserResponse:
    return UserResponse(
        id=str(user["id"]),
        email=user["email"],
        role=user["role"],
        department=user.get("department"),
        first_name=user.get("first_name", ""),
        last_name=user.get("last_name", ""),
    )


# ---------- Dependency ----------

def get_db() -> DatabaseService:
    from main import database_service
    if database_service is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    return database_service


# ---------- Routes ----------

@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest, db: DatabaseService = Depends(get_db)):
    user = await db.get_user_by_email(body.email)
    if not user or not pwd_context.verify(body.password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    if not user.get("is_active", True):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account is disabled")

    await db.update_last_login(str(user["id"]))
    token = _create_token(user)
    logger.info(f"User {body.email} logged in")

    return AuthResponse(message="Login successful", token=token, user=_user_response(user))


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=AuthResponse)
async def register(body: RegisterRequest, db: DatabaseService = Depends(get_db)):
    if body.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Role must be one of: {', '.join(VALID_ROLES)}")
    if body.department not in VALID_DEPARTMENTS:
        raise HTTPException(status_code=400, detail=f"Department must be one of: {', '.join(VALID_DEPARTMENTS)}")

    existing = await db.get_user_by_email(body.email)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A user with this email already exists")

    password_hash = pwd_context.hash(body.password)
    user = await db.create_user(
        email=body.email,
        password_hash=password_hash,
        first_name=body.first_name,
        last_name=body.last_name,
        role=body.role,
        department=body.department,
    )
    token = _create_token(user)
    logger.info(f"User {body.email} registered")

    return AuthResponse(message="User registered successfully", token=token, user=_user_response(user))


@router.get("/verify")
async def verify(user: dict = Depends(get_current_user)):
    return {
        "message": "Token is valid",
        "user": {
            "id": user.get("userId") or user.get("sub"),
            "email": user.get("email"),
            "role": user.get("role"),
            "department": user.get("department"),
        },
    }
