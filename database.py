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


class DuplicateChapterError(Exception):
    def __init__(self, chapter_name: str):
        self.chapter_name = chapter_name
        super().__init__(f"Chapter '{chapter_name}' already exists.")


class ChapterNotFoundError(Exception):
    def __init__(self, chapter_name: str):
        self.chapter_name = chapter_name
        super().__init__(f"Chapter '{chapter_name}' not found.")


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
    """Create tables, indexes, chapters, and migrate missing columns."""
    conn = _get_conn()
    if USE_POSTGRES:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS chapters (
                id          SERIAL PRIMARY KEY,
                name        TEXT NOT NULL UNIQUE,
                description TEXT,
                created_at  TIMESTAMP DEFAULT NOW()
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_chapters_name_ci
            ON chapters (LOWER(name));
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS vocabulary (
                id            SERIAL PRIMARY KEY,
                german        TEXT NOT NULL,
                english       TEXT NOT NULL,
                chapter_name  TEXT DEFAULT 'General',
                times_asked   INTEGER DEFAULT 0,
                times_correct INTEGER DEFAULT 0,
                times_wrong   INTEGER DEFAULT 0,
                created_at    TIMESTAMP DEFAULT NOW()
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_vocabulary_german_ci
            ON vocabulary (LOWER(german));
        """)
        conn.commit()

        # Migrate existing Postgres table
        for col, col_type in [("times_asked", "INTEGER DEFAULT 0"),
                              ("times_correct", "INTEGER DEFAULT 0"),
                              ("times_wrong", "INTEGER DEFAULT 0"),
                              ("chapter_name", "TEXT DEFAULT 'General'")]:
            try:
                cur.execute(f"ALTER TABLE vocabulary ADD COLUMN {col} {col_type}")
                conn.commit()
            except Exception:
                conn.rollback()

        # Insert default 'General' chapter if missing
        try:
            cur.execute("INSERT INTO chapters (name, description) VALUES ('General', 'Default vocabulary collection') ON CONFLICT DO NOTHING")
            conn.commit()
        except Exception:
            conn.rollback()

        cur.close()
    else:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS chapters (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
                description TEXT,
                created_at  DATETIME DEFAULT (datetime('now'))
            );
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS vocabulary (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                german        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
                english       TEXT    NOT NULL,
                chapter_name  TEXT    DEFAULT 'General',
                times_asked   INTEGER DEFAULT 0,
                times_correct INTEGER DEFAULT 0,
                times_wrong   INTEGER DEFAULT 0,
                created_at    DATETIME DEFAULT (datetime('now'))
            )
        """)
        conn.commit()

        # Migrate existing SQLite table
        for col, col_type in [("times_asked", "INTEGER DEFAULT 0"),
                              ("times_correct", "INTEGER DEFAULT 0"),
                              ("times_wrong", "INTEGER DEFAULT 0"),
                              ("chapter_name", "TEXT DEFAULT 'General'")]:
            try:
                conn.execute(f"ALTER TABLE vocabulary ADD COLUMN {col} {col_type}")
                conn.commit()
            except Exception:
                pass

        # Insert default 'General' chapter if missing
        try:
            conn.execute("INSERT OR IGNORE INTO chapters (name, description) VALUES ('General', 'Default vocabulary collection')")
            conn.commit()
        except Exception:
            pass

    conn.close()


# ── Chapter CRUD operations ──────────────────────────────────────────────────

def get_all_chapters() -> list[dict]:
    """Return all chapters ordered by id with word count statistics."""
    conn = _get_conn()
    query = """
        SELECT c.id, c.name, COALESCE(c.description, '') as description, COUNT(v.id) as word_count
        FROM chapters c
        LEFT JOIN vocabulary v ON LOWER(c.name) = LOWER(v.chapter_name)
        GROUP BY c.id, c.name, c.description
        ORDER BY c.id ASC
    """
    if USE_POSTGRES:
        cur = conn.cursor()
        cur.execute(query)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [{
            "id": r["id"],
            "name": r["name"],
            "description": r["description"],
            "word_count": r["word_count"]
        } for r in rows]
    else:
        rows = conn.execute(query).fetchall()
        conn.close()
        return [{
            "id": r["id"],
            "name": r["name"],
            "description": r["description"],
            "word_count": r["word_count"]
        } for r in rows]


def add_chapter(name: str, description: str = "") -> dict:
    """Add a new chapter. Raises DuplicateChapterError if already exists."""
    name_clean = name.strip()
    if not name_clean:
        raise ValueError("Chapter name cannot be empty")

    conn = _get_conn()
    try:
        if USE_POSTGRES:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO chapters (name, description) VALUES (%s, %s) RETURNING id",
                (name_clean, description.strip())
            )
            chapter_id = cur.fetchone()["id"]
            conn.commit()
            cur.close()
        else:
            result = conn.execute(
                "INSERT INTO chapters (name, description) VALUES (?, ?)",
                (name_clean, description.strip())
            )
            chapter_id = result.lastrowid
            conn.commit()
        return {"id": chapter_id, "name": name_clean, "description": description.strip(), "word_count": 0}
    except (psycopg2.IntegrityError if USE_POSTGRES else sqlite3.IntegrityError):
        if USE_POSTGRES:
            conn.rollback()
        raise DuplicateChapterError(name_clean)
    finally:
        conn.close()


