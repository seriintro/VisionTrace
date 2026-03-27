# VisionTrace — AI Surveillance Intelligence Platform

> A full-stack, locally-hosted AI surveillance system that watches, remembers, and understands your footage — powered by Gemini 2.5 Flash, Next.js, and a persistent SQLite memory layer.

---

## What is VisionTrace?

VisionTrace turns your recordings and live camera feed into a searchable, intelligent surveillance system. Instead of scrubbing through hours of footage manually, you simply ask questions in plain English:

- *"What happened today after 2am?"*
- *"When did someone last appear in the camera?"*
- *"Give me a weekly activity report."*
- *"What was the person wearing at 9am on March 20?"*

Every recording saved — whether from live surveillance or manually uploaded — is automatically analysed, summarised, tagged, and stored in a local SQLite memory database. The AI answers are grounded entirely in your actual footage.

---
## Interface Preview
### Dashboard
![Dashboard](<Screenshot 2026-03-28 023633.png>)
### AI Chat
![AI Chat](<Screenshot 2026-03-28 023923.png>)




---

## Features

### Live Surveillance
- Connect via **DroidCam** (Android phone as IP camera over WiFi) or your device's built-in webcam
- Live MJPEG stream proxied through the backend
- Front/rear camera toggle for device webcam
- **Start/Stop Recording** — captures live footage directly in the browser and auto-saves it to the correct date folder
- Ask the AI questions about what it sees in real time using actual captured frames

### Recordings & Playback
- All recordings auto-organised into `surveillance-videos/YYYY-MM-DD/` folders
- Video player with scrubbing and seekable timeline
- **Detected moments** shown on the timeline with colour-coded markers (person / anomaly / object / vehicle)
- Drag-and-drop upload with date assignment
- Manual Scan button to detect and index moments in any existing recording

### AI Memory System
- Every saved or uploaded recording is **automatically analysed in the background** — no manual action needed
- Stores per-recording: plain-English summary, people description, tags, anomaly flags, and individual timestamped events
- Memory is persisted in a local `sentinel-memory.db` SQLite file — survives restarts
- Instant answers for previously indexed recordings (no re-extraction needed)
- Derived summaries and events are stored independently from raw video files, enabling persistent querying across the system

### Intelligent AI Chat
| Query Type | Example | How it works |
|---|---|---|
| Temporal | *"What happened at 3pm on March 20?"* | Parses date + time, finds closest video, extracts frames, answers |
| Latest | *"Summarise the latest recording"* | Reads from memory instantly |
| Memory search | *"When did someone last appear?"* | Full-text search across all indexed events |
| Cross-video | *"Show all times there was motion"* | Searches event memory across every recording |
| Report | *"What happened today?"* / *"Weekly report"* | Synthesises all stored summaries for the period |
| Live | *"What is happening right now?"* | Captures frames from live feed, sends to Gemini |

The system never calls the AI without real data to ground it. If no recordings exist for a period, it says so directly.


---

## Architecture

```
sentinel/
├── backend/                          ← Express + TypeScript API (port 3001)
│   └── src/
│       ├── routes/
│       │   ├── analyze.ts            ← Query routing + memory integration
│       │   ├── upload.ts             ← File upload + auto-index trigger
│       │   ├── videos.ts             ← Video indexing, streaming, thumbnails
│       │   ├── moments.ts            ← AI moment detection
│       │   ├── stream.ts             ← DroidCam MJPEG proxy
│       │   └── memory.ts             ← Memory search, reports, reindex API
│       └── services/
│           ├── gemini.ts             ← Gemini 2.5 Flash integration + prompts
│           ├── autoIndex.ts          ← Background indexing pipeline
│           ├── memoryStore.ts        ← SQLite read/write (sql.js)
│           ├── videoIndex.ts         ← Date/time indexed video scanner
│           └── frameExtract.ts       ← FFmpeg frame extraction (webm-safe)
│
├── frontend/                         ← Next.js 14 App Router (port 3000)
│   └── src/
│       ├── app/
│       │   ├── page.tsx              ← Dashboard (stats, recent recordings, moments)
│       │   ├── live/page.tsx         ← Live camera feed + chat
│       │   ├── recordings/page.tsx   ← Browse, play, and query recordings
│       │   └── chat/page.tsx         ← Dedicated AI chat interface
│       ├── components/
│       │   ├── camera/LiveCamera.tsx ← DroidCam MJPEG + device cam + recorder
│       │   ├── chat/ChatPanel.tsx    ← AI chat with frame capture
│       │   ├── timeline/Timeline.tsx ← Scrubber with moment markers
│       │   ├── dashboard/VideoCard.tsx
│       │   ├── dashboard/UploadModal.tsx
│       │   └── ui/Sidebar.tsx
│       └── lib/api.ts                ← Typed API client
│
├── surveillance-videos/              ← Your recordings (auto-created)
│   └── YYYY-MM-DD/
│       └── HH-MM-SS.webm / .mp4
├── sentinel-memory.db                ← SQLite memory (auto-created)
└── scripts/setup.js                  ← First-run setup script
```

---

## AI Pipeline

