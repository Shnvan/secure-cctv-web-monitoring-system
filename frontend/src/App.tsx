import { Component, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import {
  LocalVideoTrack,
  RemoteTrack,
  Room,
  RoomEvent,
  VideoPresets,
  createLocalVideoTrack
} from 'livekit-client';
import { apiGet, apiPost, apiDelete, requestToken, Camera, connectAIWebSocket, getKnownFaces, uploadKnownFace, deleteKnownFace, getAISettings, updateAISettings, type AIFrameResult, type AISettingsData, type KnownFace } from './api';

const livekitUrl =
  import.meta.env.VITE_LIVEKIT_URL ||
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/livekit`;

type ShellProps = {
  activePath: string;
  children: ReactNode;
  sidebarAction?: ReactNode;
};

type AuthenticatedUser = {
  id: string;
  email: string;
  roles?: string[];
  camera_grants?: Record<string, string[]>;
};

type AuditEvent = {
  id: string;
  occurred_at: string;
  actor_email: string | null;
  actor_roles: string[];
  action: string;
  target_type: string | null;
  target_id: string | null;
  result: string;
  reason_code: string | null;
  source_ip: string | null;
  user_agent_hash: string | null;
  request_id: string | null;
  metadata: Record<string, unknown>;
  previous_hash: string | null;
  event_hash: string;
};

type AdminUser = {
  id: string;
  email: string;
  roles: string[];
  camera_grants: Record<string, string[]>;
  status: string;
};

type CameraLiveStatus =
  | 'offline'
  | 'connecting'
  | 'waiting'
  | 'live'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

type AuditResultFilter = 'all' | 'success' | 'denied' | 'failure';

type ErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: ''
  };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Unexpected dashboard error'
    };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error('Dashboard render failed:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="web-dashboard">
          <section className="dashboard-main">
            <section className="admin-card">
              <div className="card-title">Dashboard error</div>
              <p>The live dashboard hit a recoverable display error.</p>
              <StatusMessage>{this.state.message}</StatusMessage>
              <div className="button-row">
                <button className="btn-primary" onClick={() => window.location.reload()}>
                  Reload dashboard
                </button>
              </div>
            </section>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

function getCameraVideoMount(cameraId: string) {
  return document.getElementById(`video-mount-${cameraId}`);
}

function clearCameraVideoMount(cameraId: string) {
  getCameraVideoMount(cameraId)?.replaceChildren();
}

function getPublisherVideoMount() {
  return document.getElementById('publisher-video-mount');
}

function clearPublisherVideoMount() {
  getPublisherVideoMount()?.replaceChildren();
}

function AppShell({ activePath, children, sidebarAction }: ShellProps) {
  const sidebarItemClass = (path: string) =>
    activePath === path ? 'app-sidebar-item active' : 'app-sidebar-item';

  return (
    <main className="web-dashboard">
      <header className="app-navbar">
        <a className="app-brand" href="/">
          <div className="brand-mark">CCTV</div>
          <div>
            <h1>Secure CCTV Monitor</h1>
            <p>Private live monitoring for authorized users only</p>
          </div>
        </a>

        <nav className="top-nav" aria-label="Primary navigation">
          <a className={activePath === '/' ? 'active' : ''} href="/">
            Dashboard
          </a>
          <a className={activePath === '/demo' ? 'active' : ''} href="/demo">
            Demo
          </a>
          <a className={activePath === '/admin/security' ? 'active' : ''} href="/admin/security">
            Security
          </a>
          <a className={activePath === '/admin/audit-logs' ? 'active' : ''} href="/admin/audit-logs">
            Audit Logs
          </a>
          <a className={activePath === '/admin/users' ? 'active' : ''} href="/admin/users">
            Users
          </a>
          <a
            className={activePath === '/admin/security-test' ? 'active' : ''}
            href="/admin/security-test"
          >
            Security Test
          </a>
        </nav>
      </header>

      <section className="dashboard-layout">
        <aside className="app-sidebar">
          <div className="sidebar-label">Monitoring</div>

          <a className={sidebarItemClass('/')} href="/">
            <span className="sidebar-dot dot-cyan" />
            All cameras
          </a>

          {sidebarAction}

          <a className={sidebarItemClass('/demo')} href="/demo">
            <span className="sidebar-dot dot-cyan" />
            Demo mode
          </a>

          <a className={sidebarItemClass('/publisher')} href="/publisher?camera=camera-1">
            <span className="sidebar-dot dot-green" />
            Publisher
          </a>

          <a className={sidebarItemClass('/admin/audit-logs')} href="/admin/audit-logs">
            <span className="sidebar-dot dot-red" />
            Event log
          </a>

          <div className="sidebar-divider" />

          <div className="sidebar-label">Administration</div>

          <a className={sidebarItemClass('/admin/security')} href="/admin/security">
            <span className="sidebar-dot dot-cyan" />
            Security
          </a>

          <a className={sidebarItemClass('/admin/users')} href="/admin/users">
            <span className="sidebar-dot dot-green" />
            Users
          </a>

          <a className={sidebarItemClass('/admin/security-test')} href="/admin/security-test">
            <span className="sidebar-dot dot-red" />
            Test denial
          </a>
        </aside>

        <section className="dashboard-main">{children}</section>
      </section>
    </main>
  );
}

function PageHeader({
  kicker,
  title,
  subtitle,
  actions
}: {
  kicker: string;
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <div className="page-kicker">{kicker}</div>
        <h2 className="page-title">{title}</h2>
        <p className="page-subtitle">{subtitle}</p>
      </div>

      {actions && <div className="header-actions">{actions}</div>}
    </header>
  );
}

function StatusMessage({ children }: { children: ReactNode }) {
  return <div className="status-message">{children}</div>;
}

function RoleBadges({ roles }: { roles?: string[] }) {
  if (!roles || roles.length === 0) {
    return <span className="badge badge-offline">none</span>;
  }

  return (
    <span className="badge-list">
      {roles.map((role) => (
        <span className="badge badge-info" key={role}>
          {role}
        </span>
      ))}
    </span>
  );
}

function PermissionBadges({ permissions }: { permissions: string[] }) {
  return (
    <span className="badge-list">
      {permissions.map((permission) => (
        <span className="badge badge-online" key={permission}>
          {permission}
        </span>
      ))}
    </span>
  );
}

function getCameraStatusBadgeClass(status: string) {
  switch (status) {
    case 'connecting':
      return 'badge badge-connecting';
    case 'waiting':
      return 'badge badge-waiting';
    case 'live':
      return 'badge badge-live';
    case 'reconnecting':
      return 'badge badge-reconnecting';
    case 'disconnected':
      return 'badge badge-disconnected';
    case 'error':
      return 'badge badge-error';
    case 'online':
      return 'badge badge-online';
    case 'offline':
    default:
      return 'badge badge-offline';
  }
}

function useCameraViewer() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [message, setMessage] = useState('');
  const [cameraStatuses, setCameraStatuses] = useState<Record<string, CameraLiveStatus>>({});
  const [cameraLastUpdated, setCameraLastUpdated] = useState<Record<string, string>>({});
  const [activeCameraIds, setActiveCameraIds] = useState<string[]>([]);
  const roomsRef = useRef<Record<string, Room>>({});
  const sessionIdsRef = useRef<Record<string, number>>({});
  const videoAttachedRef = useRef<Record<string, boolean>>({});
  const sessionCounterRef = useRef(0);

  useEffect(() => {
    apiGet<Camera[]>('/api/v1/cameras')
      .then(setCameras)
      .catch((err) => {
        console.error('Camera list failed:', err);
        setMessage('Access denied or unavailable');
      });

    return () => {
      sessionIdsRef.current = {};
      videoAttachedRef.current = {};
      Object.keys(roomsRef.current).forEach(clearCameraVideoMount);
      Object.values(roomsRef.current).forEach((room) => room.disconnect());
      roomsRef.current = {};
    };
  }, []);

  function setCameraStatus(cameraId: string, status: CameraLiveStatus) {
    setCameraStatuses((current) => ({ ...current, [cameraId]: status }));
    setCameraLastUpdated((current) => ({
      ...current,
      [cameraId]: new Date().toLocaleTimeString()
    }));
  }

  function getCameraStatus(camera: Camera) {
    return cameraStatuses[camera.id] || camera.status || 'offline';
  }

  function isCurrentSession(cameraId: string, sessionId: number) {
    return sessionIdsRef.current[cameraId] === sessionId;
  }

  async function viewCamera(camera: Camera) {
    const sessionId = sessionCounterRef.current + 1;
    sessionCounterRef.current = sessionId;
    sessionIdsRef.current[camera.id] = sessionId;
    videoAttachedRef.current[camera.id] = false;
    setActiveCameraIds((current) =>
      current.includes(camera.id) ? current : [...current, camera.id]
    );
    clearCameraVideoMount(camera.id);
    setCameraStatus(camera.id, 'connecting');

    try {
      setMessage(`Requesting view token for ${camera.name}...`);

      if (roomsRef.current[camera.id]) {
        roomsRef.current[camera.id].disconnect();
        delete roomsRef.current[camera.id];
      }

      const data = await requestToken(camera.id, 'view');

      const room = new Room();
      roomsRef.current[camera.id] = room;

      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (!isCurrentSession(camera.id, sessionId)) return;

        if (track.kind === 'video') {
          let attached = false;

          try {
            const el = track.attach();
            el.setAttribute('autoplay', 'true');
            el.setAttribute('playsinline', 'true');

            const mount = getCameraVideoMount(camera.id);
            if (mount) {
              mount.replaceChildren(el);
              videoAttachedRef.current[camera.id] = true;
              setCameraStatus(camera.id, 'live');
              attached = true;
            } else {
              videoAttachedRef.current[camera.id] = false;
              setCameraStatus(camera.id, 'error');
            }
          } catch (err) {
            console.error('Video attach failed:', err);
            videoAttachedRef.current[camera.id] = false;
            setCameraStatus(camera.id, 'error');
          }

          if (attached) {
            setMessage(`Live feed active: ${camera.name}`);
          }
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        if (!isCurrentSession(camera.id, sessionId)) return;

        if (track.kind === 'video') {
          track.detach().forEach((el) => el.remove());
          clearCameraVideoMount(camera.id);
          videoAttachedRef.current[camera.id] = false;
          setCameraStatus(camera.id, 'waiting');
          setMessage(`Video feed stopped. Waiting for ${camera.name}...`);
        }
      });

      room.on(RoomEvent.TrackSubscriptionFailed, () => {
        if (!isCurrentSession(camera.id, sessionId)) return;

        videoAttachedRef.current[camera.id] = false;
        setCameraStatus(camera.id, 'error');
        setMessage(`Video subscription failed: ${camera.name}`);
      });

      room.on(RoomEvent.Reconnecting, () => {
        if (!isCurrentSession(camera.id, sessionId)) return;

        setCameraStatus(camera.id, 'reconnecting');
        setMessage(`Reconnecting to ${camera.name}...`);
      });

      room.on(RoomEvent.Reconnected, () => {
        if (!isCurrentSession(camera.id, sessionId)) return;

        setCameraStatus(camera.id, videoAttachedRef.current[camera.id] ? 'live' : 'waiting');
        setMessage(`Reconnected to ${camera.name}.`);
      });

      room.on(RoomEvent.Disconnected, () => {
        if (!isCurrentSession(camera.id, sessionId)) return;

        videoAttachedRef.current[camera.id] = false;
        clearCameraVideoMount(camera.id);
        setActiveCameraIds((current) => current.filter((id) => id !== camera.id));
        setCameraStatus(camera.id, 'disconnected');
        setMessage(`Disconnected from ${camera.name}`);
      });

      setMessage(`Connecting to ${camera.name}...`);
      await room.connect(livekitUrl, data.token);

      if (!isCurrentSession(camera.id, sessionId)) return;

      setCameraStatus(camera.id, 'waiting');
      setMessage(`Connected to ${camera.name}. Waiting for camera feed...`);
    } catch (err) {
      console.error('View camera failed:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (isCurrentSession(camera.id, sessionId)) {
        videoAttachedRef.current[camera.id] = false;
        clearCameraVideoMount(camera.id);
        setActiveCameraIds((current) => current.filter((id) => id !== camera.id));
        setCameraStatus(camera.id, 'error');
      }
      setMessage(`Viewer failed: ${errorMessage}`);
    }
  }

  async function viewAllCameras() {
    setMessage('Connecting to all available cameras...');

    await Promise.allSettled(cameras.map((camera) => viewCamera(camera)));
  }

  return {
    cameras,
    message,
    cameraLastUpdated,
    activeCameraIds,
    getCameraStatus,
    viewCamera,
    viewAllCameras
  };
}

// ---- AI Detection Hook ----

type SmartEvent = {
  id: string;
  text: string;
  severity: 'normal' | 'warning' | 'critical';
  timestamp: number;
  type: 'detection' | 'face' | 'alert';
};

function useAIDetection(cameraId: string, enabled: boolean, fps: number) {
  const [result, setResult] = useState<AIFrameResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [smartEvents, setSmartEvents] = useState<SmartEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inFlightRef = useRef(false);

  function addSmartEvents(descriptions: string[]) {
    if (descriptions.length === 0) return;

    const newEvents: SmartEvent[] = descriptions.map((text, i) => {
      let severity: SmartEvent['severity'] = 'normal';
      let type: SmartEvent['type'] = 'detection';
      if (text.includes('ðŸš¨') || text.includes('FIGHTING') || text.includes('FALL')) {
        severity = 'critical';
        type = 'alert';
      } else if (text.includes('âš ï¸') || text.includes('loitering') || text.includes('unavailable')) {
        severity = 'warning';
        type = 'alert';
      } else if (text.includes('Known person') || text.includes('Unknown person')) {
        type = 'face';
      }
      return { id: `${Date.now()}-${i}`, text, severity, timestamp: Date.now(), type };
    });

    setSmartEvents((prev) => [...newEvents, ...prev].slice(0, 100));
  }

  function normalizeAIResult(raw: Partial<AIFrameResult> | null | undefined): AIFrameResult {
    return {
      detections: Array.isArray(raw?.detections) ? raw.detections : [],
      poses: Array.isArray(raw?.poses) ? raw.poses.filter(Array.isArray) : [],
      pose_classifications: Array.isArray(raw?.pose_classifications) ? raw.pose_classifications : [],
      faces: Array.isArray(raw?.faces) ? raw.faces : [],
      alerts: Array.isArray(raw?.alerts) ? raw.alerts : [],
      descriptions: Array.isArray(raw?.descriptions)
        ? raw.descriptions.filter((text): text is string => typeof text === 'string')
        : [],
      pose_connections: Array.isArray(raw?.pose_connections) ? raw.pose_connections : [],
      timestamp: typeof raw?.timestamp === 'number' ? raw.timestamp : Date.now() / 1000,
      camera_id: typeof raw?.camera_id === 'string' && raw.camera_id ? raw.camera_id : cameraId,
      processing_ms: typeof raw?.processing_ms === 'number' ? raw.processing_ms : 0,
      frame_width: typeof raw?.frame_width === 'number' ? raw.frame_width : 0,
      frame_height: typeof raw?.frame_height === 'number' ? raw.frame_height : 0,
      timings_ms: raw?.timings_ms && typeof raw.timings_ms === 'object' ? raw.timings_ms : {},
      ai_fps: typeof raw?.ai_fps === 'number' ? raw.ai_fps : 0,
      person_count: typeof raw?.person_count === 'number' ? raw.person_count : 0,
      model: typeof raw?.model === 'string' ? raw.model : undefined,
      motion: typeof raw?.motion === 'boolean' ? raw.motion : undefined,
      skipped: raw?.skipped === true,
      error: typeof raw?.error === 'string' ? raw.error : undefined
    };
  }

  useEffect(() => {
    if (!enabled || !cameraId) {
      setIsProcessing(false);
      setErrorMessage('');
      return;
    }

    const ws = connectAIWebSocket(cameraId);
    wsRef.current = ws;
    setErrorMessage('');
    inFlightRef.current = false;

    ws.onopen = () => {
      setIsProcessing(true);
      // Start capturing frames — reuse a single offscreen canvas
      const offscreen = document.createElement('canvas');
      const MAX_HEIGHT = 480; // downscale to 480p for speed
      // FIX: BUG-07 — internal clamp bumped 10 → 30 so the slider's new max
      // actually reaches the capture loop.
      const targetFps = Math.max(1, Math.min(30, Math.round(fps || 15)));
      const frameIntervalMs = 1000 / targetFps;
      // FIX: BUG-09 — if a frame is in flight longer than this, we assume the
      // server response was lost / dropped and reset inFlight so capture resumes.
      const INFLIGHT_WATCHDOG_MS = 2000;
      let lastCaptureAt = 0;
      let inFlightSince = 0;
      let capturePending = false;

      const captureLoop = (now: number) => {
        try {
          if (ws.readyState !== WebSocket.OPEN) {
            animationFrameRef.current = window.requestAnimationFrame(captureLoop);
            return;
          }

          // FIX: BUG-09 — watchdog: release inFlight if the server never answered.
          if (inFlightRef.current && inFlightSince > 0 && now - inFlightSince > INFLIGHT_WATCHDOG_MS) {
            console.warn('[ai] inflight watchdog fired for', cameraId);
            inFlightRef.current = false;
            inFlightSince = 0;
          }

          if (now - lastCaptureAt < frameIntervalMs || inFlightRef.current || capturePending) {
            animationFrameRef.current = window.requestAnimationFrame(captureLoop);
            return;
          }

          const videoEl = document.querySelector(
            `#video-mount-${cameraId} video`
          ) as HTMLVideoElement | null;

          if (!videoEl || videoEl.videoWidth === 0 || videoEl.videoHeight === 0) {
            animationFrameRef.current = window.requestAnimationFrame(captureLoop);
            return;
          }

          // Downscale to max 480p height, preserving aspect ratio
          const scale = Math.min(1, MAX_HEIGHT / videoEl.videoHeight);
          const w = Math.max(1, Math.round(videoEl.videoWidth * scale));
          const h = Math.max(1, Math.round(videoEl.videoHeight * scale));
          offscreen.width = w;
          offscreen.height = h;
          const ctx = offscreen.getContext('2d');
          if (!ctx) {
            animationFrameRef.current = window.requestAnimationFrame(captureLoop);
            return;
          }
          ctx.drawImage(videoEl, 0, 0, w, h);
          capturePending = true;
          lastCaptureAt = now;
          offscreen.toBlob((blob) => {
            capturePending = false;
            if (!blob || ws.readyState !== WebSocket.OPEN || inFlightRef.current) return;
            inFlightRef.current = true;
            inFlightSince = performance.now();
            ws.send(blob);
          }, 'image/jpeg', 0.45);
        } catch (err) {
          console.error('AI frame capture failed:', err);
          setErrorMessage('AI frame capture failed.');
        }
        animationFrameRef.current = window.requestAnimationFrame(captureLoop);
      };

      animationFrameRef.current = window.requestAnimationFrame(captureLoop);
    };

    ws.onmessage = (event) => {
      try {
        inFlightRef.current = false;
        const data = normalizeAIResult(JSON.parse(event.data));
        if (data.skipped) return;

        if (data.error) {
          const message = `AI unavailable: ${data.error}`;
          setErrorMessage(message);
          addSmartEvents([message]);
          return;
        }

        setErrorMessage('');
        if (!data.skipped) {
          setResult(data);

          // Add smart event descriptions
          if (data.descriptions && data.descriptions.length > 0) {
            const newEvents: SmartEvent[] = data.descriptions.map((text, i) => {
              let severity: SmartEvent['severity'] = 'normal';
              let type: SmartEvent['type'] = 'detection';
              if (text.includes('🚨') || text.includes('FIGHTING') || text.includes('FALL')) {
                severity = 'critical';
                type = 'alert';
              } else if (text.includes('⚠️') || text.includes('loitering')) {
                severity = 'warning';
                type = 'alert';
              } else if (text.includes('Known person') || text.includes('Unknown person')) {
                type = 'face';
              }
              return { id: `${Date.now()}-${i}`, text, severity, timestamp: Date.now(), type };
            });
            setSmartEvents(prev => [...newEvents, ...prev].slice(0, 100));
          }
        }
      } catch (err) {
        console.error('AI result parse failed:', err);
        setErrorMessage('AI result parse failed.');
      }
    };

    ws.onclose = () => {
      inFlightRef.current = false;
      setIsProcessing(false);
    };
    ws.onerror = () => {
      inFlightRef.current = false;
      setIsProcessing(false);
      setErrorMessage('AI connection unavailable.');
    };

    return () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = null;
      inFlightRef.current = false;
      ws.close();
      wsRef.current = null;
      setIsProcessing(false);
      setErrorMessage('');
    };
  }, [cameraId, enabled, fps]);

  return { result, isProcessing, errorMessage, smartEvents, canvasRef };
}

