"""
Sky Rewind agent: natural language -> place, date and target, grounded by RAG.

Pipeline
  1. Retrieve: BM25 over the curated sky-events knowledge base (web/public/data/events.json),
     so "the Crab supernova" or "Columbus's eclipse" resolves to a vetted, sourced event.
  2. Extract: an LLM (any LangChain chat model) fills a typed SkyQuery using the retrieved
     events as context. It must pick an event_id from the context or leave it empty, which
     keeps it from inventing history.
  3. Resolve: if the model named a place without coordinates, geocode it.

Model is chosen with LLM_MODEL, e.g.
  anthropic:claude-sonnet-5-5      (needs ANTHROPIC_API_KEY)
  openai:gpt-4o-mini               (needs OPENAI_API_KEY; set OPENAI_BASE_URL for any
                                    OpenAI-compatible endpoint, such as a sponsor's gateway)
"""
from __future__ import annotations

import json
import os
from datetime import date
from pathlib import Path
from typing import Optional

from langchain_community.retrievers import BM25Retriever
from langchain_core.documents import Document
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

EVENTS_PATH = Path(__file__).resolve().parents[1] / "web" / "public" / "data" / "events.json"
CURRENT_YEAR = date.today().year


# ------------------------------------------------------------------ knowledge base
def load_events() -> list[dict]:
    return json.loads(EVENTS_PATH.read_text(encoding="utf-8"))


def build_retriever(events: list[dict], k: int = 4) -> BM25Retriever:
    docs = []
    for e in events:
        text = " ".join([e["title"], e["place"], " ".join(e["tags"]), e["summary"]])
        docs.append(Document(page_content=text, metadata={"id": e["id"]}))
    r = BM25Retriever.from_documents(docs)
    r.k = k
    return r


def format_context(events_by_id: dict[str, dict], docs: list[Document]) -> str:
    out = []
    for d in docs:
        e = events_by_id[d.metadata["id"]]
        when = "now" if e["year"] == 0 and e["month"] == 0 else f"astronomical year {e['year']}, month {e['month']}, day {e['day']}, local solar hour {e['hour']}"
        out.append(
            f"- event_id: {e['id']}\n  title: {e['title']}\n  where: {e['place']} ({e['lat']}, {e['lon']})\n"
            f"  when: {when}\n  certainty: {e['certainty']}\n  summary: {e['summary']}"
        )
    return "\n".join(out)


# ------------------------------------------------------------------ schema
class SkyQuery(BaseModel):
    """Where and when the user wants to see the sky."""

    event_id: Optional[str] = Field(None, description="id of a context event the user is clearly asking for, else null")
    place_name: Optional[str] = Field(None, description="Place as the user would recognise it, e.g. 'Giza'")
    lat: Optional[float] = Field(None, description="Latitude in degrees, north positive, if confidently known")
    lon: Optional[float] = Field(None, description="Longitude in degrees, east positive, if confidently known")
    year: Optional[int] = Field(None, description="ASTRONOMICAL year: 1 BCE = 0, 1250 BCE = -1249, 2000 CE = 2000. "
                                                  "For 'N years ago' use CURRENT_YEAR - N.")
    month: Optional[int] = Field(None, ge=1, le=12)
    day: Optional[int] = Field(None, ge=1, le=31)
    hour: Optional[float] = Field(None, ge=0, lt=24, description="Local solar time in hours, 21.5 = 9:30 pm")
    target: Optional[str] = Field(None, description="Sky object to centre: a star, planet, constellation or the Moon")
    reply: str = Field(..., description="One or two plain sentences telling the user what they will see. "
                                         "Use only facts from the context events or the request itself.")


SYSTEM = """You turn requests about the night sky into a place, a date and an object to look at.

Today is {today}; CURRENT_YEAR = {year}.
Rules:
- Years are astronomical: 1 BCE is 0, so N BCE is 1 - N. 1250 BCE -> -1249.
- "66 million years ago" -> {year} - 66000000.
- Solstices: June 21 or December 21. Equinoxes: March 20 or September 22.
- If the user asks for something in the context events, set event_id and leave other fields null
  unless the user overrides them (for example a different year or place).
- Never set event_id for an event that is not in the context. Never invent historical claims.
- Leave a field null when the user did not imply it. Give lat/lon only for places you are sure of.
- If the request is not about the sky or a place and time, return only a short reply explaining what you can do.

Context events retrieved from the knowledge base:
{context}"""


class SkyAgent:
    def __init__(self) -> None:
        self.events = load_events()
        self.by_id = {e["id"]: e for e in self.events}
        self.retriever = build_retriever(self.events)
        self.llm = None
        self.model_name = os.getenv("LLM_MODEL", "anthropic:claude-sonnet-5-5")

    def _ensure_llm(self):
        if self.llm is None:
            from langchain.chat_models import init_chat_model

            kwargs = {"temperature": 0}
            if self.model_name.startswith("openai:") and os.getenv("OPENAI_BASE_URL"):
                kwargs["base_url"] = os.environ["OPENAI_BASE_URL"]
            self.llm = init_chat_model(self.model_name, **kwargs).with_structured_output(SkyQuery)
        return self.llm

    def retrieve(self, text: str) -> list[Document]:
        return self.retriever.invoke(text)

    def ask(self, text: str) -> dict:
        docs = self.retrieve(text)
        prompt = ChatPromptTemplate.from_messages([("system", SYSTEM), ("human", "{text}")])
        chain = prompt | self._ensure_llm()
        q: SkyQuery = chain.invoke({
            "today": date.today().isoformat(),
            "year": CURRENT_YEAR,
            "context": format_context(self.by_id, docs),
            "text": text,
        })
        if q.event_id and q.event_id not in self.by_id:
            q.event_id = None  # guard against an invented id
        return q.model_dump()
