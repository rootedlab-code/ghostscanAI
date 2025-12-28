import logging
import cv2
import os
from deepface import DeepFace
from typing import Dict, Any, Optional

from .utils import setup_logger

logger = setup_logger("FaceAnalyzer")

class FaceAnalyzer:
    def __init__(self, model_name: str = "ArcFace", detector_backend: str = "retinaface"):
        self.model_name = model_name
        self.detector_backend = detector_backend
        self._preload_model()

    def _preload_model(self):
        """Preloads the DeepFace model to optimize subsequent calls."""
        try:
            logger.info(f"Pre-loading model {self.model_name} with backend {self.detector_backend}...")
            # DeepFace builds the model architecture and loads weights.
            DeepFace.build_model(self.model_name)
            logger.info("Model pre-loaded successfully.")
        except Exception as e:
            logger.error(f"Critical Error loading model: {e}")
            raise

    def has_face(self, img_path: str, quick: bool = True) -> bool:
        """
        Quick check if image contains a face using a faster backend.
        """
        backend = 'opencv' if quick else self.detector_backend
        try:
            # extract_faces returns a list of dicts. If empty or error, no face.
            # enforce_detection=True ensures it raises error/returns empty if no face.
            objs = DeepFace.extract_faces(
                img_path=img_path, 
                detector_backend=backend,
                enforce_detection=True,
                align=False
            )
            return len(objs) > 0
        except Exception:
            return False

    def verify_match(self, reference_path: str, candidate_path: str) -> Dict[str, Any]:
        """
        Verifies if the candidate image matches the reference image.
        Returns a dictionary with result and metrics.
        """
        try:
            # Check if files exist
            if not os.path.exists(reference_path) or not os.path.exists(candidate_path):
                logger.warning(f"File not found: {reference_path} or {candidate_path}")
                return {"verified": False, "error": "File not found"}

            # Pre-check for face in candidate using fast detector
            # This avoids loading heavy models for landscape shots etc.
            if not self.has_face(candidate_path, quick=True):
                logger.debug(f"No face detected (quick check) in {os.path.basename(candidate_path)}")
                return {"verified": False, "error": "No face detected"}

            logger.info(f"Verifying {os.path.basename(candidate_path)} against reference...")
            
            result = DeepFace.verify(
                img1_path=reference_path,
                img2_path=candidate_path,
                model_name=self.model_name,
                detector_backend=self.detector_backend, # Use the accurate one for actual verification
                enforce_detection=False 
            )
            
            verified = result.get("verified", False)
            distance = result.get("distance", -1)
            threshold = result.get("threshold", -1)
            
            if verified:
                logger.info(f"MATCH FOUND! Distance: {distance} (Threshold: {threshold})")
            else:
                logger.debug(f"No match. Distance: {distance}")
                
            return {
                "verified": verified,
                "distance": distance,
                "threshold": threshold,
                "model": self.model_name
            }

        except Exception as e:
            logger.error(f"Error during verification: {e}")
            return {"verified": False, "error": str(e)}

