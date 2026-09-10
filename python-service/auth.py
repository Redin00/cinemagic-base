"""Accounts, sessions, and the admin-only account management API.

Passwords are PBKDF2-HMAC-SHA256 with a per-account salt. Session tokens are
256-bit random strings of which only the sha256 is stored, so a copy of the
database does not hand out usable sessions.

Only the Admin creates accounts: there is no public registration route, and
`/accounts/*` requires an admin token on top of the app's own server-side gate.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import re
import secrets
import sqlite3
from typing import Any, Dict, List, Literal, NamedTuple, Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, field_validator

from db import connect, now

log = logging.getLogger("streaming-dashboard")

PBKDF2_ITERATIONS = 200_000
SESSION_DAYS = int(os.environ.get("SC_SESSION_DAYS", "30"))
LOCKOUT_MINUTES = int(os.environ.get("SC_LOCKOUT_MINUTES", "15"))
# Stored timestamps are milliseconds, but `retryAfter` answers in seconds.
SESSION_MS = SESSION_DAYS * 86_400_000
LOCKOUT_MS = LOCKOUT_MINUTES * 60_000
MAX_FAILED_ATTEMPTS = 5
DEFAULT_COLOR = "#6366f1"

ADMIN_NAME = os.environ.get("SC_ADMIN_NAME", "Admin")
ADMIN_PASSWORD = os.environ.get("SC_ADMIN_PASSWORD")

router = APIRouter()
bearer = HTTPBearer(auto_error=False)


# --------------------------------------------------------------------------- #
# Passwords and tokens
# --------------------------------------------------------------------------- #


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Constant-time check against a `pbkdf2_sha256$<iters>$<salt>$<digest>` hash."""
    try:
        scheme, iterations, salt, digest = stored.split("$")
        if scheme != "pbkdf2_sha256":
            return False
        candidate = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt), int(iterations)
        )
    except ValueError:
        log.warning("unreadable password hash on file; treating it as a mismatch")
        return False
    return hmac.compare_digest(candidate.hex(), digest)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def account_view(row: Dict[str, Any]) -> Dict[str, Any]:
    """The account fields a signed-in user or the picker is allowed to see."""
    return {
        "id": row["id"],
        "name": row["name"],
        "role": row["role"],
        "color": row["color"],
    }


def admin_account_view(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        **account_view(row),
        "lockedUntil": row["locked_until"],
        "createdAt": row["created_at"],
        "email": row["name"].lower().replace(" ", ".") + "@streamapp.local",
    }


# --------------------------------------------------------------------------- #
# Dependencies
# --------------------------------------------------------------------------- #


class Session(NamedTuple):
    token: str
    account: Dict[str, Any]


def current_session(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
) -> Session:
    """Resolve `Authorization: Bearer <token>` to a live session, or 401."""
    if credentials is None or credentials.scheme.lower() != "bearer" or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Not signed in")

    with connect() as conn:
        row = conn.execute(
            """
            SELECT a.* FROM sessions s
            JOIN accounts a ON a.id = s.account_id
            WHERE s.token_hash = ? AND s.expires_at > ?
            """,
            (token_hash(credentials.credentials), now()),
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=401, detail="Not signed in")
    return Session(credentials.credentials, dict(row))


def current_account(session: Session = Depends(current_session)) -> Dict[str, Any]:
    return session.account


def require_admin(session: Session = Depends(current_session)) -> Dict[str, Any]:
    # Checked here as well as in the web app: the app's gate is a convenience,
    # this is the actual boundary.
    if session.account["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return session.account


# --------------------------------------------------------------------------- #
# Request bodies
# --------------------------------------------------------------------------- #

Role = Literal["admin", "member"]
COLOR_RE = re.compile(r"#[0-9a-fA-F]{6}")


def check_name(value: str) -> str:
    name = value.strip()
    if not name:
        raise ValueError("name must not be blank")
    return name


def check_color(value: str) -> str:
    if not COLOR_RE.fullmatch(value):
        raise ValueError("color must be #rrggbb")
    return value.lower()


class LoginRequest(BaseModel):
    accountId: int
    password: str = Field(min_length=1, max_length=200)


class AccountCreate(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    password: str = Field(min_length=6, max_length=200)
    role: Role = "member"
    color: str = DEFAULT_COLOR

    @field_validator("name")
    @classmethod
    def name_ok(cls, value: str) -> str:
        return check_name(value)

    @field_validator("color")
    @classmethod
    def color_ok(cls, value: str) -> str:
        return check_color(value)


class AccountPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=40)
    role: Optional[Role] = None
    color: Optional[str] = None
    unlock: bool = False

    @field_validator("name")
    @classmethod
    def name_ok(cls, value: Optional[str]) -> Optional[str]:
        return None if value is None else check_name(value)

    @field_validator("color")
    @classmethod
    def color_ok(cls, value: Optional[str]) -> Optional[str]:
        return None if value is None else check_color(value)


class PasswordReset(BaseModel):
    password: str = Field(min_length=6, max_length=200)


def _locked(row: Dict[str, Any], stamp: int) -> bool:
    return bool(row["locked_until"] and row["locked_until"] > stamp)


def _admin_count(conn) -> int:
    return conn.execute("SELECT COUNT(*) AS n FROM accounts WHERE role = 'admin'").fetchone()["n"]


# --------------------------------------------------------------------------- #
# Sign-in
# --------------------------------------------------------------------------- #


@router.get("/auth/profiles")
def profiles() -> List[Dict[str, Any]]:
    """Public, by design: this is the Netflix-style profile picker."""
    stamp = now()
    with connect() as conn:
        rows = conn.execute(
            "SELECT id, name, color, locked_until FROM accounts ORDER BY id"
        ).fetchall()
    return [
        {
            "id": row["id"],
            "name": row["name"],
            "color": row["color"],
            "locked": _locked(dict(row), stamp),
        }
        for row in rows
    ]


def _open_session(conn, account_id: int, stamp: int) -> str:
    """Store a new 256-bit token by hash and sweep the expired ones."""
    token = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO sessions (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (token_hash(token), account_id, stamp, stamp + SESSION_MS),
    )
    # Sweeping on login keeps the table from growing forever without a cron.
    conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (stamp,))
    return token


