"""
German Vocabulary Builder - Launcher
-------------------------------------
Launches the interactive Web Frontend (default) or the legacy Command Line Interface.
To run the CLI: python german.py --cli
"""

import sys
import os
import sqlite3
import webbrowser
import threading
import time

DB_PATH = "german_vocab.db"


def init_db():
    """Create the vocabulary table if it doesn't exist yet."""
    conn = sqlite3.connect(DB_PATH)
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

def view_words_cli():
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        "SELECT german, english FROM vocabulary ORDER BY id DESC"
    ).fetchall()
    conn.close()
    if rows:
        print("\n--- Your vocabulary list ---")
        for german, english in rows:
            print(f"{german} - {english}")
        print("-----------------------------\n")
    else:
        print("\nNo words saved yet.\n")


def run_cli():
    init_db()
    print("=== German Vocabulary Builder (CLI Mode) ===")
    print(f"Words are stored in '{DB_PATH}' (SQLite database)")
    print("Type 'q' at any time (as the German word) to quit.")
    print("Type 'v' at any time (as the German word) to view saved words.\n")

    while True:
        german = input("German word/phrase (or 'q' to quit, 'v' to view): ").strip()

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
        conn = sqlite3.connect(DB_PATH)
        try:
            conn.execute(
                "INSERT INTO vocabulary (german, english) VALUES (?, ?)",
                (german, english)
            )
            conn.commit()
            print(f"Saved: {german} - {english}\n")
        except sqlite3.IntegrityError:
            print(f"⚠ The word '{german}' already exists in your vocabulary.\n")
        finally:
            conn.close()


def open_browser():
    # Wait a moment for server to start before launching browser
    time.sleep(1.5)
    print("Opening web interface in your default browser...")
    webbrowser.open("http://127.0.0.1:8000")  # localhost still opens locally


def run_web():
    print("=== German Vocabulary Builder (Web Mode) ===")
    print("Starting FastAPI server on http://127.0.0.1:8000 ...")
    
    # Import FastAPI app and uvicorn
    try:
        import uvicorn
        from server import app
    except ImportError:
        print("Error: FastAPI or Uvicorn not installed. Running CLI instead.")
        run_cli()
        return

    # Start browser in a background thread
    threading.Thread(target=open_browser, daemon=True).start()
    
    # Run server (port 8000)
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="warning")


def main():
    # Check if CLI mode is requested via command line argument
    if len(sys.argv) > 1 and sys.argv[1] in ("--cli", "-c"):
        run_cli()
    else:
        run_web()


if __name__ == "__main__":
    main()