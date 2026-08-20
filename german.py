"""
German Vocabulary Builder & Learning Platform - Standalone Program
-------------------------------------------------------------------
Interactive web-based German learning program featuring flashcard practice,
chapter organization, speech pronunciation, quiz scoring, and vocabulary tables.

Usage:
  python german.py        -> Starts the web interface and opens browser
  python german.py --cli  -> Starts the command-line interface
"""

import os
import re
import socket
import sqlite3
import sys
import threading
import time
import webbrowser
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn

import database

# Initialize database schema
database.init_db()

app = FastAPI(title="Wortschatz - German Vocabulary Builder")

# Ensure static and template folders exist
os.makedirs("static", exist_ok=True)
os.makedirs("templates", exist_ok=True)

app.mount("/static", StaticFiles(directory="static"), name="static")


# ── Pydantic Request Schemas ──────────────────────────────────────────────────

class WordEntry(BaseModel):
    german: str
    english: str
    chapter_name: str = "General"


class EditWordEntry(BaseModel):
    old_german: str
    new_german: str
    new_english: str
    chapter_name: Optional[str] = "General"


class TextImportEntry(BaseModel):
    text: str
    chapter_name: Optional[str] = "General"


class PracticeResultEntry(BaseModel):
    german: str
    is_correct: bool


class ChapterCreateRequest(BaseModel):
    name: str
    description: str = ""


class ChapterUpdateRequest(BaseModel):
    old_name: str
    new_name: str
    description: str = ""


# ── REST API Routes ──────────────────────────────────────────────────────────

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(status_code=204)


@app.get("/")
async def get_index():
    return FileResponse("templates/index.html")


@app.get("/api/chapters")
def get_chapters():
    try:
        return database.get_all_chapters()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/chapters")
def create_chapter(req: ChapterCreateRequest):
    try:
        chapter = database.add_chapter(req.name, req.description)
        return {"message": f"Chapter '{req.name}' created successfully", "chapter": chapter}
    except database.DuplicateChapterError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/chapters")
def edit_chapter(req: ChapterUpdateRequest):
    try:
        database.update_chapter(req.old_name, req.new_name, req.description)
        return {"message": f"Chapter '{req.old_name}' renamed to '{req.new_name}' successfully"}
    except database.ChapterNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except database.DuplicateChapterError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/chapters")
def remove_chapter(name: str):
    try:
        database.delete_chapter(name)
        return {"message": f"Chapter '{name}' deleted successfully. Assigned words moved to 'General'."}
    except database.ChapterNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
    chapter = entry.chapter_name.strip() if entry.chapter_name else "General"

    if not german or not english:
        raise HTTPException(status_code=400, detail="German and English fields cannot be empty")

    try:
        database.add_word(german, english, chapter_name=chapter)
        return {"message": f"Saved '{german}' to chapter '{chapter}'", "german": german, "english": english, "chapter_name": chapter}
    except database.DuplicateWordError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/words")
def edit_word(entry: EditWordEntry):
    old_g = entry.old_german.strip()
    new_g = entry.new_german.strip()
    new_e = entry.new_english.strip()

    if not old_g or not new_g or not new_e:
        raise HTTPException(status_code=400, detail="Fields cannot be empty")

    try:
        database.update_word(old_g, new_g, new_e)
        return {"message": f"Updated '{old_g}' successfully", "german": new_g, "english": new_e}
    except database.WordNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except database.DuplicateWordError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/words")
def delete_word(german: str):
    try:
        database.delete_word(german.strip())
        return {"message": f"Deleted '{german}' successfully"}
    except database.WordNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/words/practice-result")
def record_practice(entry: PracticeResultEntry):
    german = entry.german.strip()
    if not german:
        raise HTTPException(status_code=400, detail="German word required")
    try:
        database.record_practice_result(german, entry.is_correct)
        return {"message": "Practice result recorded"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/words/upload")
def bulk_upload(payload: TextImportEntry):
    raw_text = payload.text.strip()
    chapter = payload.chapter_name.strip() if payload.chapter_name else "General"
    if not raw_text:
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    lines = raw_text.splitlines()
    added_count = 0
    duplicate_count = 0

    for line in lines:
        line = line.strip()
        if not line or line.startswith("#"):
            continue

        delimiters = ["-", "/", ":", "="]
        german, english = "", ""

        for delim in delimiters:
            if delim in line:
                parts = line.split(delim, 1)
                german = parts[0].strip()
                english = parts[1].strip()
                break

        if german and english:
            try:
                database.add_word(german, english, chapter_name=chapter)
                added_count += 1
            except database.DuplicateWordError:
                duplicate_count += 1
            except Exception:
                pass

    return {
        "message": f"Processed {len(lines)} lines into chapter '{chapter}'",
        "added": added_count,
        "duplicates": duplicate_count
    }


# ── Interactive Launcher ────────────────────────────────────────────────────

def view_words_cli():
    words = database.get_all_words()
    if words:
        print("\n--- Your Vocabulary List ---")
        for item in words:
            ch = f" [{item.get('chapter_name', 'General')}]" if item.get('chapter_name') else ""
            print(f"• {item['german']} - {item['english']}{ch}")
        print("-----------------------------\n")
    else:
        print("\nNo words saved yet.\n")


def run_cli():
    print("=== German Vocabulary Builder (CLI Mode) ===")
    print("Type 'q' to quit, 'v' to view saved words.\n")

    while True:
        german = input("German word/phrase (or 'q'/'v'): ").strip()

        if german.lower() == "q":
            print("Goodbye! Viel Erfolg beim Lernen! 👋")
            break
        elif german.lower() == "v":
            view_words_cli()
            continue
        elif german == "":
            print("Please enter a word, or 'q' to quit.\n")
            continue

        english = input("English meaning: ").strip()
        try:
            database.add_word(german, english)
            print(f"Saved: {german} - {english}\n")
        except database.DuplicateWordError:
            print(f"⚠ The word '{german}' already exists in your vocabulary.\n")


def find_available_port(host="127.0.0.1", start_port=8000, max_attempts=50):
    for port in range(start_port, start_port + max_attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind((host, port))
                return port
            except OSError:
                continue
    return start_port


def open_browser(port: int):
    time.sleep(1.2)
    url = f"http://127.0.0.1:{port}"
    print(f"[Wortschatz App] Opening web browser interface: {url}")
    webbrowser.open(url)


def run_web():
    port = find_available_port("127.0.0.1", 8000)
    url = f"http://127.0.0.1:{port}"
    print(f"=== German Vocabulary Learning Platform ===")
    print(f"Server starting on {url}")

    # Launch default web browser in background thread
    threading.Thread(target=open_browser, args=(port,), daemon=True).start()

    try:
        uvicorn.run(app, host="127.0.0.1", port=port, reload=False)
    except Exception as e:
        print(f"Server execution error: {e}")


def main():
    if len(sys.argv) > 1 and sys.argv[1] in ("--cli", "-c"):
        run_cli()
    else:
        run_web()


if __name__ == "__main__":
    main()