@router.post("/auth/login")
def login(body: LoginRequest) -> Dict[str, Any]:
    stamp = now()
    outcome: Dict[str, Any] = {}
    failure: Optional[HTTPException] = None

    # The failure is raised only after the block, so a wrong password's strike is
    # committed instead of rolled back by the exception unwinding the transaction.
    with connect() as conn:
        found = conn.execute("SELECT * FROM accounts WHERE id = ?", (body.accountId,)).fetchone()
        row = dict(found) if found else None

        if row is None:
            # Same message as a wrong password: otherwise the picker leaks which
            # account ids exist.
            failure = HTTPException(status_code=401, detail={"message": "Wrong password"})
        elif _locked(row, stamp):
            failure = HTTPException(
                status_code=423,
                detail={
                    "message": "Too many failed attempts",
                    "retryAfter": max(1, (row["locked_until"] - stamp) // 1000),
                },
            )
        elif not verify_password(body.password, row["password_hash"]):
            # Incremented in SQL so concurrent attempts cannot lose a strike.
            conn.execute(
                "UPDATE accounts SET failed_attempts = failed_attempts + 1 WHERE id = ?",
                (row["id"],),
            )
            attempts = conn.execute(
                "SELECT failed_attempts AS n FROM accounts WHERE id = ?", (row["id"],)
            ).fetchone()["n"]
            remaining = MAX_FAILED_ATTEMPTS - attempts
            if remaining <= 0:
                conn.execute(
                    "UPDATE accounts SET locked_until = ? WHERE id = ?",
                    (stamp + LOCKOUT_MS, row["id"]),
                )
                failure = HTTPException(
                    status_code=423,
                    detail={
                        "message": "Too many failed attempts",
                        "retryAfter": LOCKOUT_MINUTES * 60,
                    },
                )
            else:
                failure = HTTPException(
                    status_code=401,
                    detail={"message": "Wrong password", "attemptsLeft": remaining},
                )
        else:
            conn.execute(
                "UPDATE accounts SET failed_attempts = 0, locked_until = NULL WHERE id = ?",
                (row["id"],),
            )
            outcome = {"token": _open_session(conn, row["id"], stamp), "account": account_view(row)}

    if failure is not None:
        raise failure
    return outcome


@router.post("/auth/logout", status_code=204)
def logout(session: Session = Depends(current_session)) -> Response:
    with connect() as conn:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(session.token),))
    return Response(status_code=204)


@router.get("/auth/me")
def me(account: Dict[str, Any] = Depends(current_account)) -> Dict[str, Any]:
    return account_view(account)


# --------------------------------------------------------------------------- #
# Account management (admin only)
# --------------------------------------------------------------------------- #


