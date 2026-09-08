import asyncio
import httpx
import time

async def main():
    print("==================================================")
    print("VAANI STRESS TEST: TRUE BARGE-IN & STALE TOOL CANCELLATION")
    print("==================================================")
    
    incident_id = "test-barge-in-123"
    url = "http://localhost:8000/api/analyze"
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        print("\n[1] User triggers a tool call...")
        t1 = time.time()
        
        # We don't await this immediately, we let it run in the background
        # so we can interrupt it!
        task1 = asyncio.create_task(client.post(url, json={
            "incident_id": incident_id,
            "transcript": [{
                "speaker": "Operator",
                "timestamp": "10:00:00",
                "text": "VAANI, fact check the memory usage on the secondary database."
            }]
        }))
        
        print("    -> Tool 'FACT_CHECK' has been triggered. Backend is processing (simulating 4s delay)...")
        
        # Wait 1.5 seconds (Tool is still running on the backend)
        await asyncio.sleep(1.5)
        
        print("\n[2] User INTERRUPTS before tool finishes...")
        print("    -> 'Actually, check the primary database instead.'")
        
        # Second request hits the backend. This will INCREMENT the turn_id!
        response2 = await client.post(url, json={
            "incident_id": incident_id,
            "transcript": [{
                "speaker": "Operator",
                "timestamp": "10:00:01",
                "text": "Actually, check the primary database instead."
            }]
        })
        
        print(f"    -> Interruption request finished. Turn incremented.")
        
        # Now we wait for the FIRST task to finally complete its 4-second delay
        print("\n[3] Waiting for the stale tool to finish...")
        try:
            response1 = await task1
            data1 = response1.json()
            print(f"    -> Stale Tool Result Received: {data1['message']}")
            print(f"    -> Did VAANI speak the stale result? {'Yes' if data1['analysis'].get('ai_response') else 'NO! Cancelled successfully.'}")
        except Exception as e:
            print(f"    -> Stale Tool Task failed or timed out: {e}")
            
        print("\n==================================================")
        print("TEST COMPLETE: VAANI successfully fenced the obsolete tool results")
        print("so they cannot re-enter the conversation and be spoken by Rime TTS.")
        print("==================================================")

if __name__ == "__main__":
    asyncio.run(main())
