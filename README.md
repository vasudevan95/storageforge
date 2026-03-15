# StoryForge

**Turn a single sentence into a fully illustrated, narrated story — powered by Gemini.**

Live demo: [storyforge on Vercel](#) <!-- replace with your Vercel URL -->
Backend API: [Cloud Run](#) <!-- replace with your Cloud Run URL -->

---

## What It Does

Type any premise — as short as two words or a full sentence — and StoryForge:

1. Generates a **4-scene story** with named characters and a continuous narrative arc using Gemini 2.5 Flash
2. Produces a **cinematic illustration** for each scene using Gemini's image model
3. Narrates the entire story with **Google Cloud Text-to-Speech**
4. Streams everything live to the browser as it generates

---

## Quickest Way to Test (No Setup)

Visit the live app and type a premise:

```
A blind pianist hears a melody only the dead can play
```

Watch all 4 scenes generate live, images appear, then hit play on the audio player.

---

## Test It Locally

### Prerequisites

- Python 3.11+
- Node.js 18+
- A [Google AI Studio](https://aistudio.google.com) API key (free)
- A Google Cloud project with Firestore, Cloud Storage, and Text-to-Speech enabled

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/storyforge.git
cd storyforge
```

### 2. Backend setup

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# Mac/Linux
source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
```

Edit `backend/.env` and fill in:

```
GOOGLE_API_KEY=your_gemini_api_key_here
GOOGLE_CLOUD_PROJECT=your_gcp_project_id
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
GCS_BUCKET=your_gcs_bucket_name
```

> **Minimum working setup:** Only `GOOGLE_API_KEY` is required to generate stories.
> Firestore (saving) and GCS (image persistence + audio) will gracefully degrade if not configured.

Start the backend:

```bash
uvicorn main:app --reload --port 8080
```

Verify it's running:

```bash
curl http://localhost:8080/health
# {"status":"ok","service":"storyforge-backend"}
```

### 3. Frontend setup

```bash
cd frontend
cp .env.local.example .env.local
```

Edit `frontend/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8080
```

Install and run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Reproducing the Full Flow

1. Open the app in your browser
2. Type a premise in the input box, e.g.:
   ```
   The last librarian on Earth guards the only book left unburned
   ```
3. Press **Forge My Story**
4. Watch the story stream in — chapter titles, prose, image skeletons resolving to illustrations
5. When complete, press **Play** on the audio player to hear the narration
6. Click **Save Story** → copy the share link → open it in a new tab to verify the saved story loads with images

---

## API Endpoints (for judges)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Service info |
| `GET` | `/health` | Health check |
| `POST` | `/api/prompt` | Create a story session, returns `session_id` |
| `GET` | `/api/generate/{session_id}` | SSE stream of story blocks |
| `POST` | `/api/story/save` | Save story to Firestore |
| `GET` | `/api/story/{story_id}` | Retrieve a saved story |
| `GET` | `/api/stories` | List all saved stories |

### Test the API directly

```bash
# Create a session
curl -X POST https://YOUR_CLOUD_RUN_URL/api/prompt \
  -H "Content-Type: application/json" \
  -d '{"prompt": "a lighthouse keeper who finds a message in a bottle from himself"}'

# Returns: {"session_id": "abc-123"}

# Stream the story (SSE)
curl https://YOUR_CLOUD_RUN_URL/api/generate/abc-123
```

---

## Architecture

```
User Browser
    │
    ├── POST /api/prompt ──────────────────► FastAPI (Cloud Run)
    │                                              │
    ├── GET /api/generate/{id} (SSE) ◄─────────── │
    │        │                               Gemini 2.5 Flash
    │        │  CHAPTER blocks               (story outline)
    │        │  PROSE blocks                       │
    │        │  IMAGE blocks ──────────────► Gemini Image Model
    │        │  GENERATED_IMAGE blocks             │
    │        │                               Cloud Storage (GCS)
    │        │  AUDIO block ──────────────► Cloud TTS → GCS
    │        │
    │   COMPLETE event
    │
    └── Firestore (saved stories)
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Story generation | Gemini 2.5 Flash via Google GenAI SDK |
| Image generation | Gemini Flash Image Preview |
| Text-to-speech | Google Cloud Text-to-Speech (Neural2) |
| Backend | FastAPI + Python 3.11 |
| Backend hosting | Google Cloud Run |
| File storage | Google Cloud Storage |
| Database | Google Cloud Firestore |
| Frontend | Next.js 16 + TypeScript + Tailwind CSS v4 |
| Frontend hosting | Vercel |

---

## Project Structure

```
storyforge/
├── backend/
│   ├── main.py              # FastAPI routes + SSE orchestration
│   ├── gemini_pipeline.py   # Story generation + image generation
│   ├── tts_service.py       # Cloud TTS + GCS upload
│   └── requirements.txt
├── frontend/
│   ├── app/                 # Next.js app router pages
│   └── components/
│       └── ChapterRenderer.tsx  # Block-by-block story renderer
├── infrastructure/
│   ├── Dockerfile
│   └── cloudbuild.yaml
└── DEPLOYMENT.md            # Full deployment guide
```
