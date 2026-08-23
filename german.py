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

from fastapi import FastAPI, HTTPException, Response, File, UploadFile, Form
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
    subheading: Optional[str] = ""
    topic_name: Optional[str] = ""


class EditWordEntry(BaseModel):
    old_german: str
    new_german: str
    new_english: str
    chapter_name: Optional[str] = None
    subheading: Optional[str] = None
    topic_name: Optional[str] = None


class TextImportEntry(BaseModel):
    text: str
    chapter_name: Optional[str] = "General"
    subheading: Optional[str] = ""
    topic_name: Optional[str] = ""


class ChapterAssignRequest(BaseModel):
    chapter_name: str
    words: List[str]


class SubheadingCreateRequest(BaseModel):
    chapter_name: str
    name: str
    description: str = ""


class SubheadingUpdateRequest(BaseModel):
    chapter_name: str
    old_name: str
    new_name: str
    description: str = ""


class SubheadingAssignRequest(BaseModel):
    chapter_name: str
    subheading: str
    words: List[str]


class TopicAssignRequest(BaseModel):
    topic_name: str
    words: List[str]


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


class TopicCreateRequest(BaseModel):
    name: str
    description: str = ""


class TopicUpdateRequest(BaseModel):
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


@app.post("/api/chapters/assign-words")
def assign_words_to_chapter_route(req: ChapterAssignRequest):
    try:
        updated = database.assign_words_to_chapter(req.chapter_name, req.words)
        return {"message": f"Assigned {updated} words to chapter '{req.chapter_name}'", "updated": updated}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/subheadings")
