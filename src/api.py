import os
import shutil
import logging
from typing import List
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException, WebSocket, WebSocketDisconnect
import asyncio
import queue
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .main import scan_target
from .utils import setup_logger, ensure_directories

# Setup Logger
logger = setup_logger("API")

# WebSocket Log Manager
class LogManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.log_queue = queue.SimpleQueue()
        self.is_running = False

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    def push_log(self, message: str):
        self.log_queue.put(message)

    async def start_broadcaster(self):
        """Background task to consume queue and broadcast."""
        self.is_running = True
        logger.info("Log broadcaster started.")
        while self.is_running:
            try:
                # Non-blocking check or awaitable in a loop
                # Since queue.get() is blocking, we wrap it or use short polling
                # Better: use asyncio.sleep in loop to allow context switches if empty
                while not self.log_queue.empty():
                    msg = self.log_queue.get()
                    await self.broadcast(msg)
                
                await asyncio.sleep(0.1)
            except Exception as e:
                print(f"Broadcaster error: {e}")
                await asyncio.sleep(1)

    async def broadcast(self, message: str):
        if not self.active_connections:
            return
        
        # Snapshot copy to avoid modification during iteration
        for connection in list(self.active_connections):
            try:
                await connection.send_text(message)
            except:
                # If send fails, we assume valid disconnect handled elsewhere or next cycle
                pass

log_manager = LogManager()

# Custom Handler to stream logs
class BroadcastLogHandler(logging.Handler):
    def emit(self, record):
        try:
            msg = self.format(record)
            log_manager.push_log(msg)
        except Exception:
            self.handleError(record)

# Attach broadcast handler to root logger so we capture EVERYTHING (Scraper, Main, API)
root_logger = logging.getLogger()
broadcast_handler = BroadcastLogHandler()
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
broadcast_handler.setFormatter(formatter)
root_logger.addHandler(broadcast_handler)

# On Startup

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

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(log_manager.start_broadcaster())

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

@app.websocket("/ws/logs")
async def websocket_endpoint(websocket: WebSocket):
    await log_manager.connect(websocket)
    try:
        while True:
            # Just keep connection open, maybe receive ping
            await websocket.receive_text()
    except WebSocketDisconnect:
        log_manager.disconnect(websocket)

# Serve Static Files (Frontend)
# We assume 'src/static' maps to '/static' inside container or similar, 
# but for simplicity we serve from local src/static
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if not os.path.exists(STATIC_DIR):
    os.makedirs(STATIC_DIR)

# Serve match images from data directory
app.mount("/matches", StaticFiles(directory=MATCH_DIR), name="matches")

app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")

