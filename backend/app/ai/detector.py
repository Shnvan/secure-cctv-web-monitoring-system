"""YOLOv8 object detection with tracking, MediaPipe pose estimation, and image enhancement."""
from __future__ import annotations

import logging
import threading
from typing import Any

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# COCO class names relevant to surveillance
SURVEILLANCE_CLASSES = {
    0: 'person', 24: 'backpack', 25: 'umbrella', 26: 'handbag',
    27: 'tie', 28: 'suitcase', 39: 'bottle', 41: 'cup',
    43: 'knife', 44: 'spoon', 56: 'chair', 63: 'laptop',
    67: 'cell phone',
}

# MediaPipe pose connection pairs for skeleton drawing
POSE_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 7),   # right face
    (0, 4), (4, 5), (5, 6), (6, 8),   # left face
    (9, 10),                            # mouth
    (11, 12),                           # shoulders
    (11, 13), (13, 15),                 # left arm
    (12, 14), (14, 16),                 # right arm
    (11, 23), (12, 24),                 # torso
    (23, 24),                           # hips
    (23, 25), (25, 27),                 # left leg
    (24, 26), (26, 28),                 # right leg
]

POSE_LANDMARK_NAMES = [
    'nose', 'left_eye_inner', 'left_eye', 'left_eye_outer',
    'right_eye_inner', 'right_eye', 'right_eye_outer',
    'left_ear', 'right_ear', 'mouth_left', 'mouth_right',
    'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
    'left_wrist', 'right_wrist', 'left_pinky', 'right_pinky',
    'left_index', 'right_index', 'left_thumb', 'right_thumb',
    'left_hip', 'right_hip', 'left_knee', 'right_knee',
    'left_ankle', 'right_ankle', 'left_heel', 'right_heel',
    'left_foot_index', 'right_foot_index',
]


# ---- Image Enhancement ----

def enhance_frame(frame: np.ndarray) -> np.ndarray:
    """Apply CLAHE low-light enhancement to improve detection in dark scenes.

    This converts to LAB color space, applies Contrast Limited Adaptive
    Histogram Equalization to the lightness channel, then converts back.
    Cost: ~3ms per frame.
    """
    try:
        lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        lab[:, :, 0] = clahe.apply(lab[:, :, 0])
        return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
    except Exception:
        return frame  # fallback to original if enhancement fails


# ---- Motion Detection ----

class MotionDetector:
    """Simple frame-differencing motion detector.

    Returns True if significant motion is detected between consecutive frames.
    This lets us skip AI processing on static scenes, saving ~80% CPU.

    # FIX: BUG-13 — the old absolute `threshold=3000` was calibrated for
    # 720p/1080p frames. The frontend downscales to 480p (~307k pixels) before
    # sending, which made the threshold demand ~1% of the whole frame to change.
    # For a seated webcam subject that is essentially unreachable, so motion
    # gating rejected every frame and pose detection never ran. We now use a
    # small *ratio* of total pixels so the gate behaves consistently at any
    # resolution.
    """

    def __init__(self, motion_ratio: float = 0.0015) -> None:
        self._prev_gray: dict[str, np.ndarray] = {}
        # 0.0015 = 0.15% of pixels need to change. At 640x480 that's ~460 px;
        # empirically enough to ignore JPEG/camera sensor noise but still catch
        # a seated subject shifting their shoulders / head.
        self._motion_ratio = motion_ratio

    def has_motion(self, frame: np.ndarray, camera_id: str) -> bool:
        frame_h, frame_w = frame.shape[:2]
        total_pixels = max(1, frame_h * frame_w)

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        # Scale blur kernel to frame size — a 21x21 kernel on a 480p frame
        # over-smooths and erases subtle human motion. Use a 5x5 kernel for
        # small frames, 11x11 for medium, 21x21 for >=HD.
        if frame_h < 360:
            blur_k = 5
        elif frame_h < 720:
            blur_k = 11
        else:
            blur_k = 21
        gray = cv2.GaussianBlur(gray, (blur_k, blur_k), 0)

        if camera_id not in self._prev_gray:
            self._prev_gray[camera_id] = gray
            return True  # first frame always triggers

        delta = cv2.absdiff(self._prev_gray[camera_id], gray)
        self._prev_gray[camera_id] = gray

        thresh = cv2.threshold(delta, 25, 255, cv2.THRESH_BINARY)[1]
        motion_pixels = cv2.countNonZero(thresh)

        return motion_pixels > int(total_pixels * self._motion_ratio)

    def reset_camera(self, camera_id: str) -> None:
        """Drop the previous-frame cache for a camera (e.g. on disconnect)."""
        self._prev_gray.pop(camera_id, None)


# ---- Object Detection + Tracking ----

