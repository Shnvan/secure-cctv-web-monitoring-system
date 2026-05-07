"""DeepFace-based face recognition with known persons database."""
from __future__ import annotations

import logging
import os
import shutil
from pathlib import Path
from typing import Any

import cv2
import numpy as np

logger = logging.getLogger(__name__)


class FaceRecognizer:
    """Face recognition using DeepFace with a local known-faces directory."""

    def __init__(self, known_faces_dir: str = 'known_faces',
                 model_name: str = 'SFace') -> None:
        self._known_faces_dir = Path(known_faces_dir)
        self._known_faces_dir.mkdir(parents=True, exist_ok=True)
        self._model_name = model_name
        self._known_embeddings: dict[str, list[np.ndarray]] = {}
        self._loaded = False
        self._deepface = None

    def _load(self) -> None:
        if self._loaded:
            return
        try:
            import deepface.DeepFace as DeepFace
            self._deepface = DeepFace
            self._loaded = True
            logger.info('DeepFace loaded with model: %s', self._model_name)
            self._reload_known_faces()
        except Exception as exc:
            logger.error('Failed to load DeepFace: %s', exc)

    def _reload_known_faces(self) -> None:
        """Load embeddings for all known faces from the directory."""
        self._known_embeddings = {}
        if not self._known_faces_dir.exists() or self._deepface is None:
            return

        for person_dir in self._known_faces_dir.iterdir():
            if not person_dir.is_dir() or person_dir.name.startswith('.'):
                continue

            person_name = person_dir.name.replace('_', ' ')
            embeddings: list[np.ndarray] = []

            for img_path in person_dir.iterdir():
                if img_path.suffix.lower() not in ('.jpg', '.jpeg', '.png', '.webp'):
                    continue
                try:
                    result = self._deepface.represent(
                        img_path=str(img_path),
                        model_name=self._model_name,
                        enforce_detection=False,
                    )
                    if result:
                        embeddings.append(np.array(result[0]['embedding']))
                except Exception as exc:
                    logger.warning('Failed to process known face %s: %s', img_path, exc)

            if embeddings:
                self._known_embeddings[person_name] = embeddings
                logger.info('Loaded %d embeddings for %s', len(embeddings), person_name)

    def _cosine_similarity(self, a: np.ndarray, b: np.ndarray) -> float:
        dot = np.dot(a, b)
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return float(dot / (norm_a * norm_b))

    def recognize_faces(self, frame: np.ndarray) -> list[dict[str, Any]]:
        """Detect and recognize faces in a frame.

        Returns list of {bbox: [x,y,w,h], name, confidence, is_known}.
        """
        self._load()
        if self._deepface is None:
            return []

        try:
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

            # Extract faces with embeddings
            representations = self._deepface.represent(
                img_path=rgb_frame,
                model_name=self._model_name,
                enforce_detection=False,
                detector_backend='opencv',
            )

            results: list[dict[str, Any]] = []
            for rep in representations:
                face_area = rep.get('facial_area', {})
                if not face_area:
                    continue

                bbox = [
                    face_area.get('x', 0),
                    face_area.get('y', 0),
                    face_area.get('w', 0),
                    face_area.get('h', 0),
                ]

                # Skip tiny faces (likely false positives)
                if bbox[2] < 20 or bbox[3] < 20:
                    continue

                embedding = np.array(rep['embedding'])

                # Match against known faces
                best_match = 'Unknown'
                best_score = 0.0
                is_known = False

                for person_name, known_embs in self._known_embeddings.items():
                    for known_emb in known_embs:
                        score = self._cosine_similarity(embedding, known_emb)
                        if score > best_score:
                            best_score = score
                            best_match = person_name

                # SFace threshold is typically ~0.5-0.6 for cosine similarity
                threshold = 0.45
                if best_score >= threshold and best_match != 'Unknown':
                    is_known = True
                else:
                    best_match = 'Unknown'
                    best_score = 0.0

                results.append({
                    'bbox': bbox,
                    'name': best_match,
                    'confidence': round(best_score, 3),
                    'is_known': is_known,
                })

            return results
        except Exception as exc:
            logger.error('Face recognition error: %s', exc)
            return []

    # --- Known faces management ---

    def list_known_faces(self) -> list[dict[str, Any]]:
        """List all known persons and their image counts."""
        persons: list[dict[str, Any]] = []
        if not self._known_faces_dir.exists():
            return persons

        for person_dir in sorted(self._known_faces_dir.iterdir()):
            if not person_dir.is_dir() or person_dir.name.startswith('.'):
                continue
            image_count = sum(
                1 for f in person_dir.iterdir()
                if f.suffix.lower() in ('.jpg', '.jpeg', '.png', '.webp')
            )
            persons.append({
                'name': person_dir.name.replace('_', ' '),
                'folder_name': person_dir.name,
                'image_count': image_count,
            })
        return persons

    def add_known_face(self, name: str, image_bytes: bytes, filename: str) -> dict[str, Any]:
        """Save a new known face image and reload embeddings."""
        folder_name = name.strip().replace(' ', '_')
        person_dir = self._known_faces_dir / folder_name
        person_dir.mkdir(parents=True, exist_ok=True)

        # Find next filename
        existing = list(person_dir.glob('*'))
        idx = len(existing) + 1
        ext = Path(filename).suffix or '.jpg'
        save_path = person_dir / f'photo{idx}{ext}'
        save_path.write_bytes(image_bytes)

        logger.info('Saved known face for %s at %s', name, save_path)
        self._reload_known_faces()

        return {'name': name, 'folder_name': folder_name, 'saved_as': str(save_path)}

    def remove_known_face(self, name: str) -> bool:
        """Remove a known person and all their images."""
        folder_name = name.strip().replace(' ', '_')
        person_dir = self._known_faces_dir / folder_name
        if person_dir.exists() and person_dir.is_dir():
            shutil.rmtree(person_dir)
            self._reload_known_faces()
            logger.info('Removed known face: %s', name)
            return True
        return False


face_recognizer: FaceRecognizer | None = None


def get_face_recognizer(known_faces_dir: str = 'known_faces',
                        model_name: str = 'SFace') -> FaceRecognizer:
    global face_recognizer
    if face_recognizer is None:
        face_recognizer = FaceRecognizer(known_faces_dir, model_name)
    return face_recognizer