// ---- AI Overlay Canvas ----

// Limb groups with colors for enhanced skeleton rendering
const POSE_LIMB_GROUPS = [
  // Torso — yellow
  { connections: [[11, 12], [11, 23], [12, 24], [23, 24]], color: '#fbbf24', width: 3 },
  // Left arm — orange
  { connections: [[11, 13], [13, 15]], color: '#f97316', width: 3 },
  // Right arm — orange
  { connections: [[12, 14], [14, 16]], color: '#f97316', width: 3 },
  // Left leg — cyan
  { connections: [[23, 25], [25, 27]], color: '#22d3ee', width: 3 },
  // Right leg — cyan
  { connections: [[24, 26], [26, 28]], color: '#22d3ee', width: 3 },
];

// Activity label colors
const ACTIVITY_COLORS: Record<string, string> = {
  STANDING: '#4ade80',
  SITTING: '#60a5fa',
  LYING_DOWN: '#fbbf24',
  CROUCHING: '#a78bfa',
  ARMS_RAISED: '#f472b6',
  RUNNING: '#34d399',
  FALL: '#ef4444',
  FIGHTING: '#ef4444',
  UNKNOWN: '#94a3b8',
};

// FIX: BUG-02 — compute the actual painted content rectangle for a video
// element rendered with `object-fit: contain`, so overlay coordinates align
// with the pixels the user actually sees (not the letterbox bars).
function computeContentRect(videoEl: HTMLVideoElement) {
  const boxW = videoEl.clientWidth;
  const boxH = videoEl.clientHeight;
  const vw = videoEl.videoWidth;
  const vh = videoEl.videoHeight;
  if (boxW === 0 || boxH === 0 || vw === 0 || vh === 0) {
    return { offsetX: 0, offsetY: 0, contentW: boxW, contentH: boxH };
  }
  const videoAR = vw / vh;
  const boxAR = boxW / boxH;
  if (videoAR > boxAR) {
    // letterbox: black bars top+bottom
    const contentW = boxW;
    const contentH = contentW / videoAR;
    return { offsetX: 0, offsetY: (boxH - contentH) / 2, contentW, contentH };
  }
  // pillarbox: black bars left+right
  const contentH = boxH;
  const contentW = contentH * videoAR;
  return { offsetX: (boxW - contentW) / 2, offsetY: 0, contentW, contentH };
}

