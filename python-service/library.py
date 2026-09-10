"""Per-account saved titles and watch history.

Everything here is scoped by the signed-in account: an account id is never read
from a request body, so one profile cannot write into another's library.

Titles are stored as a snapshot rather than by id alone because the catalogue is
upstream and re-fetching fifty titles to draw a grid is not an option.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, Field, field_validator

from auth import current_account
from db import clean_snapshot, connect, now, parse_snapshot

log = logging.getLogger("streaming-dashboard")

router = APIRouter()


class SnapshotBody(BaseModel):
    slug: str = Field(min_length=1, max_length=200)
    snapshot: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("snapshot")
    @classmethod
    def require_a_name(cls, value: Dict[str, Any]) -> Dict[str, Any]:
        if not str(value.get("name") or "").strip():
            raise ValueError("snapshot must carry the title's name")
        return value


class HistoryRecord(SnapshotBody):
    # 0 for films; a series stores the season and episode that were played.
    season: int = Field(default=0, ge=0, le=1000)
    episode: int = Field(default=0, ge=0, le=10000)


@router.get("/library")
def list_library(account: Dict[str, Any] = Depends(current_account)) -> List[Dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT slug, snapshot, added_at FROM library_items
            WHERE account_id = ? ORDER BY added_at DESC, rowid DESC
            """,
            (account["id"],),
        ).fetchall()
    return [
        {"slug": row["slug"], "title": parse_snapshot(row["snapshot"]), "addedAt": row["added_at"]}
        for row in rows
    ]


@router.post("/library")
def save_to_library(
    body: SnapshotBody, account: Dict[str, Any] = Depends(current_account)
) -> Dict[str, Any]:
    stamp = now()
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO library_items (account_id, slug, snapshot, added_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(account_id, slug) DO UPDATE SET snapshot = excluded.snapshot
            """,
            (account["id"], body.slug, clean_snapshot(body.snapshot), stamp),
        )
    return {"slug": body.slug, "addedAt": stamp}


@router.delete("/library/{slug}", status_code=204)
def remove_from_library(slug: str, account: Dict[str, Any] = Depends(current_account)) -> Response:
    with connect() as conn:
        # Idempotent: removing something already gone is still a success.
        conn.execute(
            "DELETE FROM library_items WHERE account_id = ? AND slug = ?", (account["id"], slug)
        )
    return Response(status_code=204)


@router.delete("/history/{slug}", status_code=204)
def remove_from_history(
    slug: str,
    season: int = Query(0, ge=0, le=1000),
    episode: int = Query(0, ge=0, le=10000),
    account: Dict[str, Any] = Depends(current_account),
) -> Response:
    with connect() as conn:
        conn.execute(
            "DELETE FROM watch_history WHERE account_id = ? AND slug = ? AND season = ? AND episode = ?",
            (account["id"], slug, season, episode),
        )
    return Response(status_code=204)


@router.get("/history")
def list_history(
    account: Dict[str, Any] = Depends(current_account),
    limit: int = Query(24, ge=1, le=100),
) -> List[Dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT slug, season, episode, snapshot, watched_at FROM watch_history
            WHERE account_id = ? ORDER BY watched_at DESC, rowid DESC LIMIT ?
            """,
            (account["id"], limit),
        ).fetchall()
    return [
        {
            "slug": row["slug"],
            "season": row["season"],
            "episode": row["episode"],
            "title": parse_snapshot(row["snapshot"]),
            "watchedAt": row["watched_at"],
        }
        for row in rows
    ]


@router.post("/history")
def record_history(
    body: HistoryRecord, account: Dict[str, Any] = Depends(current_account)
) -> Dict[str, Any]:
    stamp = now()
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO watch_history (account_id, slug, season, episode, snapshot, watched_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(account_id, slug, season, episode)
            DO UPDATE SET snapshot = excluded.snapshot, watched_at = excluded.watched_at
            """,
            (
                account["id"],
                body.slug,
                body.season,
                body.episode,
                clean_snapshot(body.snapshot),
                stamp,
            ),
        )
    log.debug(
        "history: account %s played %s s%s e%s",
        account["id"],
        body.slug,
        body.season,
        body.episode,
    )
    return {"slug": body.slug, "season": body.season, "episode": body.episode, "watchedAt": stamp}
