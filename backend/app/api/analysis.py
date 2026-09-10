"""
Main analysis endpoint — the core of Phase 1.

POST /api/analyze
Accepts an incident transcript, runs LLM analysis, merges results
into incident memory, and returns structured intelligence.
"""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.ai.analyzer import analyzer
from app.ai.schemas import IncidentAnalysis
from app.api.websocket import manager as ws_manager
from app.models.incident import TranscriptEntry
from app.services.incident_service import incident_service

logger = logging.getLogger(__name__)
router = APIRouter()


class TranscriptInput(BaseModel):
    """A single transcript entry in the request."""

    speaker: str
    timestamp: str
    text: str


class AnalyzeRequest(BaseModel):
    """Request body for the analyze endpoint."""

    incident_id: str = Field(description="Unique incident identifier")
    transcript: list[TranscriptInput] = Field(
        description="Transcript entries to analyze", min_length=1
    )


class AnalyzeResponse(BaseModel):
    """Response from the analyze endpoint."""

    incident_id: str
    analysis: IncidentAnalysis
    transcript_length: int = Field(
        description="Total transcript entries for this incident"
    )
    message: str = "Analysis complete"


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_transcript(request: AnalyzeRequest) -> AnalyzeResponse:
    """
    Analyze an incident transcript segment and return structured intelligence.

    The analysis is merged into the incident's persistent state (in-memory),
    so repeated calls with new transcript segments build up the full picture.
    """
    logger.info(
        "Analyzing %d transcript entries for incident %s",
        len(request.transcript),
        request.incident_id,
    )

    # Ensure incident exists
    incident_service.create_incident(request.incident_id)

    # Append raw transcript to incident (preserved for audit)
    transcript_entries = [
        TranscriptEntry(
            speaker=entry.speaker,
            timestamp=entry.timestamp,
            text=entry.text,
        )
        for entry in request.transcript
    ]
    incident_service.append_transcript(request.incident_id, transcript_entries)
    
    # Broadcast transcript update immediately so UI reflects speech
    await ws_manager.broadcast_incident_state(request.incident_id)

    # Skip AI analysis if the transcript only contains system messages
    meaningful_entries = [t for t in request.transcript if t.text not in ("joined the session", "left the session")]
    if not meaningful_entries:
        logger.info("Skipping AI analysis: only system messages in chunk")
        from app.ai.schemas import IncidentAnalysis
        analysis = IncidentAnalysis(topics=[], decisions=[], timeline=[], risks=[], code_findings=[])
        incident = incident_service.get_incident(request.incident_id)
        return AnalyzeResponse(
            incident_id=incident.id,
            analysis=analysis,
            transcript_length=len(incident.transcript),
            message="Skipped analysis for system messages",
        )

    # Increment turn id for new user speech
    current_turn = incident_service.increment_turn(request.incident_id)

    # Run AI analysis
    try:
        incident = incident_service.get_incident(request.incident_id)
        all_entries = [entry.model_dump() for entry in incident.transcript if entry.text not in ("joined the session", "left the session")]
        transcript_dicts = all_entries[-20:]
        
        # Only analyze if we actually have meaningful history
        if transcript_dicts:
            project_context = incident.project_context if hasattr(incident, 'project_context') else None
            analysis = await analyzer.analyze(transcript_dicts, project_context=project_context)
            
            if analysis.vaani_action and analysis.vaani_action.speak and analysis.vaani_action.text:
                analysis.ai_response = analysis.vaani_action.text
                
            # Final staleness check before merging
            if incident_service.get_turn(request.incident_id) != current_turn:
                 logger.info("Response stale. Dropping.")
                 from app.ai.schemas import IncidentAnalysis
                 return AnalyzeResponse(
                     incident_id=request.incident_id,
                     analysis=IncidentAnalysis(topics=[], decisions=[], timeline=[], risks=[], code_findings=[]),
                     transcript_length=len(incident.transcript),
                     message="Dropped stale response"
                 )

            # Merge analysis into incident state
            incident = incident_service.merge_analysis(request.incident_id, analysis)

        # Broadcast updated AI state to all connected dashboard clients
        await ws_manager.broadcast_incident_state(request.incident_id)
        
    except ValueError as e:
        logger.error("Analysis failed for incident %s: %s", request.incident_id, e)
        raise HTTPException(status_code=502, detail=f"AI analysis failed: {e}") from e
    except Exception as e:
        logger.error("Unexpected error analyzing incident %s: %s", request.incident_id, e)
        raise HTTPException(status_code=502, detail="AI analysis service is unavailable") from e

    return AnalyzeResponse(
        incident_id=request.incident_id,
        analysis=analysis,
        transcript_length=len(incident.transcript),
    )
