"""
database.py — Unified database layer
-------------------------------------
Uses PostgreSQL when DATABASE_URL env var is set (Railway production),
falls back to SQLite for local development.
"""

import os

# ── Backend detection ────────────────────────────────────────────────────────

_DATABASE_URL = os.environ.get("DATABASE_URL", "")

# Railway provides "postgres://" but psycopg2 needs "postgresql://"
if _DATABASE_URL.startswith("postgres://"):
    _DATABASE_URL = _DATABASE_URL.replace("postgres://", "postgresql://", 1)

USE_POSTGRES = bool(_DATABASE_URL)

if USE_POSTGRES:
    import psycopg2
    import psycopg2.extras
    print("[DB] Using PostgreSQL (production)")
else:
    import sqlite3
    SQLITE_PATH = "german_vocab.db"
    print("[DB] Using SQLite (local development)")


# ── Custom exceptions ────────────────────────────────────────────────────────

class DuplicateWordError(Exception):
    def __init__(self, german: str):
        self.german = german
        super().__init__(f"The word '{german}' already exists in your vocabulary.")


class WordNotFoundError(Exception):
    def __init__(self, german: str):
        self.german = german
        super().__init__(f"Word '{german}' not found.")


# ── Connection helpers ───────────────────────────────────────────────────────

def _get_conn():
    if USE_POSTGRES:
        return psycopg2.connect(_DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    else:
        conn = sqlite3.connect(SQLITE_PATH)
        conn.row_factory = sqlite3.Row
        return conn


# ── Initialisation ───────────────────────────────────────────────────────────

def init_db():
    """Create table (and indexes) if they don't exist."""
    conn = _get_conn()
    if USE_POSTGRES:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS vocabulary (
                id         SERIAL PRIMARY KEY,
                german     TEXT NOT NULL,
                english    TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
        # Case-insensitive unique index on german word
        cur.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_vocabulary_german_ci
            ON vocabulary (LOWER(german))
        """)
        conn.commit()
        cur.close()
    else:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS vocabulary (
                id         INTEGER  PRIMARY KEY AUTOINCREMENT,
                german     TEXT     NOT NULL UNIQUE COLLATE NOCASE,
                english    TEXT     NOT NULL,
                created_at DATETIME DEFAULT (datetime('now'))
            )
        """)
        conn.commit()
    conn.close()


# ── CRUD operations ──────────────────────────────────────────────────────────

def get_all_words() -> list[dict]:
    """Return all words ordered newest first."""
    conn = _get_conn()
    if USE_POSTGRES:
        cur = conn.cursor()
        cur.execute("SELECT german, english FROM vocabulary ORDER BY id DESC")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [{"german": r["german"], "english": r["english"]} for r in rows]
    else:
        rows = conn.execute(
            "SELECT german, english FROM vocabulary ORDER BY id DESC"
        ).fetchall()
        conn.close()
        return [{"german": r["german"], "english": r["english"]} for r in rows]


def _find_word(conn, german: str) -> dict | None:
    """Internal: find a word row by german text (case-insensitive). Conn stays open."""
    if USE_POSTGRES:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, german, english FROM vocabulary WHERE LOWER(german) = LOWER(%s)",
            (german,)
        )
        row = cur.fetchone()
        cur.close()
        return dict(row) if row else None
    else:
        row = conn.execute(
            "SELECT id, german, english FROM vocabulary WHERE german = ? COLLATE NOCASE",
            (german,)
        ).fetchone()
        return dict(row) if row else None


def add_word(german: str, english: str) -> None:
    """Insert a new word. Raises DuplicateWordError if already exists."""
    conn = _get_conn()
    try:
        if USE_POSTGRES:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO vocabulary (german, english) VALUES (%s, %s)",
                (german, english)
            )
            conn.commit()
            cur.close()
        else:
            conn.execute(
                "INSERT INTO vocabulary (german, english) VALUES (?, ?)",
                (german, english)
            )
            conn.commit()
    except (psycopg2.IntegrityError if USE_POSTGRES else sqlite3.IntegrityError):
        if USE_POSTGRES:
            conn.rollback()
        raise DuplicateWordError(german)
    finally:
        conn.close()


def update_word(old_german: str, new_german: str, new_english: str) -> None:
    """Update a word. Raises WordNotFoundError or DuplicateWordError."""
    conn = _get_conn()
    try:
        existing = _find_word(conn, old_german)
        if not existing:
            raise WordNotFoundError(old_german)

        # Check collision only if the german text is actually changing
        if old_german.lower() != new_german.lower():
            if _find_word(conn, new_german):
                raise DuplicateWordError(new_german)

        if USE_POSTGRES:
            cur = conn.cursor()
            cur.execute(
                "UPDATE vocabulary SET german = %s, english = %s WHERE id = %s",
                (new_german, new_english, existing["id"])
            )
            conn.commit()
            cur.close()
        else:
            conn.execute(
                "UPDATE vocabulary SET german = ?, english = ? WHERE id = ?",
                (new_german, new_english, existing["id"])
            )
            conn.commit()
    except (WordNotFoundError, DuplicateWordError):
        if USE_POSTGRES:
            conn.rollback()
        raise
    except (psycopg2.IntegrityError if USE_POSTGRES else sqlite3.IntegrityError):
        if USE_POSTGRES:
            conn.rollback()
        raise DuplicateWordError(new_german)
    finally:
        conn.close()


def delete_word(german: str) -> None:
    """Delete a word. Raises WordNotFoundError if not found."""
    conn = _get_conn()
    if USE_POSTGRES:
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM vocabulary WHERE LOWER(german) = LOWER(%s)",
            (german,)
        )
        rowcount = cur.rowcount
        conn.commit()
        cur.close()
    else:
        result = conn.execute(
            "DELETE FROM vocabulary WHERE german = ? COLLATE NOCASE",
            (german,)
        )
        rowcount = result.rowcount
        conn.commit()
    conn.close()

    if rowcount == 0:
        raise WordNotFoundError(german)
