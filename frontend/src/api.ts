export type Camera = {
  id: string;
  name: string;
  room: string;
  status: string;
  enabled: boolean;
};

export type KnownFace = {
  name: string;
  folder_name: string;
  image_count: number;
};

export type AISettingsData = {
  enabled: boolean;
  fps: number;
  pose_enabled: boolean;
  enhancement_enabled: boolean;
  motion_gating: boolean;
  // FIX: BUG-08 — backend MediaPipe detection threshold.
  detection_confidence: number;
  // Legacy alias — kept so existing saved state still loads.
  confidence_threshold: number;
  // Frontend-only visibility filter for the overlay renderer. Not sent to backend.
  display_min_visibility?: number;
};

export type AIDetection = {
  label: string;
  confidence: number;
  bbox: number[];
  class_id: number;
  track_id?: number | null;
};

export type AIPoseKeypoint = {
  x: number;
  y: number;
  visibility: number;
  name: string;
  interpolated?: boolean;
};

export type AIFaceResult = {
  bbox: number[];
  name: string;
  confidence: number;
  is_known: boolean;
};

export type AIBehaviorAlert = {
  alert_type: string;
  severity: string;
  camera_id: string;
  description: string;
  timestamp: number;
};

export type AIFrameResult = {
  detections: AIDetection[];
  poses: AIPoseKeypoint[][];
  pose_classifications?: Array<{
    activity: string;
    label: string;
    confidence: number;
    angles?: Record<string, number>;
    details?: string;
  }>;
  faces: AIFaceResult[];
  alerts: AIBehaviorAlert[];
  descriptions: string[];
  pose_connections: number[][];
  timestamp: number;
  camera_id: string;
  processing_ms: number;
  frame_width: number;
  frame_height: number;
  timings_ms?: Record<string, number>;
  ai_fps?: number;
  person_count?: number;
  model?: string;
  motion?: boolean;
  skipped?: boolean;
  error?: string;
};

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'include' });
  if (!res.ok) throw new Error('Request failed');
  return res.json();
}

export async function requestToken(cameraId: string, purpose: 'view' | 'publish') {
  const suffix = purpose === 'view' ? 'stream-token' : 'publish-token';
  const res = await fetch(`/api/v1/cameras/${encodeURIComponent(cameraId)}/${suffix}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ purpose }),
  });
  if (!res.ok) throw new Error('Access denied or stream unavailable');
  return res.json() as Promise<{camera_id: string; room: string; token: string; expires_in_seconds: number}>;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

// --- AI API Helpers ---

export function connectAIWebSocket(cameraId: string): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${protocol}://${window.location.host}/ws/ai/camera/${encodeURIComponent(cameraId)}`;
  return new WebSocket(url);
}

export async function getKnownFaces(): Promise<KnownFace[]> {
  return apiGet<KnownFace[]>('/api/v1/ai/known-faces');
}

export async function uploadKnownFace(name: string, file: File): Promise<unknown> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`/api/v1/ai/known-faces?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}

export async function deleteKnownFace(name: string): Promise<unknown> {
  return apiDelete(`/api/v1/ai/known-faces/${encodeURIComponent(name)}`);
}

export async function getAISettings(): Promise<AISettingsData> {
  return apiGet<AISettingsData>('/api/v1/ai/settings');
}

export async function updateAISettings(settings: AISettingsData): Promise<AISettingsData> {
  // display_min_visibility is a frontend-only render filter; backend ignores it.
  const { display_min_visibility: _omit, ...serverFields } = settings;
  return apiPost<AISettingsData>('/api/v1/ai/settings', serverFields);
}
