import logging
import os
from typing import List

def setup_logger(name: str = "OSINT_FaceScanner") -> logging.Logger:
    """Configures and returns a logger with the specified name."""
    logger = logging.getLogger(name)
    if not logger.handlers:
        logger.setLevel(logging.INFO)
        formatter = logging.Formatter('[%(levelname)s] %(asctime)s - %(message)s')
        
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)
    
    return logger

def ensure_directories(paths: List[str]) -> None:
    """Ensures that the specified directories exist."""
    for path in paths:
        try:
            os.makedirs(path, exist_ok=True)
        except OSError as e:
            # We use a primitive print here because logger might not be setup yet or
            # this is a critical os failure
            print(f"Error creating directory {path}: {e}")

def clean_filename(filename: str) -> str:
    """Sanitizes a string to be safe for filenames."""
    return "".join([c for c in filename if c.isalpha() or c.isdigit() or c in (' ', '.', '_', '-')]).rstrip()
