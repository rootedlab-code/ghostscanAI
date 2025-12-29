import os
import time
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

# Core & Modules Imports
from src.core.database import db_manager
from src.core.module_manager import module_manager
# Core & Modules Imports
from src.core.database import db_manager
from src.core.module_manager import module_manager

# Secure Import for Premium Modules
async def register_premium_modules():
    try:
        from src.modules.sauron.module import sauron_module
        module_manager.register_module(sauron_module)
    except (ImportError, ModuleNotFoundError):
        logger.warning("Premium Module 'Sauron' missing or encrypted. Features disabled.")

    try:
        from src.modules.neutron.module import neutron_module
        module_manager.register_module(neutron_module)
    except (ImportError, ModuleNotFoundError):
        logger.warning("Premium Module 'Neutron' missing or encrypted. Features disabled.")

    try:
        from src.modules.elyon.module import elyon_module
        module_manager.register_module(elyon_module)
    except (ImportError, ModuleNotFoundError):
        logger.warning("Premium Module 'Elyon' missing or encrypted. Features disabled.")

# Setup Logger
logger = setup_logger("API")

# Register Modules (Deferred to startup event or handled implicitly if imports succeed)
# We will call register_premium_modules() in the startup event wrapper if needed, 
# or just run it now if we are okay with sync imports (which we are for simplified python modules).
# Since imports are usually sync, we can just run the function logic inline here, but without async def.


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
        
        for connection in list(self.active_connections):
            try:
                await connection.send_text(message)
            except:
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

# Attach broadcast handler to root logger
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
    # 1. Start Log Broadcaster
    asyncio.create_task(log_manager.start_broadcaster())
    
    # 2. Init Database
    logger.info("Initializing Database...")
    db_manager.init_db()
    
    # 3. Register & Init Modules (Moved here to ensure reliability)
    try:
        from src.modules.sauron.module import sauron_module
        module_manager.register_module(sauron_module)
    except Exception as e:
        logger.warning(f"Sauron load failed: {e}")

    try:
        from src.modules.neutron.module import neutron_module
        module_manager.register_module(neutron_module)
    except Exception as e:
        logger.warning(f"Neutron load failed: {e}")

    try:
        from src.modules.elyon.module import elyon_module
        module_manager.register_module(elyon_module)
    except Exception as e:
        logger.warning(f"Elyon load failed: {e}")

    await module_manager.initialize_all()

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

# --- MODULES API ---

# SAURON
# SAURON
@app.post("/api/modules/sauron/stream/add")
async def add_camera(source: str):
    """Add a new camera stream."""
    module = module_manager.get_module("sauron")
    if not module or not module.is_active:
        raise HTTPException(status_code=403, detail="Sauron Module locked. Commercial license required.")
    
    cam_id = await module.add_camera(source)
    return {"status": "added", "id": cam_id}

# NEUTRON
@app.post("/api/modules/neutron/scan")
async def neutron_scan(username: str, fast_mode: bool = False, use_tor: bool = False, nsfw: bool = False, timeout: int = 10, export_csv: bool = False, background_tasks: BackgroundTasks = BackgroundTasks()):
    """Trigger a deep OSINT scan for a username."""
    module = module_manager.get_module("neutron")
    if not module or not module.is_active:
         # Log for context
        logger.warning("Attempted to access locked Neutron module.")
        raise HTTPException(status_code=403, detail="Neutron Module locked. Commercial license required.")

    # Ensure directory exists
    neutron_dir = os.path.join(DATA_DIR, "neutron")
    if not os.path.exists(neutron_dir):
        os.makedirs(neutron_dir)

    # Run in background
    async def run_scan(uname):
        try:
            logger.info(f"API: Triggering Neutron scan for {uname} [Fast: {fast_mode}, Tor: {use_tor}]")
            results = await module.execute_scan(uname, fast_mode=fast_mode, use_tor=use_tor, nsfw=nsfw, timeout=timeout, export_csv=export_csv)
            
            # Save results to JSON
            timestamp = int(time.time())
            result_file = os.path.join(neutron_dir, f"{uname}_{timestamp}.json")
            # Also save as "latest" for easy retrieval
            latest_file = os.path.join(neutron_dir, f"{uname}_latest.json")
            
            import json
            with open(result_file, "w") as f:
                json.dump(results, f, indent=2)
            shutil.copy(result_file, latest_file)

            logger.info(f"Neutron scan complete for {uname}: {len(results)} matches. Saved to {latest_file}")
        except Exception as e:
            logger.error(f"CRITICAL API ERROR in run_scan: {e}")

    background_tasks.add_task(run_scan, username)
    return {"message": f"Neutron scan started for {username}", "status": "processing"}

@app.get("/api/modules/neutron/results/{username}")
async def get_neutron_results(username: str):
    """Retrieve the latest scan results for a username. (Does not require active module to view cached)"""
    neutron_dir = os.path.join(DATA_DIR, "neutron")
    latest_file = os.path.join(neutron_dir, f"{username}_latest.json")
    
    if os.path.exists(latest_file):
        import json
        with open(latest_file, "r") as f:
            data = json.load(f)
        return {"status": "completed", "results": data}
    else:
        return {"status": "not_found", "results": []}

# ELYON
@app.post("/api/modules/elyon/task")
async def elyon_task(topic: str):
    """Assign a task to the AI Agent."""
    module = module_manager.get_module("elyon")
    if not module or not module.is_active:
        raise HTTPException(status_code=403, detail="Elyon Module locked. Commercial license required.")

    result = await module.execute_task(topic)
    return {"status": "completed", "result": result}

@app.websocket("/ws/logs")
async def websocket_endpoint(websocket: WebSocket):
    await log_manager.connect(websocket)
    try:
        while True:
            # Just keep connection open, maybe receive ping
            await websocket.receive_text()
    except WebSocketDisconnect:
        log_manager.disconnect(websocket)

# SYSTEM SECURITY
from src.core.security import get_module_status, unlock_all_modules

class UnlockRequest(BaseModel):
    key: str

@app.get("/api/system/status")
async def system_status():
    """Get security status of modules."""
    return {"modules": get_module_status()}

@app.post("/api/system/unlock")
async def system_unlock(req: UnlockRequest):
    """Attempt to unlock modules with key."""
    try:
        success, failed = unlock_all_modules(req.key)
        if success > 0:
            return {"status": "success", "unlocked": success, "failed": failed, "message": "System Unlocked. Reloading..."}
        else:
             # If correct key but no files found to unlock, or wrong key (handled by exception effectively)
            return {"status": "failed", "message": "No modules decrypted. Check Key or Files."}
    except ValueError as e:
        return {"status": "error", "message": str(e)}
    except Exception as e:
        logger.error(f"Unlock error: {e}")
        raise HTTPException(status_code=500, detail="Internal Security Error")

# Serve Static Files (Frontend)
# We assume 'src/static' maps to '/static' inside container or similar, 
# but for simplicity we serve from local src/static
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if not os.path.exists(STATIC_DIR):
    os.makedirs(STATIC_DIR)

# Serve match images from data directory
app.mount("/matches", StaticFiles(directory=MATCH_DIR), name="matches")

app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")

