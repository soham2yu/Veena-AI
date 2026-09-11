let activeIncidentId = null;
let observer = null;
let lastCaptionText = "";
let panelEl = null;
let contentEl = null;

console.log("VAANI Content Script loaded");

function createOrUpdatePanel() {
  if (!panelEl) {
    panelEl = document.createElement("div");
    panelEl.id = "vaani-meet-panel";
    panelEl.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: 350px;
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid rgba(56, 189, 248, 0.3);
      border-radius: 12px;
      z-index: 999999;
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 15px rgba(56, 189, 248, 0.1);
      backdrop-filter: blur(10px);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transition: all 0.3s ease;
    `;
    
    const header = document.createElement("div");
    header.style.cssText = `
      padding: 12px 16px;
      background: rgba(0, 0, 0, 0.2);
      border-bottom: 1px solid rgba(255,255,255,0.1);
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: move;
    `;
    header.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <div style="width: 8px; height: 8px; background: #22c55e; border-radius: 50%; box-shadow: 0 0 10px #22c55e;"></div>
        <span style="font-weight: 600; font-size: 14px; letter-spacing: 1px;">VAANI INTELLIGENCE</span>
      </div>
    `;
    
    // Simple drag logic
    let isDragging = false, startX, startY, initialX, initialY;
    header.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX; startY = e.clientY;
      initialX = panelEl.offsetLeft; initialY = panelEl.offsetTop;
    });
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      panelEl.style.right = 'auto';
      panelEl.style.left = initialX + (e.clientX - startX) + 'px';
      panelEl.style.top = initialY + (e.clientY - startY) + 'px';
    });
    document.addEventListener('mouseup', () => isDragging = false);

    contentEl = document.createElement("div");
    contentEl.style.cssText = `
      padding: 16px;
      font-size: 14px;
      line-height: 1.5;
      max-height: 400px;
      overflow-y: auto;
      color: #cbd5e1;
    `;
    contentEl.innerHTML = `<div style="opacity: 0.7; font-style: italic;">Listening to meeting...</div>`;
    
    panelEl.appendChild(header);
    panelEl.appendChild(contentEl);
    document.body.appendChild(panelEl);
  }
}

function updatePanelContent(text, isThinking = false) {
  if (!contentEl) return;
  if (isThinking) {
    contentEl.innerHTML = `<div style="display: flex; align-items: center; gap: 8px; color: #38bdf8;">
      <svg class="animate-spin" style="width: 16px; height: 16px; animation: spin 1s linear infinite;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
      Analyzing repository...
    </div>
    <style>@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }</style>`;
  } else {
    // Add typewriter effect
    contentEl.innerHTML = `<div style="border-left: 3px solid #38bdf8; padding-left: 12px; margin-top: 8px;">
      <strong style="color: #38bdf8; display: block; margin-bottom: 4px; font-size: 11px; letter-spacing: 1px;">VAANI</strong>
      ${text}
    </div>`;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "START_MEET_CAPTURE") {
    activeIncidentId = request.incidentId;
    createOrUpdatePanel();
    startGoogleMeetCaptionObserver();
    sendResponse({ status: "started" });
  } else if (request.action === "STOP_MEET_CAPTURE") {
    activeIncidentId = null;
    if (observer) observer.disconnect();
    if (panelEl) {
      panelEl.remove();
      panelEl = null;
    }
    sendResponse({ status: "stopped" });
  }
});

function startGoogleMeetCaptionObserver() {
  console.log("Starting Google Meet Caption Observer for incident: ", activeIncidentId);
  
  if (observer) observer.disconnect();

  observer = new MutationObserver((mutations) => {
    if (!activeIncidentId) return;

    for (const mutation of mutations) {
      if (mutation.type === "characterData" || mutation.type === "childList") {
        const target = mutation.target;
        
        let text = "";
        let speakerName = "Unknown Participant";

        // Highly efficient target isolation to prevent DOM lag
        const el = target.nodeType === Node.TEXT_NODE ? target.parentElement : target;
        const captionContainer = el.closest('.TBMuR, .KjWwnd, .a4cQT, [jsname="tV9hkb"], .iOzk7');
        
        if (!captionContainer) continue; 

        const speakerEl = captionContainer.querySelector(".zs7s8d, .VbkSUe");
        if (speakerEl) speakerName = speakerEl.textContent;
        text = target.nodeType === Node.TEXT_NODE ? target.textContent : target.innerText;

        if (text && text.trim().length > 3 && text !== lastCaptionText) {
          lastCaptionText = text;
          sendToSutradhar(speakerName, text);
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

let debounceTimer = null;
function sendToSutradhar(speaker, text) {
  clearTimeout(debounceTimer);
  
  // Smart trigger logic mirroring the frontend UI
  const isExplicitSummon = text.toLowerCase().includes("vaani") || text.toLowerCase().includes("vani");
  const debounceTime = isExplicitSummon ? 1500 : 4500;
  
  debounceTimer = setTimeout(() => {
    updatePanelContent("", true); // show thinking spinner
    
    chrome.runtime.sendMessage({
      action: "SEND_TRANSCRIPT",
      payload: {
        incident_id: activeIncidentId,
        transcript: [{
          speaker: speaker || "Meeting Participant",
          timestamp: new Date().toISOString(),
          text: text
        }]
      }
    }, (response) => {
      if (chrome.runtime.lastError) {
        updatePanelContent("Extension Error: " + chrome.runtime.lastError.message);
      } else if (response?.success && response?.data?.analysis?.vaani_action?.speak) {
        // AI specifically chose to speak! Display it!
        updatePanelContent(response.data.analysis.vaani_action.text);
      } else if (response?.success) {
         contentEl.innerHTML = `<div style="opacity: 0.7; font-style: italic;">Listening...</div>`;
      } else {
        updatePanelContent("API Error: " + response?.error);
      }
    });
  }, debounceTime);
}

