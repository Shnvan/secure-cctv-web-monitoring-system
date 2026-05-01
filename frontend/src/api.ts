export type Camera = {
  id: string;
  name: string;
  room: string;
  status: string;
  enabled: boolean;
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
