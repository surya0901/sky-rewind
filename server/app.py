"""
FastAPI server for the Sky Rewind agent.

  POST /api/ask       {"text": "Take me to Giza in 1250 BCE"} -> place, date, target, reply
  GET  /api/geocode   ?q=Lima  -> {name, lat, lon} via OpenStreetMap Nominatim
  GET  /api/health

Run from the project root:
  uvicorn server.app:app --port 8000 --reload
The web app works without this server (it falls back to an offline parser), so a
missing API key or flaky hackathon wifi never breaks the demo.
"""
from __future__ import annotations

import os
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

load_dotenv(Path(__file__).resolve().parent / ".env")

from .agent import SkyAgent  # noqa: E402  (env must load first)

app = FastAPI(title="Sky Rewind agent")
agent = SkyAgent()


class AskBody(BaseModel):
    text: str


def _place(name: str | None, lat: float | None, lon: float | None) -> dict | None:
    if lat is None or lon is None:
        return None
    return {"name": name or f"{lat:.2f}, {lon:.2f}", "lat": lat, "lon": lon}


@app.get("/api/health")
def health():
    return {"ok": True, "model": agent.model_name, "events": len(agent.events), "llm_configured": _has_key()}


def _has_key() -> bool:
    m = agent.model_name.split(":")[0]
    return bool(os.getenv({"anthropic": "ANTHROPIC_API_KEY", "openai": "OPENAI_API_KEY"}.get(m, "LLM_API_KEY")))


@app.post("/api/ask")
async def ask(body: AskBody):
    text = body.text.strip()[:500]
    if not text:
        raise HTTPException(400, "Empty request")
    if not _has_key():
        raise HTTPException(503, "No LLM key configured; the client will use its offline parser")
    try:
        q = agent.ask(text)
    except Exception as exc:  # model or network failure: let the client fall back
        raise HTTPException(503, f"Agent unavailable: {exc}") from exc

    place = _place(q.get("place_name"), q.get("lat"), q.get("lon"))
    if place is None and q.get("place_name") and not q.get("event_id"):
        place = await geocode_name(q["place_name"])
    return {
        "event_id": q.get("event_id"),
        "place": place,
        "year": q.get("year"),
        "month": q.get("month"),
        "day": q.get("day"),
        "hour": q.get("hour"),
        "target": q.get("target"),
        "reply": q.get("reply"),
    }


# ------------------------------------------------------------------ ElevenLabs sound effects
# Set ELEVENLABS_API_KEY in server/.env and the app swaps its synthesised one-shots for
# generated clips. Clips are cached on disk so each prompt is generated once.
SFX_PROMPTS = {
    "rewind": ("A vast cosmic whoosh, time rushing backwards, airy shimmer sweeping up then down, cinematic", 6),
    "bolide": ("A huge fireball meteor tearing through the atmosphere, roaring and crackling, getting louder", 4),
    "impact": ("Colossal asteroid impact explosion, deep sub-bass boom, shockwave, long earth-shaking rumble, debris falling", 12),
    "airburst": ("Distant meteor airburst explosion, sharp boom then rolling thunder and rattling windows", 7),
}
SFX_DIR = Path(__file__).resolve().parent / ".sfx_cache"


@app.get("/api/sfx/{name}")
async def sfx(name: str):
    from fastapi.responses import Response

    key = os.getenv("ELEVENLABS_API_KEY")
    if name not in SFX_PROMPTS or not key:
        raise HTTPException(404, "No ElevenLabs key configured; the app synthesises this sound")
    SFX_DIR.mkdir(exist_ok=True)
    cached = SFX_DIR / f"{name}.mp3"
    if not cached.exists():
        text, dur = SFX_PROMPTS[name]
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(
                "https://api.elevenlabs.io/v1/sound-generation",
                headers={"xi-api-key": key},
                json={"text": text, "duration_seconds": dur, "prompt_influence": 0.5},
            )
        if r.status_code != 200:
            raise HTTPException(502, f"ElevenLabs error {r.status_code}")
        cached.write_bytes(r.content)
    return Response(cached.read_bytes(), media_type="audio/mpeg")


@app.get("/api/retrieve")
def retrieve(q: str):
    """Debug view of what RAG pulls for a query."""
    return [{"id": d.metadata["id"], "title": agent.by_id[d.metadata["id"]]["title"]} for d in agent.retrieve(q)]


async def geocode_name(q: str) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=6, headers={"User-Agent": "SkyRewind/0.1 (HackPrinceton project)"}) as c:
            r = await c.get("https://nominatim.openstreetmap.org/search", params={"q": q, "format": "json", "limit": 1})
            r.raise_for_status()
            hits = r.json()
    except Exception:
        return None
    if not hits:
        return None
    h = hits[0]
    return {"name": h.get("name") or h["display_name"].split(",")[0], "lat": float(h["lat"]), "lon": float(h["lon"])}


@app.get("/api/geocode")
async def geocode(q: str):
    hit = await geocode_name(q)
    if not hit:
        raise HTTPException(404, f"No place found for {q!r}")
    return hit