```
Recording saved
      │
      ▼
autoIndex.ts (background)
      │
      ├── extractFramesFromVideo()   ← ffmpeg extracts 6 frames
      │         (webm-safe: fps-filter fallback for browser recordings)
      │
      ├── Gemini 2.5 Flash           ← structured JSON prompt
      │         returns: summary, people_desc, tags, anomalies, events[]
      │
      └── memoryStore.ts             ← writes to SQLite
                ├── recordings table (summary, tags, anomalies)
                └── events table     (label, description, abs_timestamp)

User asks a question
      │
      ▼
analyze.ts (query router)
      │
      ├── detectMemoryQuery()        ← is it a cross-video / report query?
      │         ├── yes → searchMemory() / getRecentEvents()
      │         │         inject context → Gemini → answer
      │         └── no  ↓
      │
      ├── parseDateFromQuery()       ← "yesterday", "March 20", "today"
      ├── parseTimeFromQuery()       ← "at 3pm", "around 2:30"
      │
      ├── find video in index
      ├── load memory context (if indexed)
      ├── extract frames (if needed)
      └── Gemini → answer
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| AI Model | Google Gemini 2.5 Flash |
| Backend | Node.js + Express + TypeScript |
| Frontend | Next.js 15 (App Router) + TypeScript |
| Memory Database | sql.js (pure-JS SQLite, no native build) |
| Video Processing | FFmpeg via fluent-ffmpeg |
| Live Recording | Browser MediaRecorder API + HTML5 Canvas |
| Camera Streaming | DroidCam MJPEG / Web MediaDevices API |
| File Upload | Multer |

---

## Quick Start

### Prerequisites

- **Node.js 18+**
- **FFmpeg** — `apt install ffmpeg` / `brew install ffmpeg`/ `winget install ffmpeg`
- **Gemini API key** — free at [aistudio.google.com](https://aistudio.google.com)
- **DroidCam** *(optional)* — Android app + desktop client on same WiFi network

### 1. Clone & Setup

```bash
git clone <your-repo>
cd sentinel
node scripts/setup.js
```

This creates the `.env` files and the `surveillance-videos/` folder structure.

### 2. Configure Environment

Edit `backend/.env`:

```env
GEMINI_API_KEY=your_gemini_api_key_here
DROIDCAM_URL=http://192.168.x.x:4747        # your phone's local IP
VIDEOS_DIR=../surveillance-videos
MEMORY_DB_PATH=../sentinel-memory.db
PORT=3001
```

Edit `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_DROIDCAM_URL=http://192.168.x.x:4747
```

### 3. Install & Run

```bash
npm run install:all    # installs backend + frontend dependencies
npm run dev            # starts both servers concurrently
```

Open **http://localhost:3000**

---

## Recording Folder Structure

VisionTrace reads and writes recordings in this structure:

```
surveillance-videos/
  2026-03-24/
    02-23-15.webm       ← browser-recorded (live surveillance)
    14-30-00.mp4        ← manually uploaded
  2026-03-23/
    09-15-00.mp4
```

Supported formats: `.mp4` `.mkv` `.avi` `.mov` `.webm` `.m4v`

Filenames must be in `HH-MM-SS` format. VisionTrace uses this to determine the recording time. Files saved from live surveillance are named automatically.


---


## API Reference

### Videos

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/videos` | List all videos grouped by date |
| `GET` | `/api/videos/:id/stream` | Stream video file (range-request supported) |
| `GET` | `/api/videos/:id/thumbnail` | Generate thumbnail |
| `POST` | `/api/videos/refresh` | Force re-scan of video folder |

### Analysis

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/analyze` | Main AI query endpoint (all modes) |
| `POST` | `/api/moments/:videoId` | Detect and store moments for a video |
| `GET` | `/api/moments` | Get all detected moments |

### Upload

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/upload?date=YYYY-MM-DD` | Upload a video file (triggers auto-index) |

### Memory

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/memory/search?q=...` | Search all indexed events by keyword |
| `GET` | `/api/memory/report?days=7` | Generate AI activity report for N days |
| `GET` | `/api/memory/recording/:id` | Get stored memory for a specific recording |
| `POST` | `/api/memory/reindex/:id` | Force re-analyse a specific recording |

### Stream & Health

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/stream/status` | Check DroidCam connectivity |
| `GET` | `/api/stream/mjpeg` | Proxied live MJPEG stream |
| `GET` | `/health` | Backend health + configuration status |

---

## Example Queries

```
# Temporal
"What was happening at 2am today?"
"What happened yesterday evening?"
"Describe activity on March 20 at 3pm"

# Memory search
"When did someone last appear in the camera?"
"Show all times there was motion"
"Were there any unusual events this week?"

# Reports
"What happened today?"
"Give me a weekly activity report"
"Summarise the last 3 days"

# Latest
"Summarise the latest recording"
"What was in the most recent recording?"

# Live
"What is the person wearing?"
"How many people are in frame?"
"Describe what you see"
```

---

## Project Status

| Feature | Status |
|---|---|
| Live camera feed (DroidCam + device) | ✅ |
| Live recording + auto-save | ✅ |
| Manual video upload | ✅ |
| Temporal AI queries | ✅ |
| Auto-indexing on upload | ✅ |
| Persistent SQLite memory | ✅ |
| Cross-video memory search | ✅ |
| Activity reports | ✅ |
| Moment detection | ✅ |
| Local timezone support | ✅ |