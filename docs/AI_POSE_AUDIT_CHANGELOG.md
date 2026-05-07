# AI Pose Estimation Audit Changelog

Date: 2026-05-02

## Phase 1 Diagnostic Summary

The current system sends browser-captured camera frames to the backend over `/ws/ai/camera/{camera_id}`. The backend decodes the frame, runs MediaPipe Pose on the full AI frame, smooths the keypoints, and returns skeleton coordinates to the React dashboard.

No sample video, production logs, GPU/CPU telemetry, or camera hardware specs were available in the repo, so true FPS, end-to-end latency, utilization, and pose accuracy remain unmeasured.

## Root Causes Fixed

| Severity | Issue | Root cause | Impact |
| --- | --- | --- | --- |
| Critical | Pose and box overlays were misaligned on high-resolution video | Backend returned coordinates in the downscaled AI frame, while frontend scaled them against native LiveKit video dimensions | Severe overlay drift; about 56% undersized coordinates on 1080p input captured at 480p |
| High | UI thread stalls during AI capture | Frontend used `canvas.toDataURL()` and base64 WebSocket text payloads | Extra encode cost and about 33% payload bloat before inference |
| High | Latency growth under load | Frontend sent frames at a fixed interval without waiting for inference responses | WebSocket/browser queues could accumulate stale frames |
| High | Multi-camera MediaPipe instability risk | A single global MediaPipe Pose object was callable from multiple camera threads | Possible intermittent pose failures or corrupted tracker state |
| Medium | AI controls did not fully apply | Backend settings schema omitted frontend-exposed toggles | Tracking, enhancement, and motion-gate controls could be ignored |
| Medium | Skeleton jitter | Raw keypoints were returned frame-to-frame without temporal filtering | Visible flicker, especially with low confidence joints |
| Medium | Missing pipeline observability | Only total `processing_ms` was returned | No stage-level evidence for bottleneck analysis |

## Implemented Changes

- Added binary JPEG WebSocket frame support while preserving legacy base64 text compatibility.
- Added frontend capture backpressure: one in-flight AI frame per camera.
- Replaced blocking `toDataURL()` capture with async `canvas.toBlob()`.
- Added `frame_width` and `frame_height` to AI results and frontend scaling logic.
- Added confidence-aware EMA pose smoothing with low-confidence keypoint interpolation.
- Added a MediaPipe process lock around the shared pose model.
- Added per-stage timing metrics for the active pose path: decode, motion, enhancement, and pose.
- Added processed AI FPS reporting per camera.
- Expanded AI settings schema so frontend toggles persist to the backend.
- Added backend tests for pose smoothing and frame decoding.

## Pose-Only Conversion

- Converted the live AI WebSocket pipeline to full-frame MediaPipe Pose only.
- Stopped executing YOLO object detection, DeepFace recognition, behavior alerts, and event descriptions during live monitoring.
- Kept legacy response arrays (`detections`, `faces`, `alerts`, `descriptions`) empty for frontend/API compatibility.
- Simplified the dashboard controls around pose estimation, frame rate, night enhancement, motion gating, and keypoint confidence.
- Removed object and face bounding-box drawing from the live overlay so the camera view focuses on colored skeleton lines and joint dots.

## Validation

- Frontend production build: passed with `npm run build`.
- Python syntax compile for changed backend modules: passed with `python -m py_compile`.
- Pose smoothing tests: passed, 3 tests.
- Full backend pytest: not completed in the local host Python because required dependencies were not installed (`PyJWT`, OpenCV). Run inside the backend Docker image or after `pip install -r requirements.txt`.

## Remaining Work

- Run a benchmark with representative CCTV clips: single person, multiple people, partial occlusion, low light, and empty scene.
- Measure end-to-end latency from browser capture to overlay paint, not just backend processing time.
- Add CPU, memory, and GPU telemetry via Prometheus/OpenTelemetry or container metrics.
- Separate object tracking state per camera or move inference into per-camera workers.
- Consider YOLOv8-pose or RTMP/RTSP ingest-side inference for production deployments where browser frame capture is insufficient.
- Add stress validation for 8 simultaneous cameras and 24-hour soak testing.
