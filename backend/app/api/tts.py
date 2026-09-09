import os
import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

router = APIRouter()

@router.get("/")
async def get_tts(text: str, voice: str = None):
    """
    Generate natural human speech from text using Rime TTS.
    """
    api_key = os.getenv("RIME_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Rime API key not configured")

    model = os.getenv("RIME_MODEL", "mistv3")
    speaker = os.getenv("RIME_SPEAKER", "luna")
    
    url = os.getenv("RIME_ENDPOINT", "https://users.rime.ai/v1/rime-tts")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "audio/mp3"
    }
    payload = {
        "text": text,
        "speaker": voice if voice else speaker,
        "modelId": model,
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, headers=headers, timeout=60.0)
            
        if response.status_code != 200:
            import json
            try:
                error_msg = response.json()
                if "audioContent" in error_msg:
                    import base64
                    audio_bytes = base64.b64decode(error_msg["audioContent"])
                    return Response(content=audio_bytes, media_type="audio/mpeg")
            except Exception:
                pass
            print(f"Rime API returned {response.status_code}: {response.text}")
            raise HTTPException(status_code=response.status_code, detail=f"Rime API Error: {response.text}")
            
        return Response(content=response.content, media_type="audio/mpeg")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Unexpected error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