function AIOverlayCanvas({
  cameraId,
  aiResult,
  displayMinVisibility
}: {
  cameraId: string;
  aiResult: AIFrameResult | null;
  displayMinVisibility: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!aiResult || !canvasRef.current) return;

    try {
    const canvas = canvasRef.current;
    const container = getCameraVideoMount(cameraId);
    const videoEl = container?.querySelector('video') as HTMLVideoElement | null;

    if (!videoEl || videoEl.videoWidth === 0 || videoEl.videoHeight === 0) return;

    // FIX: BUG-12 — render at devicePixelRatio so skeleton lines stay crisp
    // on HiDPI screens (previously aliased/soft).
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cssW = videoEl.clientWidth;
    const cssH = videoEl.clientHeight;
    if (cssW === 0 || cssH === 0) return;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    // FIX: BUG-02 — map AI-frame pixel coords into the actual video content
    // rect (ignoring letterbox bars). Without this the skeleton drifts into
    // the black side-bars and appears to "float" off the body.
    const rect = computeContentRect(videoEl);
    const sourceWidth = aiResult.frame_width || videoEl.videoWidth;
    const sourceHeight = aiResult.frame_height || videoEl.videoHeight;
    if (sourceWidth === 0 || sourceHeight === 0) return;
    const scaleX = rect.contentW / sourceWidth;
    const scaleY = rect.contentH / sourceHeight;
    const toCanvasX = (x: number) => rect.offsetX + x * scaleX;
    const toCanvasY = (y: number) => rect.offsetY + y * scaleY;

    const poses = Array.isArray(aiResult.poses) ? aiResult.poses : [];

    // Draw enhanced pose skeletons with limb-specific colors
    for (let poseIdx = 0; poseIdx < poses.length; poseIdx++) {
      const pose = poses[poseIdx];
      if (!pose || pose.length === 0) continue;

      // Draw limb connections with group-specific colors
      for (const group of POSE_LIMB_GROUPS) {
        ctx.strokeStyle = group.color;
        ctx.lineWidth = group.width;
        ctx.lineCap = 'round';

        for (const [a, b] of group.connections) {
          if (a < pose.length && b < pose.length
            && pose[a].visibility > displayMinVisibility
            && pose[b].visibility > displayMinVisibility) {
            ctx.beginPath();
            ctx.moveTo(toCanvasX(pose[a].x), toCanvasY(pose[a].y));
            ctx.lineTo(toCanvasX(pose[b].x), toCanvasY(pose[b].y));
            ctx.stroke();
          }
        }
      }

      // Draw joint dots with confidence-scaled radius (Phase 3 heatmap-lite).
      for (const kp of pose) {
        if (kp.visibility > displayMinVisibility) {
          const px = toCanvasX(kp.x);
          const py = toCanvasY(kp.y);
          // Higher visibility = bigger, brighter dot.
          const conf = Math.min(1, Math.max(0, kp.visibility));
          const baseR = 2 + conf * 2.5;

          // Outer glow
          ctx.beginPath();
          ctx.arc(px, py, baseR + 2, 0, 2 * Math.PI);
          ctx.fillStyle = `rgba(255, 255, 255, ${0.15 + conf * 0.25})`;
          ctx.fill();

          // Inner dot
          ctx.beginPath();
          ctx.arc(px, py, baseR, 0, 2 * Math.PI);
          ctx.fillStyle = '#ffffff';
          ctx.fill();

          // Dark border for contrast
          ctx.beginPath();
          ctx.arc(px, py, baseR, 0, 2 * Math.PI);
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

    }
    } catch (err) {
      console.error('AI overlay render failed:', err);
    }
  }, [aiResult, cameraId, displayMinVisibility]);

  return <canvas ref={canvasRef} className="ai-overlay-canvas" />;
}

