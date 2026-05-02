import { useEffect, useRef, useState, type ReactNode } from 'react';
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
import { apiGet, apiPost, requestToken, Camera } from './api';

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

function Dashboard() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [message, setMessage] = useState('');
  const [cameraStatuses, setCameraStatuses] = useState<Record<string, CameraLiveStatus>>({});
  const [cameraLastUpdated, setCameraLastUpdated] = useState<Record<string, string>>({});
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

  function isCurrentSession(cameraId: string, sessionId: number) {
    return sessionIdsRef.current[cameraId] === sessionId;
  }

  async function viewCamera(camera: Camera) {
    const sessionId = sessionCounterRef.current + 1;
    sessionCounterRef.current = sessionId;
    sessionIdsRef.current[camera.id] = sessionId;
    videoAttachedRef.current[camera.id] = false;
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

            const container = document.getElementById(`video-container-${camera.id}`);
            if (container) {
              container.innerHTML = '';
              container.appendChild(el);
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
        setCameraStatus(camera.id, 'error');
      }
      setMessage(`Viewer failed: ${errorMessage}`);
    }
  }

  async function viewAllCameras() {
    setMessage('Connecting to all available cameras...');

    await Promise.allSettled(cameras.map((camera) => viewCamera(camera)));
  }

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
        subtitle="Live feeds are available only through authenticated Tailscale access."
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
        </div>

        <div className="card">
          <div className="card-title">Security controls</div>
          <div className="status-line">Identity headers verified</div>
          <div className="status-line">Camera grants enforced</div>
          <div className="status-line">Short-lived stream tokens</div>
        </div>
      </section>

      <section className="cam-grid" aria-label="Live camera feeds">
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

      const preview = document.getElementById('publisher-preview');
      if (preview) {
        preview.innerHTML = '';
        const el = track.attach();
        el.muted = true;
        el.autoplay = true;
        el.setAttribute('playsinline', 'true');
        preview.appendChild(el);
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

    const preview = document.getElementById('publisher-preview');
    if (preview) {
      preview.innerHTML = '';
    }

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
          <h3>Recent Security Events</h3>
          <span className="badge badge-info">{events.length} events</span>
        </div>

        {message && <StatusMessage>{message}</StatusMessage>}
        {exportMessage && <StatusMessage>{exportMessage}</StatusMessage>}

        {!message && events.length === 0 && <StatusMessage>No audit events yet.</StatusMessage>}

        {!message && events.length > 0 && (
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
                {events.map((event) => (
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

createRoot(document.getElementById('root')!).render(<App />);
