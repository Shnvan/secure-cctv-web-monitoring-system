FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# System dependencies for OpenCV and MediaPipe
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0t64 \
    libsm6 \
    libxrender1 \
    libxext6 \
    && rm -rf /var/lib/apt/lists/*

# Create app user with a real writable home directory
RUN addgroup --system app && adduser --system --ingroup app --home /home/app app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download YOLOv8n model and export to ONNX for 2-4x faster CPU inference
RUN pip install --no-cache-dir onnx onnxscript onnxslim && \
    python -c "\
from ultralytics import YOLO; \
m = YOLO('yolov8n.pt'); \
m.export(format='onnx', imgsz=320, simplify=True); \
" && chown app:app /app/yolov8n.pt /app/yolov8n.onnx

COPY app ./app

# Create writable directories for AI model caches and known faces
RUN mkdir -p /app/known_faces /home/app/.deepface /home/app/.mediapipe \
    && chown -R app:app /app/known_faces /home/app

# Set HOME so DeepFace/mediapipe can write to ~/.deepface and ~/.mediapipe
ENV HOME=/home/app

USER app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
