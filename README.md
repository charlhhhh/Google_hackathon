# VoiceCraft

A real-time multimodal AI coach that listens, sees, and builds live task boards on screen — moving beyond the text-box paradigm into natural voice + vision interaction.

Built for the **Google Cloud Build With AI Hackathon (NYC 2026)**.

**Live Demo:** [https://voicecraft-nvwmvwq4oa-uc.a.run.app/](https://voicecraft-nvwmvwq4oa-uc.a.run.app/)

## What It Does

Speak naturally. Point your camera when you need visual guidance. VoiceCraft responds with voice while simultaneously generating structured UI panels — step-by-step guides, timers, reminders, navigation boards, and more.

**Key interactions:**
- Ask for directions → AI searches live, builds a navigation board with route steps
- Show a medicine bottle → AI reads the label, creates a dosage/warning panel
- Say "set a 5 minute timer" → countdown timer appears instantly
- Ask for cooking help → AI builds a recipe board with ingredients, steps, and timers
- Show a foreign-language sign → AI translates and displays key phrases

## Architecture

```
┌─────────────┐      WebSocket (bidi)      ┌──────────────────┐
│   Browser    │ ◄──────────────────────► │   FastAPI Server   │
│              │   PCM audio 16kHz up      │                    │
│  - AudioWork │   PCM audio 24kHz down    │  Google ADK Runner │
│  - Camera    │   JPEG frames (1fps)      │  ┌──────────────┐ │
│  - Card UI   │   JSON tool events        │  │ Gemini Live   │ │
│              │                            │  │ 2.5 Flash     │ │
└─────────────┘                            │  │ Native Audio  │ │
                                           │  └──────────────┘ │
                                           └──────────────────┘
```

**Frontend:** Vanilla HTML/CSS/JS. AudioWorklet for mic capture (16kHz PCM) and playback (24kHz PCM). Camera streams JPEG frames at 1fps. Dynamic card renderer handles all UI panel types.

**Backend:** FastAPI with WebSocket endpoint. Google ADK `Runner.run_live()` for bidirectional streaming. Tools execute server-side and return structured payloads rendered client-side.

**Model:** `gemini-live-2.5-flash-native-audio` via Google GenAI SDK — native audio input/output with simultaneous tool calling.

## Tool System

VoiceCraft uses a hybrid tool architecture — dedicated tools for common tasks (fast, reliable) and a flexible panel system for everything else:

| Tool | Purpose |
|------|---------|
| `show_timer` | Standalone countdown timer |
| `show_reminder` | Reminder card with optional notification |
| `show_guided_task` | Step-by-step task board (setup, how-to, recipes) |
| `show_navigation_board` | Route-focused board with facts, steps, warnings |
| `render_panel` | Flexible panel with mixed components (callout, fact, list, step, timer, button, etc.) |
| `update_panel` | Live-update an existing panel by component index |
| `clear_panel` | Dismiss one or all panels |
| `google_search` | Live web search for real-time facts |

## Panel Component Types

Panels support rich, mixed-component layouts:
- **heading** — section title
- **text** — paragraph content
- **callout** — highlighted block (neutral / warning / success)
- **fact** — key-value pair (dosage, ETA, station)
- **list** — ordered or unordered items
- **step** — checkable action item with pending/current/done states
- **timer** — inline countdown with start/pause/reset
- **button** — action trigger (open URL, notification, clear panel)
- **divider** — visual separator

## Project Layout

```
.
├── agent.py                    # Agent definition, tools, system prompt
├── server.py                   # FastAPI + WebSocket + ADK streaming
├── frontend/
│   ├── index.html              # App shell
│   ├── style.css               # Full UI styles
│   ├── app.js                  # Client logic, WebSocket, camera/mic
│   ├── audio-handler.js        # AudioWorklet setup
│   ├── pcm-processor.js        # Mic capture worklet
│   ├── pcm-player-processor.js # Playback worklet
│   └── components/
│       ├── card-renderer.js    # Dynamic panel/card renderer
│       ├── checklist.js        # Checklist card
│       ├── info-card.js        # Info card
│       ├── reminder.js         # Reminder card
│       └── timer.js            # Timer card
├── pitch.html                  # Pitch deck (HTML slides)
├── Dockerfile                  # Cloud Run container
├── requirements.txt            # Python dependencies
└── .env                        # Environment config (not committed)
```

## Local Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create a `.env` file:

```bash
GOOGLE_GENAI_USE_VERTEXAI=FALSE
GOOGLE_API_KEY=your_google_ai_studio_key
VOICECRAFT_MODEL=gemini-live-2.5-flash-native-audio
VOICECRAFT_VOICE=Aoede
```

For Vertex AI (recommended for production):

```bash
GOOGLE_GENAI_USE_VERTEXAI=TRUE
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=us-central1
```

Run the server:

```bash
uvicorn server:app --reload
```

Open `http://localhost:8000`. Grant microphone access, then optionally enable camera.

## Deploy to Cloud Run

```bash
gcloud run deploy voicecraft \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --session-affinity
```

Set environment variables in the Cloud Run console or via `--set-env-vars`.

## Tech Stack

- **AI:** Google Gemini Live 2.5 Flash (native audio) + Google ADK
- **Backend:** Python, FastAPI, WebSocket
- **Frontend:** Vanilla JS, Web Audio API, AudioWorklet
- **Deployment:** Google Cloud Run with session affinity
- **Search:** Google Search (grounding tool via ADK)

## Team Members and Contributors

| Name | Role |
|------|------|
| **Charlie** | Project lead — system architecture, agent design, tool system, frontend UI/UX, Cloud Run deployment |
| **Xavier Yin** | Backend development — tool implementation, system prompt engineering, navigation and guided-task tools, server integration |
| **Summer Wang** | Frontend development — UI components, pitch deck design, styling and visual polish |
