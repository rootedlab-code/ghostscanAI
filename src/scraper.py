import os
import time
import random
import requests
from typing import List, Optional
from ddgs import DDGS
from .utils import setup_logger, clean_filename

logger = setup_logger("SecureScraper")

class SecureScraper:
    def __init__(self, tor_host: str = "tor-proxy", tor_port: int = 9050):
        self.tor_host = tor_host
        self.tor_port = tor_port
        self.proxies = {
            'http': f'socks5h://{tor_host}:{tor_port}',
            'https': f'socks5h://{tor_host}:{tor_port}'
        }
        self.session = self._create_tor_session()
        self._validate_connection()

    def _create_tor_session(self) -> requests.Session:
        """Creates a requests Session with Tor proxies and retry logic."""
        session = requests.Session()
        session.proxies = self.proxies
        # Basic headers, will be rotated per request if needed
        session.headers.update({
            "User-Agent": self._get_random_user_agent()
        })
        return session

    def _get_random_user_agent(self) -> str:
        """Returns a random User-Agent string."""
        user_agents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:90.0) Gecko/20100101 Firefox/90.0",
             "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:91.0) Gecko/20100101 Firefox/91.0"
        ]
        return random.choice(user_agents)

    def _validate_connection(self):
        """Validates Tor connection."""
        try:
            # Short timeout for validation
            r = self.session.get('https://checkip.amazonaws.com', timeout=20)
            logger.info(f"Connected via Tor. IP: {r.text.strip()}")
        except Exception as e:
            logger.warning(f"Could not verify Tor connection: {e}")

    def search_duckduckgo_images(self, query: str, max_results: int = 20) -> List[dict]:
        """Searches DuckDuckGo Images and returns a list of dictionaries with metadata."""
        logger.info(f"Searching DuckDuckGo for: {query}")
        
        results_data = []
        max_retries = 3
        
        for attempt in range(max_retries):
            try:
                # DDGS manages its own request logic, but we can pass proxies/headers
                # Warning: DDGS might not support passing a full session object directly easily, 
                # but we can pass proxies.
                # We rotate UA for DDGS specifically
                headers = {"User-Agent": self._get_random_user_agent()}
                
                with DDGS(headers=headers, proxy=self.proxies['https'], timeout=45) as ddgs:
                    results = ddgs.images(
                        keywords=query,
                        region="wt-wt",
                        safesearch="off",
                        max_results=max_results
                    )
                    
                    for r in results:
                        if r.get('image'):
                            results_data.append({
                                "url": r.get('image'),
                                "title": r.get('title', 'Unknown'),
                                "source": r.get('source', r.get('url', 'Unknown')), 
                                "thumbnail": r.get('thumbnail')
                            })
                
                if results_data:
                    logger.info(f"Found {len(results_data)} images via DDGS API.")
                    return results_data
                else:
                    logger.debug(f"No results on attempt {attempt + 1}")
                    # If empty, maybe minimal wait then retry or break
                    time.sleep(2)
                    continue

            except Exception as e:
                logger.warning(f"Search attempt {attempt + 1}/{max_retries} failed: {e}")
                time.sleep(random.uniform(3, 7)) # Backoff
        
        return results_data

    def download_image(self, image_data: dict, folder: str) -> Optional[str]:
        """Downloads an image and returns the local path."""
        url = image_data.get('url')
        if not url:
            return None
            
        try:
            # Pre-filter based on common invalid file types in URL (simple heuristic)
            if any(x in url.lower() for x in ['.svg', '.webp']): 
                # Skip SVGs or WebP if we want STRICT jpg/png, 
                # though deepface handles some, simple jpg preference is safer for now.
                pass

            # Rotate UA for download
            self.session.headers.update({"User-Agent": self._get_random_user_agent()})
            
            response = self.session.get(url, timeout=25)
            if response.status_code == 200:
                # Content-Type check
                content_type = response.headers.get('Content-Type', '').lower()
                if 'image' not in content_type:
                    logger.debug(f"Skipping non-image content type: {content_type} for {url}")
                    return None

                filename = clean_filename(url.split("/")[-1])
                # Safety checks
                if not filename or len(filename) > 50: 
                    filename = f"image_{int(time.time())}_{random.randint(1000,9999)}.jpg"
                
                # Normalize extension
                if not any(filename.lower().endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.bmp']):
                    filename += ".jpg"

                filepath = os.path.join(folder, filename)
                with open(filepath, 'wb') as f:
                    f.write(response.content)
                
                return filepath
        except Exception as e:
            logger.debug(f"Failed to download {url}: {e}")
        
        return None

    def close(self):
        self.session.close()

