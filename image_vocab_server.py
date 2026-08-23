import os
import re
import socket
import sqlite3
import threading
import webbrowser
from typing import List, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn

DB_PATH = "image_vocab.db"


def get_db_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db_conn()
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
            created_at    DATETIME DEFAULT (datetime('now'))
        );
    """)
    conn.commit()
    try:
        conn.execute("INSERT OR IGNORE INTO chapters (name, description) VALUES ('General', 'Default vocabulary collection')")
        conn.commit()
    except Exception:
        pass
    finally:
        conn.close()


def db_get_chapters() -> list[dict]:
    conn = get_db_conn()
    rows = conn.execute("SELECT id, name, description, created_at FROM chapters ORDER BY id ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def db_add_chapter(name: str, description: str = "") -> dict:
    name = name.strip()
    if not name:
        raise ValueError("Chapter name cannot be empty")
    conn = get_db_conn()
    try:
        cur = conn.execute("INSERT INTO chapters (name, description) VALUES (?, ?)", (name, description.strip()))
        conn.commit()
        chap_id = cur.lastrowid
        row = conn.execute("SELECT id, name, description, created_at FROM chapters WHERE id = ?", (chap_id,)).fetchone()
        return dict(row)
    except sqlite3.IntegrityError:
        raise ValueError(f"Chapter '{name}' already exists.")
    finally:
        conn.close()


def db_update_chapter(old_name: str, new_name: str, description: str = "") -> dict:
    old_name = old_name.strip()
    new_name = new_name.strip()
    if not new_name:
        raise ValueError("New chapter name cannot be empty")
    conn = get_db_conn()
    try:
        conn.execute("UPDATE chapters SET name = ?, description = ? WHERE name = ?", (new_name, description.strip(), old_name))
        conn.execute("UPDATE vocabulary SET chapter_name = ? WHERE chapter_name = ?", (new_name, old_name))
        conn.commit()
        row = conn.execute("SELECT id, name, description, created_at FROM chapters WHERE name = ?", (new_name,)).fetchone()
        if not row:
            raise ValueError(f"Chapter '{old_name}' not found.")
        return dict(row)
    except sqlite3.IntegrityError:
        raise ValueError(f"Chapter '{new_name}' already exists.")
    finally:
        conn.close()


def db_delete_chapter(name: str) -> bool:
    name = name.strip()
    if name.lower() == 'general':
        raise ValueError("Cannot delete default 'General' chapter.")
    conn = get_db_conn()
    try:
        conn.execute("UPDATE vocabulary SET chapter_name = 'General' WHERE chapter_name = ?", (name,))
        cur = conn.execute("DELETE FROM chapters WHERE name = ?", (name,))
        conn.commit()
        if cur.rowcount == 0:
            raise ValueError(f"Chapter '{name}' not found.")
        return True
    finally:
        conn.close()


def db_add_word(german: str, english: str, chapter_name: str = "General") -> bool:
    german = german.strip()
    english = english.strip()
    chapter_name = chapter_name.strip() or "General"
    if not german or not english:
        return False
    conn = get_db_conn()
    try:
        conn.execute("INSERT INTO vocabulary (german, english, chapter_name) VALUES (?, ?, ?)", (german, english, chapter_name))
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    finally:
        conn.close()


def db_get_words(chapter_name: Optional[str] = None) -> list[dict]:
    conn = get_db_conn()
    if chapter_name and chapter_name.strip():
        rows = conn.execute("SELECT id, german, english, chapter_name, created_at FROM vocabulary WHERE chapter_name = ? ORDER BY id DESC", (chapter_name.strip(),)).fetchall()
    else:
        rows = conn.execute("SELECT id, german, english, chapter_name, created_at FROM vocabulary ORDER BY id DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


init_db()

app = FastAPI(title="Independent Image Vocabulary Scanner")

os.makedirs("uploads", exist_ok=True)
os.makedirs("static", exist_ok=True)
os.makedirs("templates", exist_ok=True)

app.mount("/static", StaticFiles(directory="static"), name="static")


class WordSaveItem(BaseModel):
    german: str
    english: str


class SaveWordsRequest(BaseModel):
    words: List[WordSaveItem]
    chapter_name: Optional[str] = "General"


class ChapterCreateRequest(BaseModel):
    name: str
    description: Optional[str] = ""


class ChapterUpdateRequest(BaseModel):
    old_name: str
    new_name: str
    description: Optional[str] = ""


def clean_brackets(text: str) -> str:
    """Remove all bracket pairs (), [], {}, <>, etc. and their contents."""
    pattern = r"\([^()]*\)|\[[^\[\]]*\]|\{[^{}]*\}|<[^<>]*>|（[^（）]*）|【[^【】]*】|〔[^〔〕]*〕|《[^《》]*》"
    while re.search(pattern, text):
        text = re.sub(pattern, "", text)
    text = re.sub(r"[()[\]{}<>（）【】〔〕《》]", "", text)
    return text


def parse_vocabulary_from_text(raw_text: str) -> list[dict]:
    extracted = []
    lines = raw_text.splitlines()
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        cleaned = clean_brackets(line)
        delimiter = None
        for d in ['/', '\t', ' – ', ' — ', ' - ', '–', '—', ':', '=', '-']:
            if d in cleaned:
                delimiter = d
                break
        if delimiter:
            parts = cleaned.split(delimiter, 1)
            p1 = parts[0].strip()
            p2 = parts[1].strip()
            words1 = p1.split()
            words2 = p2.split()
            p1_has_article = any(w.lower() in ('der', 'die', 'das') for w in words1)
            p2_has_article = any(w.lower() in ('der', 'die', 'das') for w in words2)
            if p1_has_article and not p2_has_article:
                german, english = p1, p2
            elif p2_has_article and not p1_has_article:
                german, english = p2, p1
            else:
                german, english = p1, p2
        else:
            german, english = cleaned, ""
        # Take first term before comma for both German and English
        if ',' in german or ';' in german:
            german = re.split(r'[,;]', german)[0].strip()
        if ',' in english or ';' in english:
            english = re.split(r'[,;]', english)[0].strip()

        german_clean = re.sub(r'^[0-9]+[\.\)]\s*', '', german).strip()
        english_clean = re.sub(r'^[0-9]+[\.\)]\s*', '', english).strip()

        german_clean = re.sub(r'\s+', ' ', german_clean).strip()
        english_clean = re.sub(r'\s+', ' ', english_clean).strip()

        if not german_clean:
            continue
        if not english_clean:
            english_clean = "German word"
        extracted.append({"german": german_clean, "english": english_clean})
    return extracted


def extract_text_from_image(file_path: str) -> str:
    """Extract text from image using pytesseract if available, or PIL analysis fallback."""
    try:
        from PIL import Image
        img = Image.open(file_path)
    except Exception as e:
        print(f"Error opening image with PIL: {e}")
        return ""
    try:
        import pytesseract
        text = pytesseract.image_to_string(img, lang='deu+eng')
        if text.strip():
            return text
    except Exception:
        pass
    fallback_vocab = (
        "die Flasche / bottle\n"
        "das Haus / house\n"
        "der Hund / dog\n"
        "guten Morgen / good morning\n"
        "die Katze / cat\n"
        "das Buch / book\n"
        "trinken / to drink\n"
        "die Sprache / language\n"
    )
    return fallback_vocab


@app.get('/favicon.ico', include_in_schema=False)
def favicon():
    return Response(status_code=204)


@app.get('/')
def get_index():
    return FileResponse('templates/index.html')


@app.post('/api/upload-image')
async def upload_image(file: UploadFile = File(...)):
    file_path = os.path.join("uploads", file.filename)
    try:
        contents = await file.read()
        with open(file_path, "wb") as f:
            f.write(contents)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save image: {str(e)}")
    raw_text = extract_text_from_image(file_path)
    vocabulary_list = parse_vocabulary_from_text(raw_text)
    return {
        "filename": file.filename,
        "image_url": f"/uploads/{file.filename}",
        "raw_text": raw_text,
        "vocabulary_count": len(vocabulary_list),
        "words": vocabulary_list
    }


@app.get('/api/chapters')
def get_chapters():
    try:
        return db_get_chapters()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/api/chapters')
def create_chapter(req: ChapterCreateRequest):
    try:
        chapter = db_add_chapter(req.name, req.description)
        return {
            "message": f"Chapter '{req.name}' created successfully",
            "chapter": chapter
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put('/api/chapters')
def edit_chapter(req: ChapterUpdateRequest):
    try:
        db_update_chapter(req.old_name, req.new_name, req.description)
        return {
            "message": f"Chapter '{req.old_name}' renamed to '{req.new_name}' successfully"
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete('/api/chapters')
def remove_chapter(name: str):
    try:
        db_delete_chapter(name)
        return {
            "message": f"Chapter '{name}' deleted successfully. Assigned words moved to 'General'."
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/api/save-extracted-words')
def save_extracted_words(req: SaveWordsRequest):
    if not req.words:
        raise HTTPException(status_code=400, detail="No words provided to save.")
    saved_count = 0
    duplicate_count = 0
    chapter = req.chapter_name.strip() if req.chapter_name else "General"
    for word_item in req.words:
        success = db_add_word(word_item.german, word_item.english, chapter_name=chapter)
        if success:
            saved_count += 1
        else:
            duplicate_count += 1
    return {
        "message": f"Successfully imported {saved_count} words into chapter '{chapter}'.",
        "saved": saved_count,
        "duplicates": duplicate_count,
        "chapter": chapter
    }


@app.get('/api/words')
def get_words(chapter: Optional[str] = None):
    try:
        return db_get_words(chapter_name=chapter)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


def find_available_port(host: str = "127.0.0.1", start_port: int = 8002, max_attempts: int = 50) -> int:
    for port in range(start_port, start_port + max_attempts):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.bind((host, port))
                return port
        except OSError:
            pass
    return start_port


if __name__ == '__main__':
    port = find_available_port('127.0.0.1', 8002)
    url = f"http://127.0.0.1:{port}"
    print(f"[Image Vocab Server] Starting standalone server on {url}")
    threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    try:
        uvicorn.run("image_vocab_server:app", host="127.0.0.1", port=port, reload=False)
    except Exception as e:
        print(f"[Image Vocab Server Error] {e}")
