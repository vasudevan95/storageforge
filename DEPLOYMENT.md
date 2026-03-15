# StoryForge — Deployment Guide

This guide covers deploying StoryForge to Google Cloud Run (backend) and Vercel (frontend).

---

## Prerequisites

### 1. Install Google Cloud CLI (`gcloud`)
- Download from: https://cloud.google.com/sdk/docs/install
- Run the installer, then open a **new terminal**
- Verify: `gcloud --version`

### 2. Login and set project
```bash
gcloud auth login
gcloud config set project storyforge-490116
```

### 3. Enable required GCP APIs
```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com texttospeech.googleapis.com
```

---

## Part 1: Backend → Google Cloud Run

### Step 1 — Grant IAM permissions to Cloud Run

First, get your project number:
```bash
gcloud projects describe storyforge-490116 --format="value(projectNumber)"
```
It prints a number like `291626990315`. Use it in the next two commands:

```bash
gcloud projects add-iam-policy-binding storyforge-490116 \
  --member="serviceAccount:291626990315-compute@developer.gserviceaccount.com" \
  --role="roles/datastore.user"

gcloud projects add-iam-policy-binding storyforge-490116 \
  --member="serviceAccount:291626990315-compute@developer.gserviceaccount.com" \
  --role="roles/storage.admin"
```

### Step 2 — Make GCS bucket publicly readable
```bash
gcloud storage buckets add-iam-policy-binding gs://storyforge-artifacts \
  --member="allUsers" \
  --role="roles/storage.objectViewer"
```

### Step 3 — Copy Dockerfile to repo root
The Dockerfile lives in `infrastructure/` but the deploy command needs it at the root:
```bash
cp infrastructure/Dockerfile .
```

### Step 4 — Deploy to Cloud Run (first time)
Run this from the repo root (`D:\Projects\Hackthon\storyforge`).
Replace `YOUR_GEMINI_KEY` with the actual key from `backend/.env`:

```bash
gcloud run deploy storyforge-backend \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --set-env-vars "GOOGLE_API_KEY=YOUR_GEMINI_KEY,GOOGLE_CLOUD_PROJECT=storyforge-490116,GCS_BUCKET=storyforge-artifacts"
```

- Takes ~3 minutes
- At the end it prints your **Service URL**:
  ```
  Service URL: https://storyforge-backend-291626990315.asia-south1.run.app
  ```
- **Save this URL** — you'll need it for the frontend

### Step 5 — Verify backend is running
```bash
curl https://storyforge-backend-291626990315.asia-south1.run.app/health
```
Should return: `{"status":"ok","service":"storyforge-backend"}`

---

## Part 2: Frontend → Vercel

### Step 1 — Push code to GitHub
If not already on GitHub:
```bash
git add .
git commit -m "StoryForge hackathon submission"
git push
```

### Step 2 — Deploy on Vercel
1. Go to **vercel.com** → sign up with your GitHub account (free)
2. Click **"Add New Project"** → import your GitHub repo
3. Vercel auto-detects Next.js
4. Before clicking Deploy, open **"Environment Variables"** and add:
   - **Name:** `NEXT_PUBLIC_API_URL`
   - **Value:** `https://storyforge-backend-291626990315.asia-south1.run.app`
5. Click **Deploy**
6. After ~1 minute you get your frontend URL:
   ```
   https://storyforge-xxxx.vercel.app
   ```

This is your **submission URL**.

---

## Redeployment (after code changes)

### Backend code changed
Run this from the repo root — no need to pass env vars again, Cloud Run remembers them:
```bash
gcloud run deploy storyforge-backend \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated
```

### Only an environment variable changed
```bash
gcloud run services update storyforge-backend \
  --region asia-south1 \
  --update-env-vars "KEY=new_value"
```

### Frontend code changed
Just push to GitHub — Vercel auto-redeploys on every push.

---

## Checking Logs (when something breaks)

```bash
gcloud run services logs read storyforge-backend --region asia-south1 --limit 50
```

---

## Quick Reference

| What | Command / URL |
|------|---------------|
| Backend URL | `https://storyforge-backend-291626990315.asia-south1.run.app` |
| Health check | `https://storyforge-backend-291626990315.asia-south1.run.app/health` |
| GCP project | `storyforge-490116` |
| GCS bucket | `storyforge-artifacts` |
| Cloud Run region | `asia-south1` (Mumbai) |
| Redeploy backend | `gcloud run deploy storyforge-backend --source . --region asia-south1 --allow-unauthenticated` |
| View logs | `gcloud run services logs read storyforge-backend --region asia-south1 --limit 50` |

---

## Devpost Submission Checklist

- [ ] Backend live at Cloud Run URL
- [ ] Frontend live at Vercel URL
- [ ] End-to-end test: enter a prompt, story generates, images appear, audio plays
- [ ] Public GitHub repo with this README
- [ ] Architecture diagram (see `image.png` in repo root)
- [ ] Demo video recorded (max 4 minutes)
- [ ] Submit Vercel URL + Cloud Run URL as proof of deployment
