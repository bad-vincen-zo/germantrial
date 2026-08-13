import os
import sqlite3
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn

app = FastAPI(title="German Vocabulary Builder API")

DB_PATH = "german_vocab.db"

# ── Database helpers ────────────────────────────────────────────────────────

def get_db():
    """Return a new SQLite connection with row_factory set."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create the vocabulary table if it doesn't exist yet."""
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS vocabulary (
                id         INTEGER  PRIMARY KEY AUTOINCREMENT,
                german     TEXT     NOT NULL UNIQUE COLLATE NOCASE,
                english    TEXT     NOT NULL,
                created_at DATETIME DEFAULT (datetime('now'))
            )
        """)
        conn.commit()


# Initialise DB on startup
init_db()

# ── Static / template mounts ────────────────────────────────────────────────

os.makedirs("static", exist_ok=True)
os.makedirs("templates", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")


# ── Pydantic models ─────────────────────────────────────────────────────────

class WordEntry(BaseModel):
    german: str
    english: str


class EditWordEntry(BaseModel):
    old_german: str
    new_german: str
    new_english: str


# ── Routes ───────────────────────────────────────────────────────────────────

@app.get("/")
def get_index():
    return FileResponse("templates/index.html")


@app.get("/api/words")
def get_words():
    try:
        with get_db() as conn:
            rows = conn.execute(
                "SELECT german, english FROM vocabulary ORDER BY id DESC"
            ).fetchall()
        return [{"german": r["german"], "english": r["english"]} for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/words")
def add_word(entry: WordEntry):
    german = entry.german.strip()
    english = entry.english.strip()

    if not german or not english:
        raise HTTPException(status_code=400, detail="German and English fields cannot be empty")

    try:
        with get_db() as conn:
            conn.execute(
                "INSERT INTO vocabulary (german, english) VALUES (?, ?)",
                (german, english)
            )
            conn.commit()
    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=400,
            detail=f"The word '{german}' already exists in your vocabulary."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"message": "Word added successfully", "word": {"german": german, "english": english}}


@app.put("/api/words")
def edit_word(entry: EditWordEntry):
    old_german = entry.old_german.strip()
    new_german = entry.new_german.strip()
    new_english = entry.new_english.strip()

    if not old_german or not new_german or not new_english:
        raise HTTPException(status_code=400, detail="All fields are required")

    try:
        with get_db() as conn:
            existing = conn.execute(
                "SELECT id FROM vocabulary WHERE german = ? COLLATE NOCASE",
                (old_german,)
            ).fetchone()
            if not existing:
                raise HTTPException(status_code=404, detail="Original word not found")

            if old_german.lower() != new_german.lower():
                collision = conn.execute(
                    "SELECT id FROM vocabulary WHERE german = ? COLLATE NOCASE",
                    (new_german,)
                ).fetchone()
                if collision:
                    raise HTTPException(
                        status_code=400,
                        detail=f"The word '{new_german}' already exists."
                    )

            conn.execute(
                "UPDATE vocabulary SET german = ?, english = ? WHERE id = ?",
                (new_german, new_english, existing["id"])
            )
            conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"message": "Word updated successfully"}


@app.delete("/api/words")
def delete_word(german: str):
    german_to_delete = german.strip()
    try:
        with get_db() as conn:
            result = conn.execute(
                "DELETE FROM vocabulary WHERE german = ? COLLATE NOCASE",
                (german_to_delete,)
            )
            conn.commit()
            if result.rowcount == 0:
                raise HTTPException(status_code=404, detail="Word not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"message": "Word deleted successfully"}


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=False)
