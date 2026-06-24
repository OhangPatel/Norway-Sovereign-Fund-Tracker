"""Holds the Gemini API key server-side only.

The key is read once at startup from the GEMINI_API_KEY environment variable
(loaded from chatbot/.env, which is gitignored). It is NEVER accepted from the
browser, NEVER sent back to the browser, and NEVER written to disk at runtime.
To change the key, edit chatbot/.env and restart the service.
"""
import os

_key: str = os.getenv("GEMINI_API_KEY", "").strip()


def get_key() -> str:
    return _key


def has_key() -> bool:
    return bool(_key)
