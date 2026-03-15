from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google.cloud import firestore
import base64
import json
import logging
import uuid
import os
from pathlib import Path
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

base_dir = Path(__file__).resolve().parent
load_dotenv(dotenv_path=base_dir / ".env")
api_key = os.environ.get("GOOGLE_API_KEY")
if api_key:
    logger.info(f"[Main] GOOGLE_API_KEY is set (length {len(api_key)})")
else:
    logger.warning("[Main] GOOGLE_API_KEY is not set")

import asyncio
from gemini_pipeline import generate_image, generate_story_text, parse_stream_blocks
from tts_service import text_to_audio_url, upload_image_to_gcs

app = FastAPI(title="StoryForge API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

try:
    db = firestore.Client(database="storyforge")
except Exception as e:
    logger.warning(f"Firestore client init failed (story saving disabled): {e}")
    db = None

# In-memory session store (use Redis in production)
sessions: dict = {}


class PromptRequest(BaseModel):
    prompt: str


class SaveStoryRequest(BaseModel):
    story_id: str
    prompt: str
    title: str
    audio_url: str | None = None
    blocks: list[dict]


@app.get("/health")
async def health():
    return {"status": "ok", "service": "storyforge-backend"}


@app.post("/api/prompt")
async def create_prompt_session(body: PromptRequest):
    if not body.prompt or not body.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt is required")

    session_id = str(uuid.uuid4())
    sessions[session_id] = {"user_prompt": body.prompt.strip()}

    return {"session_id": session_id}


@app.get("/api/generate/{session_id}")
async def generate_story(session_id: str):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = sessions[session_id]

    # Prevent duplicate generation (EventSource auto-reconnect)
    if session.get("consumed"):
        async def already_done():
            yield f"data: {json.dumps({'type': 'COMPLETE', 'story_id': session.get('story_id', '')})}\n\n"
        return StreamingResponse(already_done(), media_type="text/event-stream")
    session["consumed"] = True

    story_id = str(uuid.uuid4())
    session["story_id"] = story_id
    chapters = []

    async def event_stream():
        current_chapter: dict = {}
        all_prose: list[str] = []  # Accumulates prose from every scene for whole-story TTS

        try:
            # Phase 1: Full story generation (blocking, run in executor)
            story_text = await asyncio.get_event_loop().run_in_executor(
                None, generate_story_text, session["user_prompt"]
            )

            # Phase 2: Parse blocks and stream to frontend
            blocks = parse_stream_blocks(story_text)
            for block in blocks:
                block_type = block["type"]

                if block_type == "CHAPTER":
                    if current_chapter:
                        chapters.append(current_chapter)
                    current_chapter = {"title": block["content"], "blocks": []}
                    yield f"data: {json.dumps({'type': 'CHAPTER', 'content': block['content']})}\n\n"

                elif block_type == "PROSE":
                    all_prose.append(block["content"])
                    current_chapter.setdefault("blocks", []).append(block)
                    yield f"data: {json.dumps({'type': 'PROSE', 'content': block['content']})}\n\n"

                elif block_type == "IMAGE":
                    current_chapter.setdefault("blocks", []).append(block)
                    yield f"data: {json.dumps(block)}\n\n"
                    try:
                        img_b64, mime_type = await asyncio.get_event_loop().run_in_executor(
                            None, generate_image, block["content"]
                        )
                        if img_b64:
                            img_bytes = base64.b64decode(img_b64)
                            img_url = await asyncio.get_event_loop().run_in_executor(
                                None, upload_image_to_gcs, img_bytes, mime_type
                            )
                            gen_block = {"type": "GENERATED_IMAGE", "content": img_b64, "mime_type": mime_type, "url": img_url}
                            current_chapter["blocks"].append(gen_block)
                            yield f"data: {json.dumps(gen_block)}\n\n"
                    except Exception as img_err:
                        logger.warning(f"Image generation error: {img_err}")

                elif block_type == "GENERATED_IMAGE":
                    current_chapter.setdefault("blocks", []).append(block)
                    yield f"data: {json.dumps(block)}\n\n"

                elif block_type == "ANNOTATION":
                    current_chapter.setdefault("blocks", []).append(block)
                    yield f"data: {json.dumps(block)}\n\n"

                elif block_type == "AUDIO_CUE":
                    pass  # No per-scene audio — whole-story TTS is generated below

            # Finalise the last scene
            if current_chapter:
                chapters.append(current_chapter)

            # Generate a single TTS audio for the entire story
            if all_prose:
                try:
                    full_prose = "\n\n".join(all_prose)
                    logger.info("[TTS] Generating whole-story audio (%d chars, truncated to 5000)", len(full_prose))
                    audio_url = text_to_audio_url(full_prose)
                    logger.info("[TTS] Whole-story audio ready: %s", audio_url)
                    yield f"data: {json.dumps({'type': 'AUDIO', 'url': audio_url})}\n\n"
                except Exception as tts_err:
                    logger.error("[TTS] Whole-story audio failed: %s", tts_err)

            # Save completed story to Firestore (best-effort)
            # Strip large base64 image data to stay under Firestore's 1MB doc limit
            try:
                if db is None:
                    raise RuntimeError("Firestore not initialized")
                clean_chapters = []
                for ch in chapters:
                    clean_ch = {"title": ch.get("title", ""), "blocks": []}
                    for blk in ch.get("blocks", []):
                        if blk.get("type") == "GENERATED_IMAGE":
                            # Store URL (not base64) to stay under Firestore's 1MB limit
                            clean_ch["blocks"].append({"type": "GENERATED_IMAGE", "url": blk.get("url", ""), "mime_type": blk.get("mime_type", "")})
                        else:
                            clean_ch["blocks"].append(blk)
                    clean_chapters.append(clean_ch)
                db.collection("stories").document(story_id).set(
                    {
                        "chapters": clean_chapters,
                        "created_at": firestore.SERVER_TIMESTAMP,
                    },
                    timeout=10.0,
                )
            except Exception as fs_err:
                logger.warning(f"Firestore save skipped: {fs_err}")

        except Exception as e:
            print(f"Generation error: {e}")
            yield f"data: {json.dumps({'type': 'ERROR', 'message': str(e)})}\n\n"

        finally:
            yield f"data: {json.dumps({'type': 'COMPLETE', 'story_id': story_id})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/story/save")