@router.get("/accounts")
def list_accounts(_: Dict[str, Any] = Depends(require_admin)) -> List[Dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute("SELECT * FROM accounts ORDER BY id").fetchall()
    return [admin_account_view(dict(row)) for row in rows]


@router.post("/accounts", status_code=201)
def create_account(
    body: AccountCreate, _: Dict[str, Any] = Depends(require_admin)
) -> Dict[str, Any]:
    try:
        with connect() as conn:
            cursor = conn.execute(
                """
                INSERT INTO accounts (name, password_hash, role, color, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (body.name, hash_password(body.password), body.role, body.color, now()),
            )
            created = dict(
                conn.execute("SELECT * FROM accounts WHERE id = ?", (cursor.lastrowid,)).fetchone()
            )
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="An account with that name already exists")
    log.info("created %s account %r", created["role"], created["name"])
    return admin_account_view(created)


@router.patch("/accounts/{account_id}")
def update_account(
    account_id: int, body: AccountPatch, admin: Dict[str, Any] = Depends(require_admin)
) -> Dict[str, Any]:
    try:
        with connect() as conn:
            found = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
            if found is None:
                raise HTTPException(status_code=404, detail="No such account")
            row = dict(found)

            if body.role == "member" and row["role"] == "admin" and _admin_count(conn) < 2:
                raise HTTPException(status_code=409, detail="Cannot demote the only admin")

            if body.name is not None:
                conn.execute("UPDATE accounts SET name = ? WHERE id = ?", (body.name, account_id))
            if body.role is not None:
                conn.execute("UPDATE accounts SET role = ? WHERE id = ?", (body.role, account_id))
            if body.color is not None:
                conn.execute("UPDATE accounts SET color = ? WHERE id = ?", (body.color, account_id))
            if body.unlock:
                conn.execute(
                    "UPDATE accounts SET failed_attempts = 0, locked_until = NULL WHERE id = ?",
                    (account_id,),
                )

            updated = dict(
                conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
            )
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="An account with that name already exists")

    log.info("admin %r updated account %r", admin["name"], updated["name"])
    return admin_account_view(updated)


@router.post("/auth/me/password")
def change_own_password(
    body: PasswordReset, account: Dict[str, Any] = Depends(current_account)
) -> Dict[str, Any]:
    """A signed-in user can change their own password without admin involvement."""
    with connect() as conn:
        found = conn.execute("SELECT * FROM accounts WHERE id = ?", (account["id"],)).fetchone()
        if found is None:
            raise HTTPException(status_code=404, detail="No such account")

        conn.execute(
            """
            UPDATE accounts
            SET password_hash = ?, failed_attempts = 0, locked_until = NULL
            WHERE id = ?
            """,
            (hash_password(body.password), account["id"]),
        )
        conn.execute("DELETE FROM sessions WHERE account_id = ?", (account["id"],))
        row = dict(found)

    log.info("account %r changed their own password", row["name"])
    return {"id": row["id"], "name": row["name"]}


@router.post("/accounts/{account_id}/password")
def reset_password(
    account_id: int, body: PasswordReset, _: Dict[str, Any] = Depends(require_admin)
) -> Dict[str, Any]:
    with connect() as conn:
        found = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
        if found is None:
            raise HTTPException(status_code=404, detail="No such account")

        conn.execute(
            """
            UPDATE accounts
            SET password_hash = ?, failed_attempts = 0, locked_until = NULL
            WHERE id = ?
            """,
            (hash_password(body.password), account_id),
        )
        # Whoever held the old password must not keep a working session.
        conn.execute("DELETE FROM sessions WHERE account_id = ?", (account_id,))
        row = dict(found)

    log.info("reset the password for account %r", row["name"])
    return {"id": row["id"], "name": row["name"]}


@router.delete("/accounts/{account_id}", status_code=204)
def delete_account(account_id: int, admin: Dict[str, Any] = Depends(require_admin)) -> Response:
    with connect() as conn:
        found = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
        if found is None:
            raise HTTPException(status_code=404, detail="No such account")
        row = dict(found)

        if row["id"] == admin["id"]:
            raise HTTPException(status_code=409, detail="You cannot delete your own account")
        if row["role"] == "admin" and _admin_count(conn) < 2:
            raise HTTPException(status_code=409, detail="Cannot delete the only admin")

        # library_items, watch_history and sessions go with it (ON DELETE CASCADE).
        conn.execute("DELETE FROM accounts WHERE id = ?", (account_id,))

    log.info("admin %r deleted account %r", admin["name"], row["name"])
    return Response(status_code=204)


# --------------------------------------------------------------------------- #
# Bootstrap
# --------------------------------------------------------------------------- #


def bootstrap_admin() -> None:
    """Seed the first admin, so a fresh install is never an app nobody can enter."""
    generated = not ADMIN_PASSWORD
    password = ADMIN_PASSWORD or secrets.token_urlsafe(12)

    with connect() as conn:
        if _admin_count(conn):
            return
        conn.execute(
            """
            INSERT INTO accounts (name, password_hash, role, color, created_at)
            VALUES (?, ?, 'admin', ?, ?)
            """,
            (ADMIN_NAME, hash_password(password), DEFAULT_COLOR, now()),
        )

    if generated:
        log.warning(
            "no SC_ADMIN_PASSWORD set — generated the password for admin %r: %s "
            "(change it from the Admin page)",
            ADMIN_NAME,
            password,
        )
    else:
        log.info("bootstrapped admin account %r", ADMIN_NAME)
