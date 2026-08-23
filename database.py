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


class DuplicateTopicError(Exception):
    def __init__(self, topic_name: str):
        self.topic_name = topic_name
        super().__init__(f"Topic '{topic_name}' already exists.")


class TopicNotFoundError(Exception):
    def __init__(self, topic_name: str):
        self.topic_name = topic_name
        super().__init__(f"Topic '{topic_name}' not found.")


class DuplicateSubheadingError(Exception):
    def __init__(self, chapter_name: str, name: str):
        self.chapter_name = chapter_name
        self.name = name
        super().__init__(f"Subheading '{name}' already exists in chapter '{chapter_name}'.")


class SubheadingNotFoundError(Exception):
    def __init__(self, chapter_name: str, name: str):
        self.chapter_name = chapter_name
        self.name = name
        super().__init__(f"Subheading '{name}' not found in chapter '{chapter_name}'.")


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

            CREATE TABLE IF NOT EXISTS chapter_subheadings (
                id           SERIAL PRIMARY KEY,
                chapter_name TEXT NOT NULL,
                name         TEXT NOT NULL,
                description  TEXT DEFAULT '',
                created_at   TIMESTAMP DEFAULT NOW(),
                UNIQUE(chapter_name, name)
            );
            CREATE INDEX IF NOT EXISTS idx_subheadings_chapter_ci
            ON chapter_subheadings (LOWER(chapter_name));

            CREATE TABLE IF NOT EXISTS topics (
                id          SERIAL PRIMARY KEY,
                name        TEXT NOT NULL UNIQUE,
                description TEXT,
                created_at  TIMESTAMP DEFAULT NOW()
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_topics_name_ci
            ON topics (LOWER(name));
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS vocabulary (
                id            SERIAL PRIMARY KEY,
                german        TEXT NOT NULL,
                english       TEXT NOT NULL,
                chapter_name  TEXT DEFAULT 'General',
                subheading    TEXT DEFAULT '',
                topic_name    TEXT DEFAULT 'General',
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
                              ("chapter_name", "TEXT DEFAULT 'General'"),
                              ("subheading", "TEXT DEFAULT ''"),
                              ("topic_name", "TEXT DEFAULT 'General'")]:
            try:
                cur.execute(f"ALTER TABLE vocabulary ADD COLUMN {col} {col_type}")
                conn.commit()
            except Exception:
                conn.rollback()

        # Insert default 'General' chapter if missing, and remove 'General' from topics
        try:
            cur.execute("INSERT INTO chapters (name, description) VALUES ('General', 'Default vocabulary collection') ON CONFLICT DO NOTHING")
            cur.execute("DELETE FROM topics WHERE LOWER(name) = 'general'")
            cur.execute("UPDATE vocabulary SET topic_name = '' WHERE LOWER(topic_name) = 'general'")
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
            CREATE TABLE IF NOT EXISTS chapter_subheadings (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                chapter_name TEXT NOT NULL COLLATE NOCASE,
                name         TEXT NOT NULL COLLATE NOCASE,
                description  TEXT DEFAULT '',
                created_at   DATETIME DEFAULT (datetime('now')),
                UNIQUE(chapter_name, name)
            );
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS topics (
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
                subheading    TEXT    DEFAULT '',
                topic_name    TEXT    DEFAULT '',
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
                              ("chapter_name", "TEXT DEFAULT 'General'"),
                              ("subheading", "TEXT DEFAULT ''"),
                              ("topic_name", "TEXT DEFAULT ''")]:
            try:
                conn.execute(f"ALTER TABLE vocabulary ADD COLUMN {col} {col_type}")
                conn.commit()
            except Exception:
                pass

        # Insert default 'General' chapter if missing, and remove 'General' from topics
        try:
            conn.execute("INSERT OR IGNORE INTO chapters (name, description) VALUES ('General', 'Default vocabulary collection')")
            conn.execute("DELETE FROM topics WHERE LOWER(name) = 'general'")
            conn.execute("UPDATE vocabulary SET topic_name = '' WHERE topic_name = 'General' COLLATE NOCASE")
            conn.commit()
        except Exception:
            pass

    # Synchronize all Vocabulary Topics as subheadings in chapter 'General'
    try:
        if USE_POSTGRES:
            cur = conn.cursor()
            cur.execute("SELECT name, description FROM topics")
            top_rows = cur.fetchall()
            for t in top_rows:
                t_name = t["name"].strip()
                t_desc = (t.get("description") or "").strip()
                cur.execute("""
                    INSERT INTO chapter_subheadings (chapter_name, name, description)
                    VALUES ('General', %s, %s)
                    ON CONFLICT (chapter_name, name) DO UPDATE SET description = EXCLUDED.description
                """, (t_name, t_desc))
            cur.execute("""
                UPDATE vocabulary
                SET subheading = topic_name
                WHERE topic_name != '' AND (chapter_name = 'General' OR subheading = '')
            """)
            conn.commit()
            cur.close()
        else:
            top_rows = conn.execute("SELECT name, description FROM topics").fetchall()
            for t in top_rows:
                t_name = t["name"].strip()
                t_desc = (t["description"] or "").strip() if "description" in t.keys() else ""
                conn.execute("""
                    INSERT OR IGNORE INTO chapter_subheadings (chapter_name, name, description)
                    VALUES ('General', ?, ?)
                """, (t_name, t_desc))
            conn.execute("""
                UPDATE vocabulary
                SET subheading = topic_name
                WHERE topic_name != '' AND (chapter_name = 'General' OR subheading = '')
            """)
            conn.commit()
    except Exception:
        pass

    conn.close()


# ── Chapter CRUD operations ──────────────────────────────────────────────────

def get_all_chapters() -> list[dict]:
    """Return all chapters ordered by id with word count statistics and subheadings."""
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
        chapters = [{
            "id": r["id"],
            "name": r["name"],
            "description": r["description"],
            "word_count": r["word_count"]
        } for r in rows]
    else:
        rows = conn.execute(query).fetchall()
        conn.close()
        chapters = [{
            "id": r["id"],
            "name": r["name"],
            "description": r["description"],
            "word_count": r["word_count"]
        } for r in rows]

    # Attach subheadings to each chapter
    for ch in chapters:
        ch["subheadings"] = get_subheadings(ch["name"])
    return chapters


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
        return {"id": chapter_id, "name": name_clean, "description": description.strip(), "word_count": 0, "subheadings": []}
    except (psycopg2.IntegrityError if USE_POSTGRES else sqlite3.IntegrityError):
        if USE_POSTGRES:
            conn.rollback()
        raise DuplicateChapterError(name_clean)
    finally:
        conn.close()


def update_chapter(old_name: str, new_name: str, description: str = "") -> None:
    """Rename a chapter and update all assigned words & subheadings. Raises ChapterNotFoundError or DuplicateChapterError."""
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
            # Update subheadings assigned to old chapter
            cur.execute(
                "UPDATE chapter_subheadings SET chapter_name = %s WHERE LOWER(chapter_name) = LOWER(%s)",
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
            # Update subheadings assigned to old chapter
            conn.execute(
                "UPDATE chapter_subheadings SET chapter_name = ? WHERE chapter_name = ? COLLATE NOCASE",
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
    """Delete a chapter, clear its subheadings, and reassign its words to 'General'."""
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
            cur.execute("UPDATE vocabulary SET chapter_name = 'General', subheading = '' WHERE LOWER(chapter_name) = LOWER(%s)", (name_clean,))
            cur.execute("DELETE FROM chapter_subheadings WHERE LOWER(chapter_name) = LOWER(%s)", (name_clean,))
            conn.commit()
            cur.close()
        else:
            result = conn.execute("DELETE FROM chapters WHERE name = ? COLLATE NOCASE", (name_clean,))
            if result.rowcount == 0:
                conn.rollback()
                raise ChapterNotFoundError(name_clean)
            conn.execute("UPDATE vocabulary SET chapter_name = 'General', subheading = '' WHERE chapter_name = ? COLLATE NOCASE", (name_clean,))
            conn.execute("DELETE FROM chapter_subheadings WHERE chapter_name = ? COLLATE NOCASE", (name_clean,))
            conn.commit()
    finally:
        conn.close()


# ── Subheading CRUD operations ───────────────────────────────────────────────

def get_subheadings(chapter_name: str = None) -> list[dict]:
    """Return all subheadings (optionally filtered by chapter) with word count statistics."""
    conn = _get_conn()
    if chapter_name:
        if USE_POSTGRES:
            query = """
                SELECT s.id, s.chapter_name, s.name, COALESCE(s.description, '') as description, COUNT(v.id) as word_count
                FROM chapter_subheadings s
                LEFT JOIN vocabulary v ON LOWER(s.chapter_name) = LOWER(v.chapter_name) AND LOWER(s.name) = LOWER(v.subheading)
                WHERE LOWER(s.chapter_name) = LOWER(%s)
                GROUP BY s.id, s.chapter_name, s.name, s.description
                ORDER BY s.id ASC
            """
            cur = conn.cursor()
            cur.execute(query, (chapter_name.strip(),))
            rows = cur.fetchall()
            cur.close()
            conn.close()
        else:
            query = """
                SELECT s.id, s.chapter_name, s.name, COALESCE(s.description, '') as description, COUNT(v.id) as word_count
                FROM chapter_subheadings s
                LEFT JOIN vocabulary v ON LOWER(s.chapter_name) = LOWER(v.chapter_name) AND LOWER(s.name) = LOWER(v.subheading)
                WHERE s.chapter_name = ? COLLATE NOCASE
                GROUP BY s.id, s.chapter_name, s.name, s.description
                ORDER BY s.id ASC
            """
            rows = conn.execute(query, (chapter_name.strip(),)).fetchall()
            conn.close()
    else:
        query = """
            SELECT s.id, s.chapter_name, s.name, COALESCE(s.description, '') as description, COUNT(v.id) as word_count
            FROM chapter_subheadings s
            LEFT JOIN vocabulary v ON LOWER(s.chapter_name) = LOWER(v.chapter_name) AND LOWER(s.name) = LOWER(v.subheading)
            GROUP BY s.id, s.chapter_name, s.name, s.description
            ORDER BY s.id ASC
        """
        if USE_POSTGRES:
            cur = conn.cursor()
            cur.execute(query)
            rows = cur.fetchall()
            cur.close()
            conn.close()
        else:
            rows = conn.execute(query).fetchall()
            conn.close()

    return [{
        "id": r["id"],
        "chapter_name": r["chapter_name"],
        "name": r["name"],
        "description": r["description"],
        "word_count": r["word_count"]
    } for r in rows]


def add_subheading(chapter_name: str, name: str, description: str = "") -> dict:
    """Add a new subheading to a chapter. Raises DuplicateSubheadingError if already exists."""
    ch_clean = chapter_name.strip()
    name_clean = name.strip()
    if not ch_clean:
        raise ValueError("Chapter name cannot be empty")
    if not name_clean:
        raise ValueError("Subheading name cannot be empty")

    conn = _get_conn()
    try:
        if USE_POSTGRES:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO chapter_subheadings (chapter_name, name, description) VALUES (%s, %s, %s) RETURNING id",
                (ch_clean, name_clean, description.strip())
            )
            sub_id = cur.fetchone()["id"]
            conn.commit()
            cur.close()
        else:
            result = conn.execute(
                "INSERT INTO chapter_subheadings (chapter_name, name, description) VALUES (?, ?, ?)",
                (ch_clean, name_clean, description.strip())
            )
            sub_id = result.lastrowid
            conn.commit()
        return {"id": sub_id, "chapter_name": ch_clean, "name": name_clean, "description": description.strip(), "word_count": 0}
    except (psycopg2.IntegrityError if USE_POSTGRES else sqlite3.IntegrityError):
        if USE_POSTGRES:
            conn.rollback()
        raise DuplicateSubheadingError(ch_clean, name_clean)
    finally:
        conn.close()


def update_subheading(chapter_name: str, old_name: str, new_name: str, description: str = "") -> None:
    """Rename a subheading and update assigned words. Raises SubheadingNotFoundError or DuplicateSubheadingError."""
    ch_clean = chapter_name.strip()
    old_clean = old_name.strip()
    new_clean = new_name.strip()
    if not ch_clean or not old_clean or not new_clean:
        raise ValueError("Names cannot be empty")

    conn = _get_conn()
    try:
        if USE_POSTGRES:
            cur = conn.cursor()
            cur.execute(
                "UPDATE chapter_subheadings SET name = %s, description = %s WHERE LOWER(chapter_name) = LOWER(%s) AND LOWER(name) = LOWER(%s)",
                (new_clean, description.strip(), ch_clean, old_clean)
            )
            if cur.rowcount == 0:
                cur.close()
                conn.rollback()
                raise SubheadingNotFoundError(ch_clean, old_clean)
            cur.execute(
                "UPDATE vocabulary SET subheading = %s WHERE LOWER(chapter_name) = LOWER(%s) AND LOWER(subheading) = LOWER(%s)",
                (new_clean, ch_clean, old_clean)
            )
            conn.commit()
            cur.close()
        else:
            result = conn.execute(
                "UPDATE chapter_subheadings SET name = ?, description = ? WHERE chapter_name = ? COLLATE NOCASE AND name = ? COLLATE NOCASE",
                (new_clean, description.strip(), ch_clean, old_clean)
            )
            if result.rowcount == 0:
                conn.rollback()
                raise SubheadingNotFoundError(ch_clean, old_clean)
            conn.execute(
                "UPDATE vocabulary SET subheading = ? WHERE chapter_name = ? COLLATE NOCASE AND subheading = ? COLLATE NOCASE",
                (new_clean, ch_clean, old_clean)
            )
            conn.commit()
    except (SubheadingNotFoundError, DuplicateSubheadingError):
        if USE_POSTGRES:
            conn.rollback()
        raise
    except (psycopg2.IntegrityError if USE_POSTGRES else sqlite3.IntegrityError):
        if USE_POSTGRES:
            conn.rollback()
        raise DuplicateSubheadingError(ch_clean, new_clean)
    finally:
        conn.close()


def delete_subheading(chapter_name: str, name: str) -> None:
    """Delete a subheading and clear subheading from assigned words."""
    ch_clean = chapter_name.strip()
    name_clean = name.strip()
    conn = _get_conn()
    try:
        if USE_POSTGRES:
            cur = conn.cursor()
            cur.execute("DELETE FROM chapter_subheadings WHERE LOWER(chapter_name) = LOWER(%s) AND LOWER(name) = LOWER(%s)", (ch_clean, name_clean))
            if cur.rowcount == 0:
                cur.close()
                conn.rollback()
                raise SubheadingNotFoundError(ch_clean, name_clean)
            cur.execute("UPDATE vocabulary SET subheading = '' WHERE LOWER(chapter_name) = LOWER(%s) AND LOWER(subheading) = LOWER(%s)", (ch_clean, name_clean))
            conn.commit()
            cur.close()
        else:
            result = conn.execute("DELETE FROM chapter_subheadings WHERE chapter_name = ? COLLATE NOCASE AND name = ? COLLATE NOCASE", (ch_clean, name_clean))
            if result.rowcount == 0:
                conn.rollback()
                raise SubheadingNotFoundError(ch_clean, name_clean)
            conn.execute("UPDATE vocabulary SET subheading = '' WHERE chapter_name = ? COLLATE NOCASE AND subheading = ? COLLATE NOCASE", (ch_clean, name_clean))
            conn.commit()
    finally:
        conn.close()


def assign_words_to_subheading(chapter_name: str, subheading: str, german_words: list[str]) -> int:
    """Assign multiple words to a chapter and subheading."""
    ch_clean = chapter_name.strip()
    sub_clean = subheading.strip()
    if not german_words:
        return 0

    conn = _get_conn()
    updated = 0
    try:
        if USE_POSTGRES:
            cur = conn.cursor()
            for word in german_words:
                cur.execute(
                    "UPDATE vocabulary SET chapter_name = %s, subheading = %s WHERE LOWER(german) = LOWER(%s)",
                    (ch_clean, sub_clean, word.strip())
                )
                updated += cur.rowcount
            conn.commit()
            cur.close()
        else:
            for word in german_words:
                res = conn.execute(
                    "UPDATE vocabulary SET chapter_name = ?, subheading = ? WHERE german = ? COLLATE NOCASE",
                    (ch_clean, sub_clean, word.strip())
                )
                updated += res.rowcount
            conn.commit()
    finally:
        conn.close()
    return updated


# ── Topic CRUD operations ───────────────────────────────────────────────────

def get_all_topics() -> list[dict]:
    """Return all topics ordered by id with word count statistics."""
    conn = _get_conn()
    query = """
        SELECT t.id, t.name, COALESCE(t.description, '') as description, COUNT(v.id) as word_count
        FROM topics t
        LEFT JOIN vocabulary v ON LOWER(t.name) = LOWER(v.topic_name)
        GROUP BY t.id, t.name, t.description
        ORDER BY t.id ASC
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


def add_topic(name: str, description: str = "") -> dict:
    """Add a new topic and sync as a subheading in 'General'. Raises DuplicateTopicError if already exists."""
    name_clean = name.strip()
    if not name_clean:
        raise ValueError("Topic name cannot be empty")

    conn = _get_conn()
    try:
        if USE_POSTGRES:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO topics (name, description) VALUES (%s, %s) RETURNING id",
                (name_clean, description.strip())
            )
            topic_id = cur.fetchone()["id"]
            cur.execute("""
                INSERT INTO chapter_subheadings (chapter_name, name, description)
                VALUES ('General', %s, %s)
                ON CONFLICT (chapter_name, name) DO NOTHING
            """, (name_clean, description.strip()))
            conn.commit()
            cur.close()
        else:
            result = conn.execute(
                "INSERT INTO topics (name, description) VALUES (?, ?)",
                (name_clean, description.strip())
            )
            topic_id = result.lastrowid
            conn.execute("""
                INSERT OR IGNORE INTO chapter_subheadings (chapter_name, name, description)
                VALUES ('General', ?, ?)
            """, (name_clean, description.strip()))
            conn.commit()
        return {"id": topic_id, "name": name_clean, "description": description.strip(), "word_count": 0}
    except (psycopg2.IntegrityError if USE_POSTGRES else sqlite3.IntegrityError):
        if USE_POSTGRES:
            conn.rollback()
        raise DuplicateTopicError(name_clean)
    finally:
        conn.close()


def update_topic(old_name: str, new_name: str, description: str = "") -> None:
    """Rename a topic and update all assigned words and General subheading. Raises TopicNotFoundError or DuplicateTopicError."""
    old_clean = old_name.strip()
    new_clean = new_name.strip()

    if not old_clean or not new_clean:
        raise ValueError("Topic names cannot be empty")

    conn = _get_conn()
    try:
        if USE_POSTGRES:
            cur = conn.cursor()
            cur.execute(
                "UPDATE topics SET name = %s, description = %s WHERE LOWER(name) = LOWER(%s)",
                (new_clean, description.strip(), old_clean)
            )
            if cur.rowcount == 0:
                cur.close()
                conn.rollback()
                raise TopicNotFoundError(old_clean)
            
            cur.execute(
                "UPDATE vocabulary SET topic_name = %s WHERE LOWER(topic_name) = LOWER(%s)",
                (new_clean, old_clean)
            )
            cur.execute(
                "UPDATE chapter_subheadings SET name = %s, description = %s WHERE LOWER(chapter_name) = 'general' AND LOWER(name) = LOWER(%s)",
                (new_clean, description.strip(), old_clean)
            )
            cur.execute(
                "UPDATE vocabulary SET subheading = %s WHERE LOWER(chapter_name) = 'general' AND LOWER(subheading) = LOWER(%s)",
                (new_clean, old_clean)
            )
            conn.commit()
            cur.close()
        else:
            result = conn.execute(
                "UPDATE topics SET name = ?, description = ? WHERE name = ? COLLATE NOCASE",
                (new_clean, description.strip(), old_clean)
            )
            if result.rowcount == 0:
                conn.rollback()
                raise TopicNotFoundError(old_clean)

            conn.execute(
                "UPDATE vocabulary SET topic_name = ? WHERE topic_name = ? COLLATE NOCASE",
                (new_clean, old_clean)
            )
            conn.execute(
                "UPDATE chapter_subheadings SET name = ?, description = ? WHERE chapter_name = 'General' COLLATE NOCASE AND name = ? COLLATE NOCASE",
                (new_clean, description.strip(), old_clean)
            )
            conn.execute(
                "UPDATE vocabulary SET subheading = ? WHERE chapter_name = 'General' COLLATE NOCASE AND subheading = ? COLLATE NOCASE",
                (new_clean, old_clean)
            )
            conn.commit()
    except (TopicNotFoundError, DuplicateTopicError):
        if USE_POSTGRES:
            conn.rollback()
        raise
    except (psycopg2.IntegrityError if USE_POSTGRES else sqlite3.IntegrityError):
        if USE_POSTGRES:
            conn.rollback()
        raise DuplicateTopicError(new_clean)
    finally:
        conn.close()


def delete_topic(name: str) -> None:
    """Delete a topic and reset topic assignment and General subheading on assigned words."""
    name_clean = name.strip()
    if not name_clean:
        raise ValueError("Topic name cannot be empty")

    conn = _get_conn()
    try:
        if USE_POSTGRES:
            cur = conn.cursor()
            cur.execute("DELETE FROM topics WHERE LOWER(name) = LOWER(%s)", (name_clean,))
            if cur.rowcount == 0:
                cur.close()
                conn.rollback()
                raise TopicNotFoundError(name_clean)
            cur.execute("UPDATE vocabulary SET topic_name = '' WHERE LOWER(topic_name) = LOWER(%s)", (name_clean,))
            cur.execute("DELETE FROM chapter_subheadings WHERE LOWER(chapter_name) = 'general' AND LOWER(name) = LOWER(%s)", (name_clean,))
            cur.execute("UPDATE vocabulary SET subheading = '' WHERE LOWER(chapter_name) = 'general' AND LOWER(subheading) = LOWER(%s)", (name_clean,))
            conn.commit()
            cur.close()
        else:
            result = conn.execute("DELETE FROM topics WHERE name = ? COLLATE NOCASE", (name_clean,))
            if result.rowcount == 0:
                conn.rollback()
                raise TopicNotFoundError(name_clean)
            conn.execute("UPDATE vocabulary SET topic_name = '' WHERE topic_name = ? COLLATE NOCASE", (name_clean,))
            conn.execute("DELETE FROM chapter_subheadings WHERE chapter_name = 'General' COLLATE NOCASE AND name = ? COLLATE NOCASE", (name_clean,))
            conn.execute("UPDATE vocabulary SET subheading = '' WHERE chapter_name = 'General' COLLATE NOCASE AND subheading = ? COLLATE NOCASE", (name_clean,))
            conn.commit()
    finally:
        conn.close()


# ── CRUD operations ──────────────────────────────────────────────────────────

def get_all_words() -> list[dict]:
    """Return all words ordered newest first with practice stats, chapter assignment, subheading, and topic assignment."""
    conn = _get_conn()
    query = "SELECT german, english, COALESCE(chapter_name, 'General') as chapter_name, COALESCE(subheading, '') as subheading, COALESCE(topic_name, '') as topic_name, COALESCE(times_asked, 0) as times_asked, COALESCE(times_correct, 0) as times_correct, COALESCE(times_wrong, 0) as times_wrong FROM vocabulary ORDER BY id DESC"
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
            "subheading": r["subheading"],
            "topic_name": r["topic_name"],
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
            "subheading": r["subheading"],
            "topic_name": r["topic_name"],
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
            "SELECT id, german, english, chapter_name, subheading, topic_name FROM vocabulary WHERE LOWER(german) = LOWER(%s)",
            (german,)
        )
        row = cur.fetchone()
        cur.close()
        return dict(row) if row else None
    else:
        row = conn.execute(
            "SELECT id, german, english, chapter_name, subheading, topic_name FROM vocabulary WHERE german = ? COLLATE NOCASE",
            (german,)
        ).fetchone()
        return dict(row) if row else None


def add_word(german: str, english: str, chapter_name: str = "General", topic_name: str = "", subheading: str = "", upsert: bool = True) -> bool:
    """Insert a new word or update chapter/subheading/topic if word already exists."""
    ch_clean = chapter_name.strip() if chapter_name else "General"
    top_clean = topic_name.strip() if topic_name else ""
    sub_clean = subheading.strip() if subheading else ""
    conn = _get_conn()
    try:
        existing = _find_word(conn, german)
        if existing:
            if not upsert:
                raise DuplicateWordError(german)
            target_topic = top_clean if top_clean else (existing.get("topic_name") or "")
            target_english = english.strip() if english.strip() else (existing.get("english") or "")
            if USE_POSTGRES:
                cur = conn.cursor()
                cur.execute(
                    "UPDATE vocabulary SET english = %s, chapter_name = %s, subheading = %s, topic_name = %s WHERE id = %s",
                    (target_english, ch_clean, sub_clean, target_topic, existing["id"])
                )
                conn.commit()
                cur.close()
            else:
                conn.execute(
                    "UPDATE vocabulary SET english = ?, chapter_name = ?, subheading = ?, topic_name = ? WHERE id = ?",
                    (target_english, ch_clean, sub_clean, target_topic, existing["id"])
                )
                conn.commit()
            return False  # updated existing

        if USE_POSTGRES:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO vocabulary (german, english, chapter_name, subheading, topic_name) VALUES (%s, %s, %s, %s, %s)",
                (german, english, ch_clean, sub_clean, top_clean)
            )
            conn.commit()
            cur.close()
        else:
            conn.execute(
                "INSERT INTO vocabulary (german, english, chapter_name, subheading, topic_name) VALUES (?, ?, ?, ?, ?)",
                (german, english, ch_clean, sub_clean, top_clean)
            )
            conn.commit()
        return True  # created new
    except (psycopg2.IntegrityError if USE_POSTGRES else sqlite3.IntegrityError):
        if USE_POSTGRES:
            conn.rollback()
        if upsert:
            return False
        raise DuplicateWordError(german)
    finally:
        conn.close()


def update_word(old_german: str, new_german: str, new_english: str, chapter_name: str = None, topic_name: str = None, subheading: str = None) -> None:
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

        ch = chapter_name.strip() if chapter_name is not None else (existing.get("chapter_name") or "General")
        top = topic_name.strip() if topic_name is not None else (existing.get("topic_name") or "")
        sub = subheading.strip() if subheading is not None else (existing.get("subheading") or "")

        if USE_POSTGRES:
            cur = conn.cursor()
            cur.execute(
                "UPDATE vocabulary SET german = %s, english = %s, chapter_name = %s, subheading = %s, topic_name = %s WHERE id = %s",
                (new_german, new_english, ch, sub, top, existing["id"])
            )
            conn.commit()
            cur.close()
        else:
            conn.execute(
                "UPDATE vocabulary SET german = ?, english = ?, chapter_name = ?, subheading = ?, topic_name = ? WHERE id = ?",
                (new_german, new_english, ch, sub, top, existing["id"])
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


def assign_words_to_topic(topic_name: str, german_words: list[str]) -> int:
    """Assign multiple words to a given topic and sync subheading in General. Returns count of updated words."""
    top_clean = topic_name.strip()
    if not german_words:
        return 0

    conn = _get_conn()
    updated = 0
    try:
        if USE_POSTGRES:
            cur = conn.cursor()
            for word in german_words:
                cur.execute(
                    "UPDATE vocabulary SET topic_name = %s WHERE LOWER(german) = LOWER(%s)",
                    (top_clean, word.strip())
                )
                cur.execute(
                    "UPDATE vocabulary SET subheading = %s WHERE LOWER(german) = LOWER(%s) AND (LOWER(chapter_name) = 'general' OR subheading = '')",
                    (top_clean, word.strip())
                )
                updated += cur.rowcount
            conn.commit()
            cur.close()
        else:
            for word in german_words:
                res = conn.execute(
                    "UPDATE vocabulary SET topic_name = ? WHERE german = ? COLLATE NOCASE",
                    (top_clean, word.strip())
                )
                conn.execute(
                    "UPDATE vocabulary SET subheading = ? WHERE german = ? COLLATE NOCASE AND (chapter_name = 'General' COLLATE NOCASE OR subheading = '')",
                    (top_clean, word.strip())
                )
                updated += res.rowcount
            conn.commit()
    finally:
        conn.close()
    return updated


def assign_words_to_chapter(chapter_name: str, german_words: list[str]) -> int:
    """Assign multiple words to a given chapter. Returns count of updated words."""
    ch_clean = chapter_name.strip()
    if not german_words:
        return 0

    conn = _get_conn()
    updated = 0
    try:
        if USE_POSTGRES:
            cur = conn.cursor()
            for word in german_words:
                cur.execute(
                    "UPDATE vocabulary SET chapter_name = %s WHERE LOWER(german) = LOWER(%s)",
                    (ch_clean, word.strip())
                )
                updated += cur.rowcount
            conn.commit()
            cur.close()
        else:
            for word in german_words:
                res = conn.execute(
                    "UPDATE vocabulary SET chapter_name = ? WHERE german = ? COLLATE NOCASE",
                    (ch_clean, word.strip())
                )
                updated += res.rowcount
            conn.commit()
    finally:
        conn.close()
    return updated


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
