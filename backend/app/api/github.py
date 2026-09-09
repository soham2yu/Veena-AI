import logging
import httpx
from urllib.parse import urlparse
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.incident_service import incident_service

logger = logging.getLogger(__name__)
router = APIRouter()

class ConnectRepoRequest(BaseModel):
    repo_url: str
    incident_id: str

@router.post("/connect")
async def connect_repo(request: ConnectRepoRequest):
    try:
        parsed = urlparse(request.repo_url)
        path_parts = parsed.path.strip("/").split("/")
        if len(path_parts) < 2:
            raise ValueError("Invalid repo URL format")
        owner, repo = path_parts[0], path_parts[1]
    except Exception as e:
        logger.error(f"Failed to parse repo url: {e}")
        raise HTTPException(status_code=400, detail="Invalid repository URL. Provide a URL like https://github.com/owner/repo")

    context_parts = []
    files_analyzed = 0

    headers = {
        "User-Agent": "VAANI-AI-App",
        "Accept": "application/vnd.github.v3+json"
    }

    async with httpx.AsyncClient(headers=headers, follow_redirects=True, timeout=10.0) as client:
        # Get repo metadata
        repo_resp = await client.get(f"https://api.github.com/repos/{owner}/{repo}")
        if repo_resp.status_code != 200:
            logger.error(f"Failed to fetch repo metadata: {repo_resp.status_code} - {repo_resp.text}")
            detail = "Rate limited by GitHub" if repo_resp.status_code == 403 else "Repository not found or private"
            raise HTTPException(status_code=repo_resp.status_code, detail=detail)
        
        repo_data = repo_resp.json()
        context_parts.append(f"Repository: {owner}/{repo}")
        context_parts.append(f"Description: {repo_data.get('description', 'N/A')}")
        context_parts.append(f"Primary Language: {repo_data.get('language', 'N/A')}")
        context_parts.append(f"Stars: {repo_data.get('stargazers_count', 0)}")
        context_parts.append("\n--- FILE STRUCTURE ---")

        # Get file tree
        branch = repo_data.get("default_branch", "main")
        tree_resp = await client.get(f"https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1")
            
        if tree_resp.status_code != 200:
            logger.error(f"Failed to fetch repo tree: {tree_resp.status_code} - {tree_resp.text}")
            raise HTTPException(status_code=tree_resp.status_code, detail="Failed to fetch repository tree")
            
        tree_data = tree_resp.json()
        tree_paths = [item["path"] for item in tree_data.get("tree", []) if item["type"] == "blob"]
        
        context_parts.append("\n".join(tree_paths[:100]))
        
        # Identify key files
        key_files = []
        prioritized_files = ["README.md", "package.json", "requirements.txt", "Dockerfile"]
        
        for path in tree_paths:
            if path in prioritized_files:
                key_files.append(path)
                
        for path in tree_paths:
            if len(key_files) >= 15:
                break
            if path.startswith(("src/", "app/")) or "/" not in path:
                if path.endswith((".py", ".ts", ".tsx", ".js")):
                    if path not in key_files:
                        key_files.append(path)
                        
        key_files = key_files[:15]
        
        context_parts.append("\n--- KEY FILES CONTENT ---")
        
        branch = repo_data.get("default_branch", "main")
        for path in key_files:
            raw_url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}"
            raw_resp = await client.get(raw_url)
            if raw_resp.status_code == 200:
                content = raw_resp.text[:5000]
                context_parts.append(f"\n### {path} ###\n{content}")
                files_analyzed += 1

    context_string = "\n".join(context_parts)
    
    try:
        incident = incident_service.get_incident(request.incident_id)
        if not incident:
            incident = incident_service.create_incident(request.incident_id)
            
        incident.project_context = context_string
        incident_service._save_to_db(incident)
    except Exception as e:
        logger.error(f"Failed to update incident: {e}")
        raise HTTPException(status_code=500, detail="Failed to update incident with project context")

    return {
        "status": "connected",
        "repo": f"{owner}/{repo}",
        "files_analyzed": files_analyzed
    }