async def save_story(body: SaveStoryRequest):
    if db is None:
        raise HTTPException(status_code=503, detail="Firestore not available")
    try:
        # Strip base64 content from GENERATED_IMAGE blocks (too large for Firestore's 1MB limit)
        # Keep blocks that have a GCS URL; drop ones that are base64-only
        clean_blocks = []
        for b in body.blocks:
            if b.get("type") == "GENERATED_IMAGE":
                if b.get("url"):
                    clean_blocks.append({"type": "GENERATED_IMAGE", "url": b["url"], "mime_type": b.get("mime_type", "")})
            else:
                clean_blocks.append(b)
        db.collection("stories").document(body.story_id).set({
            "prompt": body.prompt,
            "title": body.title,
            "audio_url": body.audio_url,
            "blocks": clean_blocks,
            "created_at": firestore.SERVER_TIMESTAMP,
        }, timeout=10.0)
        logger.info("[Firestore] Story saved: %s", body.story_id)
        return {"saved": True, "story_id": body.story_id}
    except Exception as e:
        logger.error("[Firestore] Save failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/stories")
async def list_stories():
    if db is None:
        raise HTTPException(status_code=503, detail="Firestore not available")
    try:
        docs = db.collection("stories").limit(50).stream()
        stories = []
        for doc in docs:
            data = doc.to_dict()
            # Only include stories saved via the explicit save button (have a title/prompt)
            if not data.get("title"):
                continue
            created = data.get("created_at")
            stories.append({
                "id": doc.id,
                "title": data.get("title", "Untitled"),
                "prompt": data.get("prompt", ""),
                "created_at": str(created) if created else "",
            })
        # Sort newest first in Python (avoids needing a Firestore composite index)
        stories.sort(key=lambda s: s["created_at"], reverse=True)
        return {"stories": stories}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/story/{story_id}")
async def get_story(story_id: str):
    if db is None:
        raise HTTPException(status_code=503, detail="Firestore not available")
    doc = db.collection("stories").document(story_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Story not found")
    return doc.to_dict()
