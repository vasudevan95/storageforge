# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Running the Project

**Backend** (FastAPI on :8080):
```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
cp .env.example .env           # fill in credentials
uvicorn main:app --reload --port 8080
```
Or just double-click `be.bat` from the repo root (handles venv creation + install automatically).

**Frontend** (Next.js on :3000):
```bash
cd frontend
cp .env.local.example .env.local   # set NEXT_PUBLIC_API_URL=http://localhost:8080
npm install
npm run dev
```
Or double-click `fe.bat` from the repo root.

**Frontend type-check / build:**
```bash
cd frontend
npm run build     # also catches TypeScript errors
```

---

## Environment Variables

**`backend/.env`** (required):
```
GOOGLE_API_KEY=...                          # Gemini API key
GOOGLE_CLOUD_PROJECT=storyforge-490116
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
GCS_BUCKET=storyforge-artifacts
```

**`frontend/.env.local`**:
```
NEXT_PUBLIC_API_URL=http://localhost:8080   # or deployed Cloud Run URL
```

---

## Architecture

### Request flow

1. User types a story premise on the landing page (`app/page.tsx`)
2. `POST /api/prompt` → backend creates a session storing the `user_prompt` string, returns `session_id`
3. Browser redirects to `/generate/[sessionId]`
4. Frontend opens an `EventSource` to `GET /api/generate/{session_id}` — this is a **Server-Sent Events stream**
5. Backend calls `generate_story_from_prompt()` which streams from Gemini; `parse_stream_blocks()` parses the tagged output into typed blocks
6. For each `AUDIO_CUE` block, backend calls `tts_service.text_to_audio_url()` to generate an MP3 via Google Cloud TTS and upload it to GCS
7. On `COMPLETE`, the assembled story is saved to Firestore under a new `story_id`
8. Frontend renders blocks live via `ChapterRenderer`; completed story is shareable at `/story/[id]`

### Gemini output format

Gemini is instructed to produce strictly-tagged output:
```
[CHAPTER:N] Title
[PROSE] ...paragraphs...
[IMAGE] ...illustration prompt...
[ANNOTATION] Era | Location | Mood
[AUDIO_CUE]
```
`parse_stream_blocks()` in `gemini_pipeline.py` is the single parser for this format — it accumulates a buffer and emits blocks as new tags are encountered. `AUDIO_CUE` marks chapter boundaries and triggers TTS generation in `main.py`.

When Gemini's interleaved multimodal output is available, inline image data arrives as `part.inline_data` and is yielded as `GENERATED_IMAGE` blocks with base64 content. If not available, falls back to text-only (IMAGE blocks become shimmer skeletons).

### Frontend block rendering

`ChapterRenderer.tsx` maps each block type to its visual treatment:
- `CHAPTER` → serif title + ornamental SVG divider
- `PROSE` → editorial body text; first paragraph of each chapter gets a CSS drop cap (`.drop-cap` class)
- `IMAGE` → animated shimmer skeleton while waiting for `GENERATED_IMAGE`
- `GENERATED_IMAGE` → full-width image with vignette overlay
- `ANNOTATION` → left amber border, italic caption
- `AUDIO` → custom `<AudioPlayer>` component (play/pause, waveform bars, seek track, timestamps) — no native browser `<audio>` element shown

### Design system

All design tokens live in `frontend/app/globals.css`:
- Background: `#0a0908`, Surface: `#141210`, Accent: `#d97706` → `#f59e0b`
- Text: `#f0ebe4`, Muted: `#7c746d`, Chapter: `#fde68a`
- Grain overlay: fixed `.grain-overlay` div using SVG `feTurbulence` noise at 3% opacity
- Shimmer animations: `skeleton-shimmer`, `title-shimmer`, `shimmer-bar`, `wave-bar` keyframes
- Key utility classes: `.glass-card`, `.forge-btn`, `.seed-chip`, `.display-title`, `.shimmer-skeleton`, `.drop-cap`
- Tailwind v4 is used; utility classes work alongside these custom classes

### Backend modules

| File | Responsibility |
|------|---------------|
| `main.py` | FastAPI routes, SSE orchestration, Firestore writes |
| `gemini_pipeline.py` | Gemini API call + streaming block parser |
| `tts_service.py` | Google Cloud TTS → GCS upload → public URL |

Sessions are held in-memory (`sessions` dict in `main.py`). There is no auth; sessions are ephemeral per process restart.

### Deployment

- Backend: Cloud Run via `infrastructure/Dockerfile` (built from repo root, copies `backend/` into `/app`)
- CI/CD: `infrastructure/cloudbuild.yaml` — builds image, pushes to GCR, deploys to Cloud Run `us-central1`
- Frontend: Firebase Hosting (`npm run build` then `firebase deploy --only hosting`)
- GCP project: `storyforge-490116`, bucket: `storyforge-artifacts`
