# VAANI: Agentic Voice Moderator for Live War Rooms

VAANI (formerly Sutradhar) is an autonomous, agentic voice moderator designed to join live technical war rooms (like Google Meet/Zoom discussions or in-person sessions) to actively maintain context and provide conversational AI assistance exactly when needed.

## The Problem
Incident response in multi-person calls is chaotic. People talk over each other, facts get lost, decisions are debated and forgotten, and someone always has to play scribe or look up documentation while troubleshooting.

## The Solution
VAANI joins the session via voice and:
1. Listens continuously using the Web Speech API to capture multi-speaker speech.
2. Extracts live Intelligence using an LLM to build a dynamic context of Facts, Hypotheses, Conflicts, and Action Items.
3. Automatically evaluates Agentic Actions (`STAY_SILENT`, `FACT_CHECK`, `ANSWER`) using its live memory.
4. Speaks organically using Rime TTS when clarification or facts are needed. 

### True Barge-in & Interruption
If VAANI is speaking, or waiting on a slow tool call (like `FACT_CHECK`), and a user speaks (e.g. "Wait no, check the replica database instead"), VAANI instantly aborts its TTS audio output, cancels the stale tool response, and re-evaluates the room state.

## Setup
### Backend
1. `cd backend`
2. `pip install -r requirements.txt`
3. Create `.env` using `.env.example`
4. `uvicorn app.main:app --port 8000`

### Frontend
1. `cd frontend-v2`
2. `pnpm install`
3. `pnpm run dev`

## Hackathon Required Disclosures
* **Architecture & Transport**: Next.js frontend capturing audio via Web Speech API (Native browser). Audio transcript is sent via WebSocket or REST to a FastAPI backend. Backend returns TTS via streaming HTTP response to an HTML5 Audio object.
* **Third-Party Services**: GitHub API (for context ingestion), Supabase/PostgreSQL (for incident state persistence), Google Gemini API (for LLM analysis), Rime Labs API (for TTS generation).
* **Rime Configuration**: 
  * **Model ID**: `mistv3`
  * **Speaker**: `luna` (default)
  * **Language**: English
  * **Endpoint**: `https://users.rime.ai/v1/rime-tts`
  * **Audio Format**: `audio/mp3` (consumed as `audio/mpeg`)
  * **Transport**: HTTP POST via `httpx.AsyncClient` from backend to Rime, streamed back to frontend HTML5 Audio.
* **Known Limitations**: Web Speech API is dependent on Chrome/Safari native implementations and can struggle in extreme background noise compared to dedicated telephony endpoints. The LLM can sometimes hallucinate actions if the transcript is ambiguous.
* **Failure Behavior**: If the LLM or Rime TTS fails, the backend safely catches the error and logs it (returning 502/500), while the frontend UI remains active and listening. The agent gracefully falls back to a `STAY_SILENT` state so the war room is not blocked by a crashed agent. If the DB fails to connect, the system falls back to in-memory state management.
