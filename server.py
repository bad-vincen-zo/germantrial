import os
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn

import database
from database import DuplicateWordError, WordNotFoundError

app = FastAPI(title="German Vocabulary Builder API")

# Initialise DB table on startup
database.init_db()

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
        return database.get_all_words()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/words")
def add_word(entry: WordEntry):
    german = entry.german.strip()
    english = entry.english.strip()

    if not german or not english:
        raise HTTPException(status_code=400, detail="German and English fields cannot be empty")

    try:
        database.add_word(german, english)
    except DuplicateWordError as e:
        raise HTTPException(status_code=400, detail=str(e))
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
        database.update_word(old_german, new_german, new_english)
    except WordNotFoundError:
        raise HTTPException(status_code=404, detail="Original word not found")
    except DuplicateWordError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"message": "Word updated successfully"}


@app.delete("/api/words")
def delete_word(german: str):
    try:
        database.delete_word(german.strip())
    except WordNotFoundError:
        raise HTTPException(status_code=404, detail="Word not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"message": "Word deleted successfully"}


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=False)
