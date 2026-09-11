# Rime Integration Evidence

## Hard Voice Claim
VAANI successfully implements Rime Labs API (`mistv3` model, `luna` speaker) as its primary, low-latency text-to-speech engine to provide dynamic, organic voice responses in live war room incidents. The integration is performed securely server-side.

## Acceptance Test
**Goal**: Verify that the backend `/api/tts` endpoint successfully authenticates with Rime Labs, generates valid MP3 audio from a text string, and streams it back.

## Procedure
1. Set the `RIME_API_KEY` environment variable in the backend.
2. Start the FastAPI backend server (`uvicorn app.main:app --port 8000`).
3. Send an HTTP GET request to `/api/tts?text=Hello+World`.
4. Observe the response headers and body to confirm it is a valid `audio/mpeg` (MP3) file.

## Result
**PASS**: The endpoint correctly intercepts the request, maps it to the `https://users.rime.ai/v1/rime-tts` endpoint using the `mistv3` model, and returns a 200 OK with binary MP3 audio. 

## Limitations
- **Latency**: Generating longer sentences can incur 500-1000ms latency before the first byte of audio is returned, which can feel slightly delayed in a fast-paced incident call.
- **Language**: Only configured for English natively right now.
- **Error Handling**: If Rime rate limits the request, the backend catches the failure and returns a 500 error instead of audio, falling back to silent UI text mode on the frontend.

## Repeatable Command / Fixture
You can verify the TTS integration is working by running the following command against a running backend instance. It saves the resulting audio to a test file:

```bash
# Set your local backend URL and test
curl -X GET "http://localhost:8000/api/tts?text=Testing%20the%20Rime%20integration%20now" \
     -H "accept: application/json" \
     --output rime_test_output.mp3

# Verify the file is an MP3
file rime_test_output.mp3
```
