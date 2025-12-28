import os
import shutil
import logging
from typing import List
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .main import scan_target
from .utils import setup_logger, ensure_directories

# Setup Logger
logger = setup_logger("API")

# Paths
DATA_DIR = "/app/data"
INPUT_DIR = os.path.join(DATA_DIR, "inputs")
MATCH_DIR = os.path.join(DATA_DIR, "matches")

app = FastAPI(title="OSINT Face Scanner API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure dirs exist on startup
ensure_directories([INPUT_DIR, MATCH_DIR])

# Models
class TargetResponse(BaseModel):
    filename: str
    status: str

class MatchResult(BaseModel):
    image_filename: str
    match_verified: bool
    confidence_distance: float
    source_url: str
    page_title: str

# Endpoints

@app.get("/api/targets", response_model=List[str])
async def list_targets():
    """List all available targets in input directory."""
    try:
        files = [f for f in os.listdir(INPUT_DIR) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
        return files
    except Exception as e:
        logger.error(f"Error listing targets: {e}")
        return []

@app.post("/api/upload")
async def upload_target(file: UploadFile = File(...)):
    """Upload a new target image."""
    try:
        file_location = os.path.join(INPUT_DIR, file.filename)
        with open(file_location, "wb+") as file_object:
            shutil.copyfileobj(file.file, file_object)
        return {"filename": file.filename, "status": "uploaded"}
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/scan/{filename}")
async def start_scan(filename: str, background_tasks: BackgroundTasks):
    """Start a scan for a specific target in background."""
    if not os.path.exists(os.path.join(INPUT_DIR, filename)):
        raise HTTPException(status_code=404, detail="Target not found")
    
    background_tasks.add_task(scan_target, filename)
    return {"message": f"Scan started for {filename}", "status": "queued"}

@app.get("/api/results/{filename}")
async def get_results(filename: str):
    """Get scan results for a target."""
    target_name = os.path.splitext(filename)[0]
    report_path = os.path.join(MATCH_DIR, target_name, "report.json")
    
    if not os.path.exists(report_path):
        return {"results": []}
    
    try:
        import json
        with open(report_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {"results": data}
    except Exception as e:
        return {"error": str(e), "results": []}

# Serve Static Files (Frontend)
# We assume 'src/static' maps to '/static' inside container or similar, 
# but for simplicity we serve from local src/static
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if not os.path.exists(STATIC_DIR):
    os.makedirs(STATIC_DIR)

app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")