// ---- AI Control Panel ----

function AIControlPanel({
  settings, onUpdate
}: { settings: AISettingsData; onUpdate: (s: AISettingsData) => void }) {
  type AISettingToggleKey =
    | 'enabled'
    | 'pose_enabled'
    | 'enhancement_enabled'
    | 'motion_gating';

  const toggle = (key: AISettingToggleKey) => {
    onUpdate({ ...settings, [key]: !settings[key] });
  };

  return (
    <div className="ai-control-panel">
      <div className="card-title">
        Pose Estimation
        <span className="ai-section-header">
          <span className="ai-badge">LOCAL</span>
        </span>
      </div>

      <div className="ai-controls-grid">
        <div className="ai-toggle-item">
          <label>Pose System</label>
          <button className={`ai-toggle ${settings.enabled ? 'active' : ''}`}
            onClick={() => toggle('enabled')} />
        </div>
        <div className="ai-toggle-item">
          <label>Pose Detection</label>
          <button className={`ai-toggle ${settings.pose_enabled ? 'active' : ''}`}
            onClick={() => toggle('pose_enabled')} />
        </div>
        <div className="ai-toggle-item">
          <label>Night Vision</label>
          <button className={`ai-toggle ${settings.enhancement_enabled ? 'active' : ''}`}
            onClick={() => toggle('enhancement_enabled')} />
        </div>
        <div className="ai-toggle-item">
          <label>Motion Gate</label>
          <button className={`ai-toggle ${settings.motion_gating ? 'active' : ''}`}
            onClick={() => toggle('motion_gating')} />
        </div>
      </div>

      <div className="ai-fps-control" style={{ marginTop: 10 }}>
        <label>Frame Rate</label>
        {/* FIX: BUG-07 — slider max 5 → 30 FPS for real-time surveillance. */}
        <input type="range" className="ai-fps-slider" min={1} max={30} step={1}
          value={settings.fps}
          onChange={e => onUpdate({ ...settings, fps: Number(e.target.value) })} />
        <span className="ai-fps-value">{settings.fps} FPS</span>
      </div>

      <div className="ai-fps-control" style={{ marginTop: 10 }}>
        <label title="MediaPipe detection threshold — frames below this do not produce a pose">
          Detection Confidence
        </label>
        {/* FIX: BUG-08 — this slider now actually reaches MediaPipe. */}
        <input type="range" className="ai-fps-slider" min={0.1} max={0.9} step={0.05}
          value={settings.detection_confidence}
          onChange={e => onUpdate({
            ...settings,
            detection_confidence: Number(e.target.value),
            confidence_threshold: Number(e.target.value),
          })} />
        <span className="ai-fps-value">{Math.round(settings.detection_confidence * 100)}%</span>
      </div>

      <div className="ai-fps-control" style={{ marginTop: 10 }}>
        <label title="Only joints above this visibility are drawn on the overlay">
          Display Visibility
        </label>
        {/* FIX: BUG-04 — this filter is frontend-only (render) and is separate
            from the MediaPipe detection threshold above. 30% is a sane default
            that keeps lower-body joints visible. */}
        <input type="range" className="ai-fps-slider" min={0.1} max={0.9} step={0.05}
          value={settings.display_min_visibility ?? 0.3}
          onChange={e => onUpdate({
            ...settings,
            display_min_visibility: Number(e.target.value),
          })} />
        <span className="ai-fps-value">
          {Math.round((settings.display_min_visibility ?? 0.3) * 100)}%
        </span>
      </div>
    </div>
  );
}

// ---- Known Persons Section ----