class ObjectDetector:
    """YOLOv8-based object detector with ByteTrack tracking and ONNX support."""

    def __init__(self) -> None:
        self._model = None
        self._loaded = False

    def _load_model(self, model_name: str = 'yolov8n') -> None:
        if self._loaded:
            return
        try:
            from ultralytics import YOLO

            # Prefer ONNX model if available (2-4x faster on CPU)
            onnx_path = f'{model_name}.onnx'
            pt_path = f'{model_name}.pt'

            import os
            if os.path.exists(onnx_path):
                self._model = YOLO(onnx_path, task='detect')
                logger.info('YOLOv8 ONNX model loaded: %s (fast mode)', onnx_path)
            else:
                self._model = YOLO(pt_path)
                logger.info('YOLOv8 PyTorch model loaded: %s', pt_path)

            self._loaded = True
        except Exception as exc:
            logger.error('Failed to load YOLOv8 model: %s', exc)
            self._model = None

    def detect(self, frame: np.ndarray, model_name: str = 'yolov8n',
               confidence_threshold: float = 0.4) -> list[dict[str, Any]]:
        """Run object detection on a frame.

        Returns list of {label, confidence, bbox: [x, y, w, h], class_id}.
        """
        self._load_model(model_name)
        if self._model is None:
            return []

        try:
            results = self._model(frame, verbose=False, conf=confidence_threshold,
                                   imgsz=320)  # smaller input = much faster
            detections: list[dict[str, Any]] = []

            for result in results:
                boxes = result.boxes
                if boxes is None:
                    continue

                for i in range(len(boxes)):
                    class_id = int(boxes.cls[i].item())
                    confidence = float(boxes.conf[i].item())

                    # Only include surveillance-relevant classes
                    if class_id not in SURVEILLANCE_CLASSES:
                        continue

                    x1, y1, x2, y2 = boxes.xyxy[i].tolist()
                    detections.append({
                        'label': SURVEILLANCE_CLASSES[class_id],
                        'confidence': round(confidence, 3),
                        'bbox': [
                            round(x1), round(y1),
                            round(x2 - x1), round(y2 - y1),
                        ],
                        'class_id': class_id,
                    })

            return detections
        except Exception as exc:
            logger.error('YOLOv8 detection error: %s', exc)
            return []

    def track(self, frame: np.ndarray, model_name: str = 'yolov8n',
              confidence_threshold: float = 0.4) -> list[dict[str, Any]]:
        """Run object detection + ByteTrack tracking on a frame.

        Returns list of {label, confidence, bbox, class_id, track_id}.
        track_id persists across frames for the same object.
        """
        self._load_model(model_name)
        if self._model is None:
            return []

        try:
            results = self._model.track(
                frame, verbose=False, conf=confidence_threshold,
                imgsz=320, persist=True, tracker='bytetrack.yaml',
            )
            detections: list[dict[str, Any]] = []

            for result in results:
                boxes = result.boxes
                if boxes is None:
                    continue

                for i in range(len(boxes)):
                    class_id = int(boxes.cls[i].item())
                    confidence = float(boxes.conf[i].item())

                    if class_id not in SURVEILLANCE_CLASSES:
                        continue

                    x1, y1, x2, y2 = boxes.xyxy[i].tolist()

                    # Get track ID if available
                    track_id = None
                    if boxes.id is not None:
                        track_id = int(boxes.id[i].item())

                    detections.append({
                        'label': SURVEILLANCE_CLASSES[class_id],
                        'confidence': round(confidence, 3),
                        'bbox': [
                            round(x1), round(y1),
                            round(x2 - x1), round(y2 - y1),
                        ],
                        'class_id': class_id,
                        'track_id': track_id,
                    })

            return detections
        except Exception as exc:
            logger.error('YOLOv8 tracking error: %s', exc)
            # Fallback to basic detection
            return self.detect(frame, model_name, confidence_threshold)


