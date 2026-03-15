# StoryForge — Complete Hackathon Playbook
**Gemini Live Agent Challenge 2026 | Creative Storyteller Track**

---

## The Opportunity

| Item | Detail |
|------|--------|
| Hackathon | Gemini Live Agent Challenge 2026 |
| Track | Creative Storyteller |
| Deadline | March 16, 2026 at 5:00 PM PDT |
| Track Prize | $10,000 + $1,000 GCP credits |
| Grand Prize | $25,000 + Google Cloud Next '26 speaking slot + trip to Las Vegas |
| Mandatory Tech | Gemini interleaved/mixed multimodal output, hosted on Google Cloud |

---

## The Winning Concept: StoryForge — Living Biography Engine

**Tagline**: *"Every life is a story. We help you read yours."*

**One-line pitch**: StoryForge transforms a person's real photos into a cinematic, AI-narrated life documentary — chapters of interleaved prose, AI-generated illustrations, and voice narration, all produced by Gemini in one single streaming flow.

---

## Repository Structure (IMPLEMENTED)

```
storyforge/
├── PLAN.md                          ← This document
├── frontend/                        # Next.js 16 app → Firebase Hosting
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                 # Upload interface (drag & drop)
│   │   ├── generate/[sessionId]/    # Live SSE generation view
│   │   └── story/[id]/              # Read-only shareable story viewer
│   └── components/
│       └── ChapterRenderer.tsx      # Core: renders PROSE/IMAGE/AUDIO blocks
│
├── backend/                         # Python FastAPI → Cloud Run
│   ├── requirements.txt
│   ├── main.py                      # API routes + orchestration
│   ├── gemini_pipeline.py           # Interleaved generation + stream parser
│   ├── vision_analyzer.py           # Photo pre-processing (era/emotion/setting)
│   └── tts_service.py               # Cloud TTS integration
│
└── infrastructure/
    ├── Dockerfile                   # Cloud Run container
    ├── cloudbuild.yaml              # CI/CD pipeline
    └── .env.example                 # Required environment variables
```

---

## Quick Start

### 1. GCP Setup (one-time)

```bash
# Enable APIs
gcloud services enable \
  aiplatform.googleapis.com \
  run.googleapis.com \
  storage.googleapis.com \
  firestore.googleapis.com \
  texttospeech.googleapis.com \
  cloudbuild.googleapis.com \
  --project=YOUR_PROJECT_ID

# Create storage bucket (public read for generated content)
gsutil mb -p YOUR_PROJECT_ID -l us-central1 gs://storyforge-artifacts
gsutil iam ch allUsers:objectViewer gs://storyforge-artifacts
```

### 2. Backend (local dev)

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Copy and fill in credentials
cp .env.example .env

uvicorn main:app --reload --port 8080
```

### 3. Frontend (local dev)

```bash
cd frontend
cp .env.local.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:8080

npm install
npm run dev
# Open http://localhost:3000
```

### 4. Deploy Backend to Cloud Run

```bash
gcloud run deploy storyforge-backend \
  --source ./infrastructure \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_API_KEY=YOUR_KEY,GOOGLE_CLOUD_PROJECT=YOUR_PROJECT,GCS_BUCKET=storyforge-artifacts \
  --project YOUR_PROJECT_ID
```

### 5. Deploy Frontend to Firebase

```bash
cd frontend
# Update .env.local with deployed Cloud Run URL
npm run build
firebase deploy --only hosting
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/upload` | Upload photos, get `session_id` + metadata |
| GET | `/api/generate/{session_id}` | SSE stream of story blocks |
| GET | `/api/story/{story_id}` | Fetch completed story (for share page) |
| GET | `/health` | Health check |

### SSE Block Types (from `/api/generate`)

```json
{ "type": "CHAPTER", "content": "Chapter One: The Beginning" }
{ "type": "PROSE", "content": "Long narrative text..." }
{ "type": "IMAGE", "content": "illustration prompt..." }
{ "type": "GENERATED_IMAGE", "content": "<base64>", "mime_type": "image/png" }
{ "type": "ANNOTATION", "content": "1960s | Rural Ohio | Joyful" }
{ "type": "AUDIO", "url": "https://storage.googleapis.com/..." }
{ "type": "COMPLETE", "story_id": "uuid" }
{ "type": "ERROR", "message": "..." }
```

---

## The 4-Minute Demo Script

**0:00 — Hook**
> "Every family has a shoebox of photos that will never become a story. Today we watch a life story write itself."

**0:30 — Upload**
Drop 12 photos. UI shows thumbnails + auto-labels (era, emotion, setting).

**1:00 — Generation (the wow moment)**
Hit "Generate Story." Watch live:
- Chapter title fades in
- Prose streams in sentence by sentence
- Shimmer → watercolor illustration materializes
- Audio player appears — click it — WaveNet voice narrates

**2:30 — The Shareable Artifact**
Scroll to end, click "Share." Show QR code on phone.

**3:00 — Business Close**
> "The mandatory technology isn't a feature here — it's the entire mechanism. Remove Gemini's interleaved output and this product stops working."

---

## Key Differentiator

When a judge asks: *"How is this different from a photo book app?"*

> "A photo book puts your photos in a template. StoryForge reads your photos and writes a story that has never existed before, with original artwork generated to fill the gaps between your memories — all produced by Gemini as a single interleaved act of storytelling."