def get_subheadings_route(chapter_name: Optional[str] = None):
    try:
        return database.get_subheadings(chapter_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/subheadings")
def create_subheading_route(req: SubheadingCreateRequest):
    try:
        sub = database.add_subheading(req.chapter_name, req.name, req.description)
        return {"message": f"Subheading '{req.name}' created in chapter '{req.chapter_name}'", "subheading": sub}
    except database.DuplicateSubheadingError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/subheadings")
def edit_subheading_route(req: SubheadingUpdateRequest):
    try:
        database.update_subheading(req.chapter_name, req.old_name, req.new_name, req.description)
        return {"message": f"Subheading '{req.old_name}' updated to '{req.new_name}'"}
    except database.SubheadingNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except database.DuplicateSubheadingError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/subheadings")
def remove_subheading_route(chapter_name: str, name: str):
    try:
        database.delete_subheading(chapter_name, name)
        return {"message": f"Subheading '{name}' deleted from chapter '{chapter_name}'."}
    except database.SubheadingNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/subheadings/assign-words")
def assign_words_to_subheading_route(req: SubheadingAssignRequest):
    try:
        updated = database.assign_words_to_subheading(req.chapter_name, req.subheading, req.words)
        return {"message": f"Assigned {updated} words to subheading '{req.subheading}'", "updated": updated}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/topics")
def get_topics():
    try:
        return database.get_all_topics()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/topics")
def create_topic(req: TopicCreateRequest):
    try:
        topic = database.add_topic(req.name, req.description)
        return {"message": f"Topic '{req.name}' created successfully", "topic": topic}
    except database.DuplicateTopicError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/topics")
def edit_topic(req: TopicUpdateRequest):
    try:
        database.update_topic(req.old_name, req.new_name, req.description)
        return {"message": f"Topic '{req.old_name}' renamed to '{req.new_name}' successfully"}
    except database.TopicNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except database.DuplicateTopicError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/topics")
def remove_topic(name: str):
    try:
        database.delete_topic(name)
        return {"message": f"Topic '{name}' deleted successfully."}
    except database.TopicNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/topics/assign-words")
def assign_words_to_topic_route(req: TopicAssignRequest):
    try:
        updated = database.assign_words_to_topic(req.topic_name, req.words)
        return {"message": f"Assigned {updated} words to topic '{req.topic_name}'", "updated": updated}
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
    subheading = entry.subheading.strip() if entry.subheading else ""
    topic = entry.topic_name.strip() if entry.topic_name else ""

    if not german or not english:
        raise HTTPException(status_code=400, detail="German and English fields cannot be empty")

    try:
        is_new = database.add_word(german, english, chapter_name=chapter, topic_name=topic, subheading=subheading, upsert=True)
        action_msg = "Saved" if is_new else "Updated & assigned"
        return {"message": f"{action_msg} '{german}'", "is_new": is_new, "german": german, "english": english, "chapter_name": chapter, "subheading": subheading, "topic_name": topic}
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
        database.update_word(old_g, new_g, new_e, chapter_name=entry.chapter_name, topic_name=entry.topic_name, subheading=entry.subheading)
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


def clean_brackets(text: str) -> str:
    """Remove all bracket pairs (), [], {}, <>, etc. and their contents."""
    pattern = r"\([^()]*\)|\[[^\[\]]*\]|\{[^{}]*\}|<[^<>]*>|（[^（）]*）|【[^【】]*】|〔[^〔〕]*〕|《[^《》]*》"
    while re.search(pattern, text):
        text = re.sub(pattern, "", text)
    # Clean any leftover unmatched bracket characters
    text = re.sub(r"[()[\]{}<>（）【】〔〕《》]", "", text)
    return text


def parse_vocab_line(line: str) -> tuple[str, str] | None:
    """
    Parse a vocabulary line according to import rules:
    1. Remove brackets and their contents: (content), [content], {content}, <content>.
    2. Split by primary delimiter ('/', '\t', ' – ', ' — ', ' - ', '–', '—', ':', '=', '-').
    3. Take only the first term before comma for both German and English (e.g. 'german1,german2' -> 'german1').
    4. Normalize internal whitespace.
    """
    line = line.strip()
    if not line or line.startswith("#"):
        return None

    # Step 1: Remove all brackets and their contents
    cleaned = clean_brackets(line)

    # Step 2: Split by delimiter (preferred: '/', then tab, spaced dashes, dashes, ':', '=')
    delimiters = ["/", "\t", " – ", " — ", " - ", "–", "—", ":", "=", "-"]
    german_part = ""
    english_part = ""

    for delim in delimiters:
        if delim in cleaned:
            parts = cleaned.split(delim, 1)
            p1 = parts[0].strip()
            p2 = parts[1].strip()
            if p1 and p2:
                german_part = p1
                english_part = p2
                break

    if not german_part or not english_part:
        return None

    # Step 3: If comma/semicolon-separated terms exist, only take the first term before comma
    # e.g. "german1,german2,german3" -> "german1"
    # e.g. "english1,english2" -> "english1"
    if "," in german_part or ";" in german_part:
        german_part = re.split(r"[,;]", german_part)[0].strip()
    if "," in english_part or ";" in english_part:
        english_part = re.split(r"[,;]", english_part)[0].strip()

    # Step 4: Clean up any leading numbering or bullet points
    german_part = re.sub(r"^[0-9]+[\.\)]\s*", "", german_part).strip()
    english_part = re.sub(r"^[0-9]+[\.\)]\s*", "", english_part).strip()

    # Step 5: Clean up any extra internal whitespace
    german_clean = re.sub(r"\s+", " ", german_part).strip()
    english_clean = re.sub(r"\s+", " ", english_part).strip()

    if german_clean and english_clean:
        return german_clean, english_clean
    return None


def process_import_lines(raw_text: str, chapter: str = "General", topic: str = "", subheading: str = "") -> dict:
    lines = raw_text.splitlines()
    added_count = 0
    updated_count = 0
    skipped_count = 0

    for line in lines:
        parsed = parse_vocab_line(line)
        if not parsed:
            skipped_count += 1
            continue

        german, english = parsed
        try:
            is_new = database.add_word(german, english, chapter_name=chapter, topic_name=topic, subheading=subheading, upsert=True)
            if is_new:
                added_count += 1
            else:
                updated_count += 1
        except Exception:
            skipped_count += 1

    return {
        "message": f"Processed {len(lines)} lines",
        "added": added_count,
        "updated": updated_count,
        "duplicates": 0,
        "skipped": skipped_count
    }


@app.post("/api/words/upload")
async def bulk_upload_file(
    file: UploadFile = File(...),
    chapter_name: Optional[str] = Form("General"),
    subheading: Optional[str] = Form(""),
    topic_name: Optional[str] = Form("")
):
    try:
        content_bytes = await file.read()
        try:
            raw_text = content_bytes.decode("utf-8")
        except UnicodeDecodeError:
            raw_text = content_bytes.decode("latin-1", errors="ignore")

        chapter = chapter_name.strip() if chapter_name else "General"
        sub = subheading.strip() if subheading else ""
        topic = topic_name.strip() if topic_name else ""
        return process_import_lines(raw_text, chapter=chapter, topic=topic, subheading=sub)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/words/import-text")
def bulk_import_text(payload: TextImportEntry):
    raw_text = payload.text.strip()
    chapter = payload.chapter_name.strip() if payload.chapter_name else "General"
    sub = payload.subheading.strip() if payload.subheading else ""
    topic = payload.topic_name.strip() if payload.topic_name else ""
    if not raw_text:
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    return process_import_lines(raw_text, chapter=chapter, topic=topic, subheading=sub)


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
        uvicorn.run("german:app", host="127.0.0.1", port=port, reload=True)
    except Exception as e:
        # Fallback to direct instance run if reload string fails
        try:
            uvicorn.run(app, host="127.0.0.1", port=port, reload=False)
        except Exception as inner_e:
            print(f"Server execution error: {inner_e}")


def main():
    if len(sys.argv) > 1 and sys.argv[1] in ("--cli", "-c"):
        run_cli()
    else:
        run_web()


if __name__ == "__main__":
    main()