class PoseDetector:
    """MediaPipe pose detector with one instance per camera.

    # FIX: BUG-01 — MediaPipe's BlazePose with static_image_mode=False keeps an
    # internal tracking ROI across calls. A singleton shared across cameras locks
    # onto whichever camera's frame it saw first, causing the second-opened
    # camera to be permanently starved. We give each camera its own Pose instance
    # and its own lock so the two cameras can run in parallel without polluting
    # each other's tracker state.
    #
    # FIX: BUG-08 — detection_confidence is now honored per-camera. If the
    # threshold changes at runtime we rebuild that camera's instance lazily.
    """

    # Keep model_complexity=1 (balanced). Do not swap model per plan rule 6.
    _MODEL_COMPLEXITY = 1

    def __init__(self) -> None:
        # Per-camera MediaPipe Pose instance + its creation threshold.
        self._instances: dict[str, tuple[Any, float]] = {}
        # Per-camera lock so two frames from the same camera serialize, but
        # different cameras run concurrently on the thread pool.
        self._locks: dict[str, threading.Lock] = {}
        # Guards mutation of _instances / _locks.
        self._guard = threading.Lock()

    def _get_pose(self, camera_id: str, detection_confidence: float) -> tuple[Any, threading.Lock] | tuple[None, None]:
        """Return (Pose, lock) for the camera, rebuilding if threshold changed."""
        try:
            import mediapipe as mp
        except Exception as exc:  # pragma: no cover
            logger.error('Failed to import mediapipe: %s', exc)
            return None, None

        with self._guard:
            existing = self._instances.get(camera_id)
            if existing is not None:
                pose_obj, prev_threshold = existing
                # Rebuild if the confidence threshold materially changed.
                if abs(prev_threshold - detection_confidence) < 0.01:
                    return pose_obj, self._locks[camera_id]
                # Close old instance before replacing to free native resources.
                try:
                    pose_obj.close()
                except Exception:  # pragma: no cover
                    pass

            try:
                pose_obj = mp.solutions.pose.Pose(
                    static_image_mode=False,
                    model_complexity=self._MODEL_COMPLEXITY,
                    enable_segmentation=False,
                    smooth_landmarks=True,
                    min_detection_confidence=detection_confidence,
                    min_tracking_confidence=detection_confidence,
                )
            except Exception as exc:
                logger.error('Failed to load MediaPipe Pose for %s: %s', camera_id, exc)
                return None, None

            self._instances[camera_id] = (pose_obj, detection_confidence)
            if camera_id not in self._locks:
                self._locks[camera_id] = threading.Lock()
            logger.info('MediaPipe Pose instance ready for %s (conf=%.2f)', camera_id, detection_confidence)
            return pose_obj, self._locks[camera_id]

    def reset_camera(self, camera_id: str) -> None:
        """Release the MediaPipe instance for a camera (e.g. on disconnect)."""
        with self._guard:
            existing = self._instances.pop(camera_id, None)
            self._locks.pop(camera_id, None)
        if existing is not None:
            try:
                existing[0].close()
            except Exception:  # pragma: no cover
                pass

    def detect_pose(self, frame: np.ndarray, camera_id: str = 'default',
                    detection_confidence: float = 0.5) -> list[dict[str, Any]]:
        """Detect one full-frame human pose for the given camera.

        MediaPipe Pose is single-person. Running it on the full AI frame avoids
        requiring an object detector just to produce a visible skeleton overlay.
        """
        pose_obj, lock = self._get_pose(camera_id, detection_confidence)
        if pose_obj is None or lock is None:
            return []

        try:
            frame_h, frame_w = frame.shape[:2]
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            with lock:
                result = pose_obj.process(rgb_frame)

            if not result.pose_landmarks:
                return []

            keypoints = []
            for idx, lm in enumerate(result.pose_landmarks.landmark):
                name = POSE_LANDMARK_NAMES[idx] if idx < len(POSE_LANDMARK_NAMES) else f'point_{idx}'
                keypoints.append({
                    'x': round(lm.x * frame_w, 1),
                    'y': round(lm.y * frame_h, 1),
                    'visibility': round(lm.visibility, 3),
                    'name': name,
                })
            return keypoints
        except Exception as exc:
            logger.error('Pose detection error (cam=%s): %s', camera_id, exc)
            return []

    def detect_poses(self, frame: np.ndarray,
                     person_bboxes: list[dict[str, Any]],
                     camera_id: str = 'default',
                     detection_confidence: float = 0.5) -> list[list[dict[str, Any]]]:
        """Detect pose landmarks for each person bounding box.

        Returns list of pose results, each containing keypoints list.
        Each keypoint: {x, y, visibility, name}.
        Coordinates are absolute pixel values in the original frame.
        """
        pose_obj, lock = self._get_pose(camera_id, detection_confidence)
        if pose_obj is None or lock is None:
            return []

        all_poses: list[list[dict[str, Any]]] = []
        frame_h, frame_w = frame.shape[:2]

        for person in person_bboxes:
            bx, by, bw, bh = person['bbox']
            # Add padding around the person crop
            pad = 20
            x1 = max(0, int(bx) - pad)
            y1 = max(0, int(by) - pad)
            x2 = min(frame_w, int(bx + bw) + pad)
            y2 = min(frame_h, int(by + bh) + pad)

            crop = frame[y1:y2, x1:x2]
            if crop.size == 0:
                all_poses.append([])
                continue

            try:
                rgb_crop = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
                with lock:
                    result = pose_obj.process(rgb_crop)

                if result.pose_landmarks:
                    crop_h, crop_w = crop.shape[:2]
                    keypoints = []
                    for idx, lm in enumerate(result.pose_landmarks.landmark):
                        name = POSE_LANDMARK_NAMES[idx] if idx < len(POSE_LANDMARK_NAMES) else f'point_{idx}'
                        keypoints.append({
                            'x': round(x1 + lm.x * crop_w, 1),
                            'y': round(y1 + lm.y * crop_h, 1),
                            'visibility': round(lm.visibility, 3),
                            'name': name,
                        })
                    all_poses.append(keypoints)
                else:
                    all_poses.append([])
            except Exception as exc:
                logger.error('Pose detection error (cam=%s): %s', camera_id, exc)
                all_poses.append([])

        return all_poses


# Module-level singletons
object_detector = ObjectDetector()
pose_detector = PoseDetector()
motion_detector = MotionDetector()
