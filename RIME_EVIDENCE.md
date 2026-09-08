# Rime Integration Evidence

VAANI successfully implements Rime as its primary text-to-speech engine.

## Implementation Details
The Rime API integration is entirely backend-driven to ensure API keys are never exposed to the client.

- **File**: `backend/app/api/tts.py`
- **Mechanism**: The FastAPI endpoint `/api/tts` receives text, securely constructs a request to `https://users.rime.ai/v1/rime-tts`, and attaches the `Bearer {RIME_API_KEY}` authorization header.
- **Payload**:
```json
{
  "text": "...",
  "speaker": "amber",
  "modelId": "v1"
}
```
- **Response Handling**: The backend directly streams the resulting `audio/mp3` or base64 decoded `audioContent` back to the Next.js frontend as an `audio/mpeg` Response.
- **Frontend Playback**: The frontend `useVoiceSession` leverages the native HTML5 `Audio` object to play the returned Rime stream.

## Security
No Rime credentials exist in the frontend. All environment variables (`RIME_API_KEY`, `RIME_MODEL`, `RIME_SPEAKER`) are strictly confined to the backend server.