def update_chapter(old_name: str, new_name: str, description: str = "") -> None:
    """Rename a chapter and update all assigned words. Raises ChapterNotFoundError or DuplicateChapterError."""
    old_clean = old_name.strip()
    new_clean = new_name.strip()

    if not old_clean or not new_clean:
        raise ValueError("Chapter names cannot be empty")

    conn = _get_conn()
    try:
        # Update chapter row
        if USE_POSTGRES:
            cur = conn.cursor()
            cur.execute(
                "UPDATE chapters SET name = %s, description = %s WHERE LOWER(name) = LOWER(%s)",
                (new_clean, description.strip(), old_clean)
            )
            if cur.rowcount == 0:
                cur.close()
                conn.rollback()
                raise ChapterNotFoundError(old_clean)
            
            # Update vocabulary items assigned to old chapter
            cur.execute(
                "UPDATE vocabulary SET chapter_name = %s WHERE LOWER(chapter_name) = LOWER(%s)",
                (new_clean, old_clean)
            )
            conn.commit()
            cur.close()
        else:
            result = conn.execute(
                "UPDATE chapters SET name = ?, description = ? WHERE name = ? COLLATE NOCASE",
                (new_clean, description.strip(), old_clean)
            )
            if result.rowcount == 0:
                conn.rollback()
                raise ChapterNotFoundError(old_clean)

            # Update vocabulary items assigned to old chapter
            conn.execute(
                "UPDATE vocabulary SET chapter_name = ? WHERE chapter_name = ? COLLATE NOCASE",
                (new_clean, old_clean)
            )
            conn.commit()
    except (ChapterNotFoundError, DuplicateChapterError):
        if USE_POSTGRES:
            conn.rollback()
        raise
    except (psycopg2.IntegrityError if USE_POSTGRES else sqlite3.IntegrityError):
        if USE_POSTGRES:
            conn.rollback()
        raise DuplicateChapterError(new_clean)
    finally:
        conn.close()


def delete_chapter(name: str) -> None:
    """Delete a chapter and reassign its words to 'General'."""
    name_clean = name.strip()
    if name_clean.lower() == "general":
        raise ValueError("The default 'General' chapter cannot be deleted.")

    conn = _get_conn()
    try:
        if USE_POSTGRES:
            cur = conn.cursor()
            cur.execute("DELETE FROM chapters WHERE LOWER(name) = LOWER(%s)", (name_clean,))
            if cur.rowcount == 0:
                cur.close()
                conn.rollback()
                raise ChapterNotFoundError(name_clean)
            cur.execute("UPDATE vocabulary SET chapter_name = 'General' WHERE LOWER(chapter_name) = LOWER(%s)", (name_clean,))
            conn.commit()
            cur.close()
        else:
            result = conn.execute("DELETE FROM chapters WHERE name = ? COLLATE NOCASE", (name_clean,))
            if result.rowcount == 0:
                conn.rollback()
                raise ChapterNotFoundError(name_clean)
            conn.execute("UPDATE vocabulary SET chapter_name = 'General' WHERE chapter_name = ? COLLATE NOCASE", (name_clean,))
            conn.commit()
    finally:
        conn.close()


# ── CRUD operations ──────────────────────────────────────────────────────────

def get_all_words() -> list[dict]:
    """Return all words ordered newest first with practice stats and chapter assignment."""
    conn = _get_conn()
    query = "SELECT german, english, COALESCE(chapter_name, 'General') as chapter_name, COALESCE(times_asked, 0) as times_asked, COALESCE(times_correct, 0) as times_correct, COALESCE(times_wrong, 0) as times_wrong FROM vocabulary ORDER BY id DESC"
    if USE_POSTGRES:
        cur = conn.cursor()
        cur.execute(query)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [{
            "german": r["german"],
            "english": r["english"],
            "chapter_name": r["chapter_name"],
            "times_asked": r["times_asked"],
            "times_correct": r["times_correct"],
            "times_wrong": r["times_wrong"]
        } for r in rows]
    else:
        rows = conn.execute(query).fetchall()
        conn.close()
        return [{
            "german": r["german"],
            "english": r["english"],
            "chapter_name": r["chapter_name"],
            "times_asked": r["times_asked"],
            "times_correct": r["times_correct"],
            "times_wrong": r["times_wrong"]
        } for r in rows]


def record_practice_result(german: str, is_correct: bool) -> None:
    """Increment times_asked, and times_correct or times_wrong for the given word."""
    conn = _get_conn()
    add_correct = 1 if is_correct else 0
    add_wrong = 0 if is_correct else 1
    try:
        if USE_POSTGRES:
            cur = conn.cursor()
            cur.execute("""
                UPDATE vocabulary
                SET times_asked = COALESCE(times_asked, 0) + 1,
                    times_correct = COALESCE(times_correct, 0) + %s,
                    times_wrong = COALESCE(times_wrong, 0) + %s
                WHERE LOWER(german) = LOWER(%s)
            """, (add_correct, add_wrong, german))
            conn.commit()
            cur.close()
        else:
            conn.execute("""
                UPDATE vocabulary
                SET times_asked = COALESCE(times_asked, 0) + 1,
                    times_correct = COALESCE(times_correct, 0) + ?,
                    times_wrong = COALESCE(times_wrong, 0) + ?
                WHERE german = ? COLLATE NOCASE
            """, (add_correct, add_wrong, german))
            conn.commit()
    finally:
        conn.close()


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


def add_word(german: str, english: str, chapter_name: str = "General") -> None:
    """Insert a new word into specified chapter. Raises DuplicateWordError if already exists."""
    ch_clean = chapter_name.strip() if chapter_name else "General"
    conn = _get_conn()
    try:
        if USE_POSTGRES:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO vocabulary (german, english, chapter_name) VALUES (%s, %s, %s)",
                (german, english, ch_clean)
            )
            conn.commit()
            cur.close()
        else:
            conn.execute(
                "INSERT INTO vocabulary (german, english, chapter_name) VALUES (?, ?, ?)",
                (german, english, ch_clean)
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
