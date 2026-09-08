# VAANI Architecture

VAANI is built with a decoupled frontend/backend architecture designed for real-time speech and context synchronization.

## 1. Frontend (Next.js)
The frontend drives the Voice interface and Intelligence visualization.

- **Audio Capture**: Captures microphone audio using the browser's native `SpeechRecognition` API (`interimResults=true`). 
- **Voice Transmission**: Streams completed sentences via REST POST (`/api/analyze`) to the backend.
- **Interruption Detection**: Uses the `onInterimResult` event to instantly detect when a user starts speaking. If TTS audio is currently playing, it immediately calls `audio.pause()` to achieve true barge-in.
- **UI & State**: Listens to a WebSocket from the backend for the global synchronized Incident State, updating the 3D Orb and intelligence dashboard in real-time.

## 2. Backend (FastAPI + LLM)
The backend acts as the system's "Brain" and "Agent".

- **State Management**: Maintains an in-memory `IncidentState`, tracking `turn_id` for every new transcript block.
- **Agentic Analysis**: For each new turn, the backend prompts the LLM (Gemini or OpenAI) with the entire conversation transcript. The LLM acts as an Agent and returns a structured payload:
  - Extracted intelligence (Facts, Actions, Topics).
  - An Agent Action (`STAY_SILENT`, `FACT_CHECK`, `ANSWER`).
- **Tool Cancellation**: If the LLM chooses a tool (like `FACT_CHECK`), the backend simulates the slow tool. After the tool completes, the backend checks if the `turn_id` has changed (meaning the user spoke while the tool was running). If the turn changed, the backend discards the tool result and prevents it from being spoken.
- **TTS Generation**: Uses the Rime API via the `/api/tts` endpoint to stream low-latency human-like speech audio to the frontend.

## Conceptual Pipeline
`MICROPHONE -> REALTIME AUDIO CAPTURE (Web Speech API) -> CONTEXT ENGINE (FastAPI) -> VAANI AGENT (LLM) -> TOOLS IF NEEDED (with Turn tracking) -> RESPONSE GENERATION -> RIME TTS -> AUDIO PLAYBACK`
