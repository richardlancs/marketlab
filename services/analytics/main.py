"""Entry point for uvicorn and Vercel (`main:app`)."""

from analytics.api import app

__all__ = ["app"]
