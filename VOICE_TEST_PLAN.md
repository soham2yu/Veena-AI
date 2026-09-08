# VAANI Voice Interaction Test Plan

This document outlines the testing protocol to verify VAANI's ability to handle multi-turn real-time conversations, true barge-in, and stale-response cancellation.

## Scenario 1: The "Smart Silence"
1. Join the VAANI room.
2. Have two or more users discuss an issue rapidly: 
   - User A: "I think the server is down."
   - User B: "Let me check the logs."
3. **Verification:** VAANI should extract these as facts/hypotheses in the dashboard but MUST NOT speak. The agent action should be `STAY_SILENT`.

## Scenario 2: Direct Interrogation
1. Say: "VAANI, what was the last thing User B said?"
2. **Verification:** VAANI should respond directly using Rime TTS. The audio should play clearly, and the UI should show the active text.

## Scenario 3: True Barge-in (Audio Interruption)
1. Trigger a long response from VAANI: "VAANI, please summarize the entire discussion in detail."
2. As soon as VAANI starts speaking (Rime audio begins playing), speak loudly into the microphone: "Wait, stop."
3. **Verification:** The Web Speech API `onInterimResult` should instantly fire, and the frontend must call `audio.pause()`. The TTS audio MUST stop playing immediately.

## Scenario 4: Stale Tool Cancellation
1. Trigger a slow tool call: "VAANI, fact-check the memory usage on the secondary replica."
2. The backend will simulate a slow tool (4-second delay).
3. Before the 4 seconds elapse, speak again: "Actually, check the primary database instead."
4. **Verification:** The backend `turn_id` will increment. When the simulated 4-second delay finishes, the backend will detect the `turn_id` mismatch and DISCARD the result. VAANI will NOT speak the fact-check result for the secondary replica.