function KnownPersonsSection() {
  const [faces, setFaces] = useState<KnownFace[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFile, setNewFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { getKnownFaces().then(setFaces).catch(() => {}); }, []);

  const handleUpload = async () => {
    if (!newName.trim() || !newFile) return;
    setUploading(true);
    try {
      await uploadKnownFace(newName.trim(), newFile);
      setShowAdd(false);
      setNewName('');
      setNewFile(null);
      const updated = await getKnownFaces();
      setFaces(updated);
    } catch (e) { console.error('Upload failed:', e); }
    setUploading(false);
  };

  const handleDelete = async (name: string) => {
    try {
      await deleteKnownFace(name);
      setFaces(prev => prev.filter(f => f.name !== name));
    } catch (e) { console.error('Delete failed:', e); }
  };

  return (
    <section className="known-persons-section card">
      <div className="card-title">
        <span>👤 Known Persons</span>
        <button className="btn-ghost" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : '+ Add Person'}
        </button>
      </div>

      {showAdd && (
        <div className="add-person-modal">
          <input type="text" placeholder="Person name..." value={newName}
            onChange={e => setNewName(e.target.value)} />
          <input type="file" accept="image/*"
            onChange={e => setNewFile(e.target.files?.[0] || null)} />
          <div className="modal-actions">
            <button className="btn-primary" onClick={handleUpload}
              disabled={uploading || !newName.trim() || !newFile}>
              {uploading ? 'Uploading...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      <div className="known-persons-grid">
        {faces.map(face => (
          <div className="known-person-card" key={face.name}>
            <div className="known-person-avatar">
              {face.name.charAt(0).toUpperCase()}
            </div>
            <div className="known-person-name">{face.name}</div>
            <div className="known-person-meta">{face.image_count} photo(s)</div>
            <div className="known-person-actions">
              <button className="btn-ghost" onClick={() => handleDelete(face.name)}>
                Remove
              </button>
            </div>
          </div>
        ))}
        {faces.length === 0 && !showAdd && (
          <div className="add-person-form" onClick={() => setShowAdd(true)}>
            <span className="add-icon">+</span>
            <span>Add known person</span>
          </div>
        )}
      </div>
    </section>
  );
}

// ---- Smart Event Log ----

function SmartEventLog({ events }: { events: SmartEvent[] }) {
  const [filter, setFilter] = useState<'all' | 'detection' | 'face' | 'alert'>('all');
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = filter === 'all' ? events : events.filter(e => e.type === filter);

  const getIcon = (e: SmartEvent) => {
    if (e.severity === 'critical') return '🚨';
    if (e.severity === 'warning') return '⚠️';
    if (e.type === 'face') return '👤';
    return '📷';
  };

  return (
    <section className="smart-event-log card">
      <div className="card-title">
        <span>📋 AI Event Log</span>
        <span className="badge badge-ai-detection">{events.length} events</span>
      </div>

      <div className="event-filter-bar">
        {(['all', 'detection', 'face', 'alert'] as const).map(f => (
          <button key={f}
            className={`event-filter-btn ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="smart-event-list" ref={listRef}>
        {filtered.length === 0 && (
          <div className="status-message">No AI events yet. Start viewing a camera feed to begin detection.</div>
        )}
        {filtered.slice(0, 50).map(e => (
          <div key={e.id} className={`smart-event-item severity-${e.severity}`}>
            <span className="event-icon">{getIcon(e)}</span>
            <span className="event-text">{e.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Dashboard() {
  const { cameras, message, cameraLastUpdated, activeCameraIds, getCameraStatus, viewCamera, viewAllCameras } =
    useCameraViewer();
  const [aiEnabled, setAiEnabled] = useState(true);
  const [aiSettings, setAiSettings] = useState<AISettingsData>({
    enabled: true,
    fps: 15,                        // FIX: BUG-07 — raise default target FPS
    pose_enabled: true,
    enhancement_enabled: true,
    motion_gating: true,
    detection_confidence: 0.5,       // FIX: BUG-08 — what MediaPipe actually uses
    confidence_threshold: 0.5,       // legacy alias kept in sync
    display_min_visibility: 0.3,     // FIX: BUG-04 — no more hidden lower body
  });

  // AI detection for each camera
  const cam1AI = useAIDetection(
    'camera-1',
    aiEnabled && aiSettings.enabled && activeCameraIds.includes('camera-1'),
    aiSettings.fps
  );
  const cam2AI = useAIDetection(
    'camera-2',
    aiEnabled && aiSettings.enabled && activeCameraIds.includes('camera-2'),
    aiSettings.fps
  );
  const aiResults: Record<string, ReturnType<typeof useAIDetection>> = {
    'camera-1': cam1AI, 'camera-2': cam2AI,
  };

  // Combine smart events from all cameras
  const allSmartEvents = useMemo(() => {
    return [...cam1AI.smartEvents, ...cam2AI.smartEvents]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 100);
  }, [cam1AI.smartEvents, cam2AI.smartEvents]);

  // Load AI settings on mount. Preserve the frontend-only display slider
  // and backfill detection_confidence from the legacy confidence_threshold
  // if the server has not been restarted yet.
  useEffect(() => {
    getAISettings()
      .then((server) => {
        setAiSettings((prev) => ({
          ...prev,
          ...server,
          detection_confidence:
            server.detection_confidence ??
            server.confidence_threshold ??
            prev.detection_confidence,
          display_min_visibility: prev.display_min_visibility,
        }));
      })
      .catch(() => {});
  }, []);

  const handleAISettingsUpdate = (newSettings: AISettingsData) => {
    setAiSettings(newSettings);
    updateAISettings(newSettings).catch(() => {});
  };

  return (
    <AppShell
      activePath="/"
      sidebarAction={
        <button className="app-sidebar-item" onClick={viewAllCameras}>
          <span className="sidebar-dot dot-green" />
          View all feeds
        </button>
      }
    >
      <PageHeader
        kicker="Private monitoring dashboard"
        title="All Cameras"
        subtitle="Live feeds with pose-estimation skeleton overlays."
        actions={
          <>
            <div className="search">
              <div className="search-icon" />
              <div className="search-text">Search cameras, events, zones...</div>
            </div>

            <div className="seg" aria-label="Camera view mode">
              <button className="seg-btn active">Grid</button>
              <button className="seg-btn">List</button>
            </div>

            <button className="btn-primary" onClick={viewAllCameras}>
              View all
            </button>
          </>
        }
      />

      <section className="info-grid">
        <div className="card">
          <div className="card-title">System status</div>
          <div className="status-line">
            <strong>Message:</strong> {message || 'Ready'}
          </div>
          <div className="status-line">
            <strong>Access:</strong> Tailscale private network
          </div>
          <div className="status-line">
            <strong>Registration:</strong> Disabled
          </div>

          {/* Phase 3 — live per-camera pipeline metrics */}
          <div className="status-line" style={{ marginTop: 8 }}>
            <strong>Pose model:</strong>{' '}
            {cam1AI.result?.model || cam2AI.result?.model || 'MediaPipe BlazePose (loading)'}
          </div>
          <div className="status-line">
            <strong>Target FPS:</strong> {aiSettings.fps}
          </div>
          {cameras.map((camera) => {
            const r = aiResults[camera.id]?.result;
            const active = activeCameraIds.includes(camera.id);
            return (
              <div className="status-line" key={`status-${camera.id}`}>
                <strong>{camera.name}:</strong>{' '}
                {active
                  ? `${(r?.ai_fps ?? 0).toFixed(1)} FPS · ${
                      r?.processing_ms ? Math.round(r.processing_ms) : 0
                    } ms · ${r?.person_count ?? 0} person${(r?.person_count ?? 0) === 1 ? '' : 's'}`
                  : 'idle'}
              </div>
            );
          })}
        </div>

        <AIControlPanel settings={aiSettings} onUpdate={handleAISettingsUpdate} />
      </section>

      <section className="cam-grid" aria-label="Live camera feeds">
        {cameras.map((camera) => {
          const status = getCameraStatus(camera);
          const cameraAI = aiResults[camera.id];
          const poseDetected = Boolean(cameraAI?.result?.poses?.some((pose) => pose.length > 0));
          const hasAlerts = false;

          return (
            <article className="cam-card active" key={camera.id}>
              <div className="cam-feed" style={{ position: 'relative' }}>
                <section
                  id={`video-container-${camera.id}`}
                  style={{ width: '100%', height: '100%' }}
                  aria-label={`${camera.name} live feed`}
                >
                  <div className="rec-pill">
                    <span className={status === 'live' ? 'live-dot' : 'alert-dot'} />
                    {status === 'live' ? 'LIVE' : status.toUpperCase()}
                  </div>

                  {cameraAI?.isProcessing && (
                    <div className="ai-processing-pill">
                      <span className="ai-dot" />
                      AI {cameraAI.result?.processing_ms ? `${Math.round(cameraAI.result.processing_ms)}ms` : '...'}
                      {cameraAI.result?.ai_fps ? ` / ${cameraAI.result.ai_fps.toFixed(1)} FPS` : ''}
                    </div>
                  )}

                  <div
                    id={`video-mount-${camera.id}`}
                    className="video-mount"
                    aria-hidden="true"
                  />
                  <span className="feed-placeholder">NO FEED SELECTED</span>
                </section>

                {/* AI overlay canvas stays outside the LiveKit video mount. */}
                <AIOverlayCanvas
                  cameraId={camera.id}
                  aiResult={cameraAI?.result || null}
                  displayMinVisibility={aiSettings.display_min_visibility ?? 0.3}
                />
              </div>

              <div className="cam-meta">
                <span className="cam-name">{camera.name}</span>
                <span className={getCameraStatusBadgeClass(status)}>{status}</span>
                <span className={poseDetected ? 'badge badge-ai-detection' : 'badge badge-offline'}>
                  {poseDetected ? 'pose detected' : 'no pose'}
                </span>
                {hasAlerts && (
                  <span className="badge badge-ai-alert">
                    ⚠ Alert
                  </span>
                )}
              </div>

              {cameraAI?.errorMessage && (
                <div className="cam-ts">AI unavailable: {cameraAI.errorMessage}</div>
              )}

              <div className="cam-ts">
                Last updated: {cameraLastUpdated[camera.id] || 'Not connected'}
              </div>

              <div className="cam-actions">
                <button className="btn-primary" onClick={() => viewCamera(camera)}>
                  View feed
                </button>
                <button className="btn-ghost" onClick={() => viewCamera(camera)}>
                  Refresh
                </button>
              </div>
            </article>
          );
        })}
      </section>

    </AppShell>
  );
}

function DemoPage() {
  const { cameras, message, cameraLastUpdated, getCameraStatus, viewCamera, viewAllCameras } =
    useCameraViewer();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [userMessage, setUserMessage] = useState('Loading authenticated user...');
  const [recentEvents, setRecentEvents] = useState<AuditEvent[]>([]);
  const [chainValid, setChainValid] = useState<boolean | null>(null);
  const [auditMessage, setAuditMessage] = useState('Loading recent audit events...');

  useEffect(() => {
    apiGet<AuthenticatedUser>('/api/v1/me')
      .then((data) => {
        setUser(data);
        setUserMessage('');
      })
      .catch((err) => {
        console.error('Demo user load failed:', err);
        setUserMessage('Unable to load authenticated user.');
      });

    apiGet<{
      chain_valid: boolean;
      events: AuditEvent[];
    }>('/api/v1/admin/audit-events')
      .then((data) => {
        setChainValid(data.chain_valid);
        setRecentEvents([...data.events].reverse().slice(0, 8));
        setAuditMessage('');
      })
      .catch((err) => {
        console.error('Demo audit load failed:', err);
        setAuditMessage('Recent audit events are available to authorized audit/admin roles only.');
      });
  }, []);

  const securityStatus = [
    ['Private access', 'Tailscale Serve', 'badge-online'],
    ['Public registration', 'disabled', 'badge-offline'],
    ['Identity', 'verified', 'badge-online'],
    ['Camera grants', 'enforced', 'badge-online'],
    ['Stream tokens', 'short-lived', 'badge-info'],
    ['Audit log integrity', 'hash-chain enabled', chainValid === false ? 'badge-alert' : 'badge-online']
  ];

  return (
    <AppShell
      activePath="/demo"
      sidebarAction={
        <button className="app-sidebar-item" onClick={viewAllCameras}>
          <span className="sidebar-dot dot-green" />
          Start demo view
        </button>
      }
    >
      <PageHeader
        kicker="Presentation"
        title="Secure CCTV Demo Mode"
        subtitle="Private authenticated monitoring demo"
        actions={
          <>
            <a className="btn-ghost" href="/">
              Dashboard
            </a>
            <a className="btn-ghost" href="/admin/audit-logs">
              Audit Logs
            </a>
            <a className="btn-ghost" href="/admin/users">
              Users
            </a>
            <a className="btn-ghost" href="/admin/security">
              Security
            </a>
          </>
        }
      />

      <section className="demo-status-grid" aria-label="Security status">
        {securityStatus.map(([label, value, badgeClass]) => (
          <div className="admin-card demo-status-card" key={label}>
            <div className="card-title">{label}</div>
            <span className={`badge ${badgeClass}`}>{value}</span>
          </div>
        ))}
      </section>

      <section className="info-grid">
        <div className="admin-card">
          <div className="card-title">Authenticated User</div>
          {userMessage && <StatusMessage>{userMessage}</StatusMessage>}

          {user && (
            <div className="detail-list">
              <div>
                <span>Email</span>
                <strong>{user.email}</strong>
              </div>
              <div>
                <span>Roles</span>
                <RoleBadges roles={user.roles} />
              </div>
            </div>
          )}
        </div>

        <div className="admin-card">
          <div className="card-title">Camera Grants</div>
          {user && Object.keys(user.camera_grants || {}).length === 0 && (
            <StatusMessage>No camera grants assigned.</StatusMessage>
          )}

          {user && Object.keys(user.camera_grants || {}).length > 0 && (
            <div className="grant-list">
              {Object.entries(user.camera_grants || {}).map(([cameraId, permissions]) => (
                <div className="grant-row" key={cameraId}>
                  <strong>{cameraId}</strong>
                  <PermissionBadges permissions={permissions} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="admin-card">
        <div className="section-heading">
          <div>
            <h3>Live Camera Demo</h3>
            <p>{message || 'Ready to connect both authorized camera feeds.'}</p>
          </div>
          <button className="btn-primary" onClick={viewAllCameras}>
            Start demo view
          </button>
        </div>

        {cameras.length === 0 && <StatusMessage>No authorized cameras are available.</StatusMessage>}

        {cameras.length > 0 && (
          <section className="cam-grid demo-camera-grid" aria-label="Demo live camera feeds">
            {cameras.map((camera) => {
              const status = getCameraStatus(camera);

              return (
                <article className="cam-card active" key={camera.id}>
                  <section
                    id={`video-container-${camera.id}`}
                    className="cam-feed"
                    aria-label={`${camera.name} live feed`}
                  >
                    <div className="rec-pill">
                      <span className={status === 'live' ? 'live-dot' : 'alert-dot'} />
                      {status === 'live' ? 'LIVE' : status.toUpperCase()}
                    </div>

                    <div
                      id={`video-mount-${camera.id}`}
                      className="video-mount"
                      aria-hidden="true"
                    />
                    <span className="feed-placeholder">NO FEED SELECTED</span>
                  </section>

                  <div className="cam-meta">
                    <span className="cam-name">{camera.name}</span>
                    <span className={getCameraStatusBadgeClass(status)}>{status}</span>
                  </div>

                  <div className="cam-ts">
                    Last updated: {cameraLastUpdated[camera.id] || 'Not connected'}
                  </div>

                  <div className="cam-actions">
                    <button className="btn-primary" onClick={() => viewCamera(camera)}>
                      View feed
                    </button>
                    <button className="btn-ghost" onClick={() => viewCamera(camera)}>
                      Refresh
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </section>

      <section className="admin-card">
        <div className="section-heading">
          <div>
            <h3>Recent Audit Events</h3>
            <p>
              Hash chain status:{' '}
              {chainValid === null ? 'unavailable' : chainValid ? 'valid' : 'invalid'}
            </p>
          </div>
          <a className="btn-ghost" href="/admin/audit-logs">
            Full Audit Logs
          </a>
        </div>

        {auditMessage && <StatusMessage>{auditMessage}</StatusMessage>}

        {!auditMessage && recentEvents.length === 0 && (
          <StatusMessage>No recent audit events yet.</StatusMessage>
        )}

        {!auditMessage && recentEvents.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Result</th>
                  <th>Actor</th>
                  <th>Target</th>
                </tr>
              </thead>

              <tbody>
                {recentEvents.map((event) => (
                  <tr key={event.id}>
                    <td>{new Date(event.occurred_at).toLocaleString()}</td>
                    <td>{event.action}</td>
                    <td>
                      <span
                        className={
                          event.result.toLowerCase() === 'success'
                            ? 'badge badge-online'
                            : 'badge badge-alert'
                        }
                      >
                        {event.result}
                      </span>
                    </td>
                    <td>{event.actor_email || 'unknown'}</td>
                    <td>
                      {event.target_type || '-'}
                      {event.target_id ? `: ${event.target_id}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-card">
        <div className="card-title">Demo Script</div>
        <ol className="demo-script-list">
          <li>Show unauthorized non-Tailscale device cannot access.</li>
          <li>Show authenticated Tailscale device can access.</li>
          <li>Start camera-1 publisher.</li>
          <li>Start camera-2 publisher.</li>
          <li>Click Start demo view.</li>
          <li>Show audit events and hash-chain validity.</li>
          <li>Show users are provisioned, no public registration.</li>
        </ol>
      </section>
    </AppShell>
  );
}

function Publisher() {
  const [message, setMessage] = useState('Ready to publish.');
  const roomRef = useRef<Room | null>(null);
  const trackRef = useRef<LocalVideoTrack | null>(null);
  const intentionalStopRef = useRef(false);
  const hasPublishedRef = useRef(false);

  const params = new URLSearchParams(window.location.search);
  const cameraId = params.get('camera') || 'camera-1';

  async function logPublisherEvent(
    event: 'publisher_started' | 'publisher_stopped' | 'publisher_disconnected' | 'publisher_failed',
    eventMessage?: string
  ) {
    try {
      await apiPost<{ status: string; action: string }>(
        `/api/v1/cameras/${encodeURIComponent(cameraId)}/publisher-events`,
        {
          event,
          message: eventMessage
        }
      );
    } catch (err) {
      console.error('Publisher audit event failed:', err);
    }
  }

  async function publish() {
    try {
      intentionalStopRef.current = false;
      setMessage('Requesting publish token...');

      const data = await requestToken(cameraId, 'publish');

      setMessage('Requesting camera permission...');

      const track = await createLocalVideoTrack({
        facingMode: 'user',
        resolution: VideoPresets.h720.resolution
      });

      trackRef.current = track;

      const preview = getPublisherVideoMount();
      if (preview) {
        const el = track.attach();
        el.muted = true;
        el.autoplay = true;
        el.setAttribute('playsinline', 'true');
        preview.replaceChildren(el);
      }

      setMessage('Camera permission granted. Connecting to LiveKit...');

      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }

      const room = new Room();
      roomRef.current = room;

      room.on(RoomEvent.Disconnected, () => {
        if (roomRef.current !== room) return;

        setMessage('Publisher disconnected. Keep the browser tab open and device awake.');
        if (intentionalStopRef.current) {
          intentionalStopRef.current = false;
          return;
        }
        hasPublishedRef.current = false;
        void logPublisherEvent('publisher_disconnected', 'LiveKit publisher room disconnected.');
      });

      await room.connect(livekitUrl, data.token);

      setMessage('Publishing camera feed...');

      await room.localParticipant.publishTrack(track);

      hasPublishedRef.current = true;
      await logPublisherEvent('publisher_started', 'Publisher started sending camera video.');

      setMessage('Publishing. Keep this phone/browser awake and plugged in.');
    } catch (err) {
      console.error('Publishing failed:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      hasPublishedRef.current = false;
      if (trackRef.current) {
        trackRef.current.stop();
        trackRef.current.detach().forEach((el) => el.remove());
        trackRef.current = null;
      }
      if (roomRef.current) {
        intentionalStopRef.current = true;
        roomRef.current.disconnect();
        roomRef.current = null;
        intentionalStopRef.current = false;
      }
      clearPublisherVideoMount();
      await logPublisherEvent('publisher_failed', errorMessage);
      setMessage(`Publishing failed: ${errorMessage}`);
    }
  }

  function stopPublishing() {
    if (trackRef.current) {
      trackRef.current.stop();
      trackRef.current.detach();
      trackRef.current = null;
    }

    if (roomRef.current) {
      intentionalStopRef.current = true;
      roomRef.current.disconnect();
      roomRef.current = null;
      intentionalStopRef.current = false;
    }

    clearPublisherVideoMount();

    if (hasPublishedRef.current) {
      void logPublisherEvent('publisher_stopped', 'Publisher stopped by user.');
    }
    hasPublishedRef.current = false;

    setMessage('Publishing stopped.');
  }

  return (
    <AppShell activePath="/publisher">
      <PageHeader
        kicker="Camera source"
        title="Phone Camera Publisher"
        subtitle={`Selected source: ${cameraId}`}
        actions={
          <>
            <a className="btn-ghost" href="/publisher?camera=camera-1">
              Camera 1
            </a>
            <a className="btn-ghost" href="/publisher?camera=camera-2">
              Camera 2
            </a>
          </>
        }
      />

      <section className="info-grid publisher-grid">
        <div className="card">
          <div className="card-title">Publisher controls</div>
          <div className="status-line">
            <strong>Camera:</strong> {cameraId}
          </div>
          <div className="status-line">
            <strong>Status:</strong> {message}
          </div>
          <div className="button-row">
            <button className="btn-primary" onClick={publish}>
              Start publishing
            </button>
            <button className="btn-ghost" onClick={stopPublishing}>
              Stop publishing
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Stream security</div>
          <div className="status-line">Publish token required</div>
          <div className="status-line">Camera grants enforced</div>
          <div className="status-line">LiveKit room connection only</div>
        </div>
      </section>

      <section className="admin-card">
        <div className="section-heading">
          <h3>Live Preview</h3>
          <span className="badge badge-info">{cameraId}</span>
        </div>
        <div id="publisher-preview" className="publisher-preview" aria-label="Phone camera preview">
          <div id="publisher-video-mount" className="video-mount" aria-hidden="true" />
          <span className="feed-placeholder">PREVIEW NOT STARTED</span>
        </div>
      </section>
    </AppShell>
  );
}

function AdminSecurityPage() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    apiGet<AuthenticatedUser>('/api/v1/me')
      .then(setUser)
      .catch((err) => {
        console.error('Security page failed:', err);
        setMessage('Unable to load security information');
      });
  }, []);

  return (
    <AppShell activePath="/admin/security">
      <PageHeader
        kicker="Administration"
        title="Security"
        subtitle="Authenticated identity, camera grants, and enforced access controls."
      />

      {message && <StatusMessage>{message}</StatusMessage>}

      {!message && !user && <StatusMessage>Loading security information...</StatusMessage>}

      {user && (
        <>
          <section className="info-grid">
            <div className="admin-card">
              <div className="card-title">Authenticated identity</div>
              <div className="detail-list">
                <div>
                  <span>User ID</span>
                  <strong>{user.id}</strong>
                </div>
                <div>
                  <span>Email</span>
                  <strong>{user.email}</strong>
                </div>
                <div>
                  <span>Roles</span>
                  <RoleBadges roles={user.roles} />
                </div>
              </div>
            </div>

            <div className="admin-card">
              <div className="card-title">Camera permissions</div>
              <div className="grant-list">
                {Object.entries(user.camera_grants || {}).map(([cameraId, permissions]) => (
                  <div className="grant-row" key={cameraId}>
                    <strong>{cameraId}</strong>
                    <PermissionBadges permissions={permissions} />
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="info-grid">
            <div className="admin-card">
              <div className="card-title">Security status</div>
              <ul className="clean-list">
                <li>Private access through Tailscale: enabled</li>
                <li>Public registration: disabled</li>
                <li>Fake local admin header: removed</li>
                <li>Real identity header: enabled</li>
                <li>Camera access grants: enabled</li>
                <li>Short-lived stream tokens: enabled</li>
                <li>Direct public camera URLs: not exposed</li>
              </ul>
            </div>

            <div className="admin-card">
              <div className="card-title">Demo explanation</div>
              <p>
                This page proves that the backend is receiving a real authenticated identity,
                checking roles, and enforcing camera-specific permissions before issuing stream
                tokens.
              </p>
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}

function AuditLogsPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [chainValid, setChainValid] = useState<boolean | null>(null);
  const [message, setMessage] = useState('Loading audit logs...');
  const [exportMessage, setExportMessage] = useState('');
  const [searchText, setSearchText] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [resultFilter, setResultFilter] = useState<AuditResultFilter>('all');
  const [actorFilter, setActorFilter] = useState('all');
  const [targetCameraFilter, setTargetCameraFilter] = useState('all');

  const actionOptions = useMemo(
    () => Array.from(new Set(events.map((event) => event.action))).sort(),
    [events]
  );
  const actorOptions = useMemo(
    () =>
      Array.from(new Set(events.map((event) => event.actor_email).filter(Boolean) as string[])).sort(),
    [events]
  );
  const targetCameraOptions = useMemo(
    () =>
      Array.from(
        new Set(
          events
            .filter((event) => event.target_type === 'camera' && event.target_id)
            .map((event) => event.target_id as string)
        )
      ).sort(),
    [events]
  );

  const filteredEvents = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return events.filter((event) => {
      const searchableFields = [
        event.action,
        event.actor_email,
        event.target_type,
        event.target_id,
        event.result,
        event.reason_code,
        event.source_ip,
        event.request_id,
        event.event_hash,
        event.previous_hash
      ];
      const matchesSearch =
        !normalizedSearch ||
        searchableFields.some((field) => (field || '').toLowerCase().includes(normalizedSearch));
      const matchesAction = actionFilter === 'all' || event.action === actionFilter;
      const matchesResult =
        resultFilter === 'all' || event.result.toLowerCase() === resultFilter;
      const matchesActor = actorFilter === 'all' || event.actor_email === actorFilter;
      const matchesTargetCamera =
        targetCameraFilter === 'all' ||
        (event.target_type === 'camera' && event.target_id === targetCameraFilter);

      return matchesSearch && matchesAction && matchesResult && matchesActor && matchesTargetCamera;
    });
  }, [actionFilter, actorFilter, events, resultFilter, searchText, targetCameraFilter]);

  async function loadAuditEvents() {
    try {
      setMessage('Loading audit logs...');

      const data = await apiGet<{
        chain_valid: boolean;
        events: AuditEvent[];
      }>('/api/v1/admin/audit-events');

      setChainValid(data.chain_valid);
      setEvents([...data.events].reverse());
      setMessage('');
    } catch (err) {
      console.error('Audit log load failed:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setMessage(`Unable to load audit logs: ${errorMessage}`);
    }
  }

  async function exportAuditEvents() {
    let objectUrl = '';
    let anchor: HTMLAnchorElement | null = null;

    try {
      setExportMessage('');

      const response = await fetch('/api/v1/admin/audit-events/export.csv', {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Export failed: ${response.status}`);
      }

      const blob = await response.blob();
      objectUrl = URL.createObjectURL(blob);
      anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = 'audit-events.csv';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
    } catch (err) {
      console.error('Audit log export failed:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setExportMessage(`Unable to export audit logs: ${errorMessage}`);
    } finally {
      if (anchor) {
        anchor.remove();
      }
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    }
  }

  useEffect(() => {
    loadAuditEvents();
  }, []);

  function clearAuditFilters() {
    setSearchText('');
    setActionFilter('all');
    setResultFilter('all');
    setActorFilter('all');
    setTargetCameraFilter('all');
  }

  return (
    <AppShell activePath="/admin/audit-logs">
      <PageHeader
        kicker="Security events"
        title="Audit Logs"
        subtitle="Recent authorization, stream-token, and administrative security events."
        actions={
          <>
            <button className="btn-ghost" onClick={exportAuditEvents}>
              Export CSV
            </button>
            <button className="btn-primary" onClick={loadAuditEvents}>
              Refresh audit logs
            </button>
          </>
        }
      />

      <section className="admin-card">
        <div className="section-heading">
          <div>
            <div className="card-title">Audit integrity</div>
            <p>Hash chain status for the current audit event sequence.</p>
          </div>
          <span className={chainValid ? 'badge badge-online' : 'badge badge-warning'}>
            {chainValid === null ? 'Unknown' : chainValid ? 'Valid' : 'Invalid'}
          </span>
        </div>
      </section>

      <section className="admin-card">
        <div className="section-heading">
          <div>
            <div className="card-title">Filters</div>
            <p>Showing {filteredEvents.length} of {events.length} events</p>
          </div>
          <button className="btn-ghost" onClick={clearAuditFilters}>
            Clear Filters
          </button>
        </div>

        <div className="filter-grid">
          <label className="filter-control">
            <span>Search</span>
            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Action, actor, target, request ID"
            />
          </label>

          <label className="filter-control">
            <span>Action</span>
            <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
              <option value="all">All actions</option>
              {actionOptions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-control">
            <span>Result</span>
            <select
              value={resultFilter}
              onChange={(event) => setResultFilter(event.target.value as AuditResultFilter)}
            >
              <option value="all">All results</option>
              <option value="success">Success</option>
              <option value="denied">Denied</option>
              <option value="failure">Failure</option>
            </select>
          </label>

          <label className="filter-control">
            <span>Actor Email</span>
            <select value={actorFilter} onChange={(event) => setActorFilter(event.target.value)}>
              <option value="all">All actors</option>
              {actorOptions.map((actorEmail) => (
                <option key={actorEmail} value={actorEmail}>
                  {actorEmail}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-control">
            <span>Target Camera</span>
            <select
              value={targetCameraFilter}
              onChange={(event) => setTargetCameraFilter(event.target.value)}
            >
              <option value="all">All cameras</option>
              {targetCameraOptions.map((cameraId) => (
                <option key={cameraId} value={cameraId}>
                  {cameraId}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="admin-card">
        <div className="section-heading">
          <h3>Recent Security Events</h3>
          <span className="badge badge-info">
            Showing {filteredEvents.length} of {events.length} events
          </span>
        </div>

        {message && <StatusMessage>{message}</StatusMessage>}
        {exportMessage && <StatusMessage>{exportMessage}</StatusMessage>}

        {!message && events.length === 0 && <StatusMessage>No audit events yet.</StatusMessage>}
        {!message && events.length > 0 && filteredEvents.length === 0 && (
          <StatusMessage>No audit events match the current filters.</StatusMessage>
        )}

        {!message && filteredEvents.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Result</th>
                  <th>Actor</th>
                  <th>Target</th>
                  <th>IP</th>
                  <th>Reason</th>
                </tr>
              </thead>

              <tbody>
                {filteredEvents.map((event) => (
                  <tr key={event.id}>
                    <td>{new Date(event.occurred_at).toLocaleString()}</td>
                    <td>{event.action}</td>
                    <td>
                      <span
                        className={
                          event.result.toLowerCase() === 'success'
                            ? 'badge badge-online'
                            : 'badge badge-alert'
                        }
                      >
                        {event.result}
                      </span>
                    </td>
                    <td>{event.actor_email || 'unknown'}</td>
                    <td>
                      {event.target_type || '-'}
                      {event.target_id ? `: ${event.target_id}` : ''}
                    </td>
                    <td>{event.source_ip || '-'}</td>
                    <td>{event.reason_code || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}

function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [message, setMessage] = useState('Loading users...');

  async function loadUsers() {
    try {
      setMessage('Loading users...');
      const data = await apiGet<AdminUser[]>('/api/v1/admin/users');
      setUsers(data);
      setMessage('');
    } catch (err) {
      console.error('User load failed:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setMessage(`Unable to load users: ${errorMessage}`);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  return (
    <AppShell activePath="/admin/users">
      <PageHeader
        kicker="Administration"
        title="Admin Users"
        subtitle="Provisioned users, roles, camera grants, and account status."
        actions={
          <button className="btn-primary" onClick={loadUsers}>
            Refresh users
          </button>
        }
      />

      <section className="admin-card">
        <div className="card-title">User provisioning policy</div>
        <ul className="clean-list">
          <li>Public registration: disabled</li>
          <li>Self-signup: disabled</li>
          <li>Users are provisioned by admin/config only</li>
          <li>Default access rule: deny by default</li>
          <li>Camera access requires explicit permission grants</li>
        </ul>
      </section>

      <section className="admin-card">
        <div className="section-heading">
          <h3>Authorized Users</h3>
          <span className="badge badge-info">{users.length} users</span>
        </div>

        {message && <StatusMessage>{message}</StatusMessage>}

        {!message && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Roles</th>
                  <th>Camera Grants</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.email}</td>
                    <td>
                      <RoleBadges roles={user.roles} />
                    </td>
                    <td>
                      <div className="grant-list table-grants">
                        {Object.entries(user.camera_grants || {}).map(([cameraId, permissions]) => (
                          <div className="grant-row" key={cameraId}>
                            <strong>{cameraId}</strong>
                            <PermissionBadges permissions={permissions} />
                          </div>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span
                        className={
                          user.status === 'active' ? 'badge badge-online' : 'badge badge-offline'
                        }
                      >
                        {user.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}

function SecurityTestPage() {
  const [message, setMessage] = useState('');

  async function generateDeniedAccessEvent() {
    try {
      setMessage('Generating denied-access test event...');

      const data = await apiPost<{ status: string; message: string }>(
        '/api/v1/admin/security-test/denied-access'
      );

      setMessage(data.message);
    } catch (err) {
      console.error('Security test failed:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setMessage(`Security test failed: ${errorMessage}`);
    }
  }

  return (
    <AppShell activePath="/admin/security-test">
      <PageHeader
        kicker="Security validation"
        title="Security Test"
        subtitle="Generate a safe denied-access audit event for demonstration."
      />

      <section className="info-grid">
        <div className="admin-card">
          <div className="card-title">Blocked access demo</div>
          <p>
            This page creates a safe simulated denied-access event so the audit log can show how
            unauthorized or blocked behavior is recorded.
          </p>
          <div className="button-row">
            <button className="btn-primary" onClick={generateDeniedAccessEvent}>
              Generate denied-access test event
            </button>
            <a className="btn-ghost" href="/admin/audit-logs">
              View audit logs
            </a>
          </div>

          {message && <StatusMessage>{message}</StatusMessage>}
        </div>

        <div className="admin-card">
          <div className="card-title">Demo instructions</div>
          <ol className="clean-list">
            <li>Click the generate button.</li>
            <li>Open the Audit Logs page.</li>
            <li>Refresh audit logs.</li>
            <li>Look for ACCESS_DENIED_TEST.</li>
          </ol>
        </div>
      </section>
    </AppShell>
  );
}

function App() {
  if (window.location.pathname.startsWith('/publisher')) {
    return <Publisher />;
  }

  if (window.location.pathname.startsWith('/demo')) {
    return <DemoPage />;
  }

  if (window.location.pathname.startsWith('/admin/security-test')) {
    return <SecurityTestPage />;
  }

  if (window.location.pathname.startsWith('/admin/security')) {
    return <AdminSecurityPage />;
  }

  if (window.location.pathname.startsWith('/admin/audit-logs')) {
    return <AuditLogsPage />;
  }

  if (window.location.pathname.startsWith('/admin/users')) {
    return <AdminUsersPage />;
  }

  return <Dashboard />;
}

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
