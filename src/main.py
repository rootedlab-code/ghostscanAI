import os
import shutil
import time
import random
from concurrent.futures import ThreadPoolExecutor, as_completed
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from .scraper import SecureScraper
from .analyzer import FaceAnalyzer
from .utils import setup_logger, ensure_directories

logger = setup_logger("Main")

# Configuration
DATA_DIR = "/app/data" # Docker internal path
INPUT_DIR = os.path.join(DATA_DIR, "inputs")
DOWNLOAD_DIR = os.path.join(DATA_DIR, "downloads")
MATCH_DIR = os.path.join(DATA_DIR, "matches")

TOR_HOST = os.environ.get("TOR_PROXY_HOST", "tor-proxy")
TOR_PORT = int(os.environ.get("TOR_PROXY_PORT", 9050))
MAX_WORKERS = 5 # Number of parallel downloads

def generate_queries(person_name: str) -> list[str]:
    """Generates a list of smart search queries for a person."""
    base_name = person_name.replace("_", " ").replace("-", " ").strip()
    
    # Basic variants
    queries = [
        f'"{base_name}"',
        f'"{base_name}" portrait',
        f'"{base_name}" profile',
    ]

    # Social media specific variants
    sites = [
        "linkedin.com",
        "instagram.com", 
        "facebook.com", 
        "twitter.com",
        "pinterest.com",
        "flickr.com"
    ]
    
    for site in sites:
        queries.append(f'"{base_name}" site:{site}')

    # Username variant if applicable
    parts = base_name.split()
    if len(parts) == 2:
        queries.append(f'"{parts[0]}.{parts[1]}"')
        queries.append(f'"{parts[0]}_{parts[1]}"')

    return queries

def should_process_image(metadata: dict) -> bool:
    """Pre-filters images based on metadata to avoid obvious junk."""
    title = metadata.get('title', '').lower()
    url = metadata.get('url', '').lower()
    
    # Keywords to avoid
    ignore_terms = [
        "vector", "clipart", "icon", "logo", "symbol", 
        "stock photo", "stock-photo", "illustration",
        "cartoon", "drawing"
    ]
    
    if any(term in title for term in ignore_terms):
        return False
        
    if any(term in url for term in ignore_terms):
        return False

    return True

# Global analyzer instance to avoid reloading model
_analyzer_instance = None

def get_analyzer():
    global _analyzer_instance
    if _analyzer_instance is None:
        try:
            _analyzer_instance = FaceAnalyzer()
        except Exception as e:
            logger.critical(f"Failed to initialize FaceAnalyzer: {e}")
            raise e
    return _analyzer_instance

def scan_target(filename: str):
    """
    Scans a single target ensuring inputs/outputs are handled correctly.
    filename: valid filename present in INPUT_DIR (e.g. 'Mario_Rossi.jpg')
    """
    ensure_directories([INPUT_DIR, DOWNLOAD_DIR, MATCH_DIR])
    
    if not filename or not os.path.exists(os.path.join(INPUT_DIR, filename)):
        logger.error(f"Target file not found: {filename}")
        return

    reference_path = os.path.join(INPUT_DIR, filename)
    person_name = os.path.splitext(filename)[0]
    logger.info(f"Processing reference: {person_name}")

    analyzer = get_analyzer()
    scraper = None
    
    try:
        scraper = SecureScraper(tor_host=TOR_HOST, tor_port=TOR_PORT)
        
        # 1. Scrape Images
        queries = generate_queries(person_name)
        all_results = []
        seen_urls = set()

        for q in queries:
            logger.info(f"Scraping images for query: {q}")
            results = scraper.search_duckduckgo_images(q, max_results=15)
            
            for r in results:
                if r['url'] not in seen_urls:
                    if should_process_image(r):
                        all_results.append(r)
                        seen_urls.add(r['url'])
            
            time.sleep(random.uniform(1, 3))

        if not all_results:
            logger.warning(f"No valid images found for {person_name} after {len(queries)} queries.")
            return

        person_download_dir = os.path.join(DOWNLOAD_DIR, person_name)
        ensure_directories([person_download_dir])
        
        # 2. Parallel Downloads
        downloaded_items = []
        logger.info(f"Attempting to download {len(all_results)} images with {MAX_WORKERS} workers...")
        
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            future_to_meta = {
                executor.submit(scraper.download_image, item, person_download_dir): item 
                for item in all_results
            }
            
            for future in as_completed(future_to_meta):
                meta = future_to_meta[future]
                try:
                    filepath = future.result()
                    if filepath:
                        downloaded_items.append((filepath, meta))
                except Exception as e:
                    logger.error(f"Download exception: {e}")

        logger.info(f"Successfully downloaded {len(downloaded_items)} images.")

        # 3. Verify Matches
        person_match_dir = os.path.join(MATCH_DIR, person_name)
        ensure_directories([person_match_dir])
        
        report = []

        for filepath, metadata in downloaded_items:
            analysis_result = analyzer.verify_match(reference_path, filepath)
            
            if analysis_result.get("verified"):
                filename = os.path.basename(filepath)
                match_path = os.path.join(person_match_dir, filename)
                shutil.move(filepath, match_path)
                
                report_entry = {
                    "image_filename": filename,
                    "match_verified": True,
                    "confidence_distance": analysis_result.get("distance"),
                    "threshold": analysis_result.get("threshold"),
                    "model": analysis_result.get("model"),
                    "source_url": metadata.get("url"),
                    "source_page": metadata.get("source"),
                    "page_title": metadata.get("title"),
                    "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
                }
                report.append(report_entry)
            else:
                try:
                    os.remove(filepath)
                except OSError:
                    pass

        # Save Report
        if report:
            import json
            report_path = os.path.join(person_match_dir, "report.json")
            existing_report = []
            if os.path.exists(report_path):
                try:
                    with open(report_path, "r", encoding="utf-8") as f:
                        existing_report = json.load(f)
                except json.JSONDecodeError:
                    pass
            
            existing_report.extend(report)
            with open(report_path, "w", encoding="utf-8") as f:
                json.dump(existing_report, f, indent=4, ensure_ascii=False)
                
            logger.info(f"Report saved to {report_path} with {len(report)} new matches.")
        else:
            logger.info("No matches found.")

    except Exception as e:
        logger.error(f"Error processing {person_name}: {e}")
    finally:
        if scraper:
            scraper.close()

def main():
    logger.info("Starting Secure OSINT & Facial Recognition Service (Enhanced)")
    ensure_directories([INPUT_DIR, DOWNLOAD_DIR, MATCH_DIR])

    logger.info("Service initialized. Waiting for tasks...")
    
    if not os.listdir(INPUT_DIR):
        logger.warning(f"No reference images found in {INPUT_DIR}. Please add images to start scanning.")

    for filename in os.listdir(INPUT_DIR):
        if filename.lower().endswith(('.jpg', '.jpeg', '.png')):
            scan_target(filename)

    logger.info("Scan completed.")

if __name__ == "__main__":
    main()

