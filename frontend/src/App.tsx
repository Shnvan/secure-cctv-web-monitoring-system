import React, { useEffect, useRef, useState } from 'react';
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

function Dashboard() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [message, setMessage] = useState('');
  const roomsRef = useRef<Record<string, Room>>({});

  useEffect(() => {
    apiGet<Camera[]>('/api/v1/cameras')
      .then(setCameras)
      .catch((err) => {
        console.error('Camera list failed:', err);
        setMessage('Access denied or unavailable');
      });
      
    return () => {
      Object.values(roomsRef.current).forEach((room) => room.disconnect());
      roomsRef.current = {};
    };
  }, []);

  async function viewCamera(camera: Camera) {
    try {
      setMessage(`Requesting view token for ${camera.name}...`);

      const data = await requestToken(camera.id, 'view');

      if (roomsRef.current[camera.id]) {
        roomsRef.current[camera.id].disconnect();
        delete roomsRef.current[camera.id];
      }

      const room = new Room();
      roomsRef.current[camera.id] = room;

      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === 'video') {
          const el = track.attach();
          el.setAttribute('autoplay', 'true');
          el.setAttribute('playsinline', 'true');

          const container = document.getElementById(`video-container-${camera.id}`);
          if (container) {
            container.innerHTML = '';
            container.appendChild(el);
          }

          setMessage(`Live feed active: ${camera.name}`);
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        setMessage(`Disconnected from ${camera.name}`);
      });

      setMessage(`Connecting to ${camera.name}...`);
      await room.connect(livekitUrl, data.token);

      setMessage(`Connected to ${camera.name}. Waiting for camera feed...`);
    } catch (err) {
      console.error('View camera failed:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setMessage(`Viewer failed: ${errorMessage}`);
    }
  }

  async function viewAllCameras() {
    for (const camera of cameras) {
      await viewCamera(camera);
    }

    setMessage('Connecting to all available cameras...');
  }

   return (
  <main className="web-dashboard">
    <header className="app-navbar">
      <div className="app-brand">
        <div className="brand-mark">CCTV</div>
        <div>
          <h1>Secure CCTV Monitor</h1>
          <p>Private live monitoring for authorized users only</p>
        </div>
      </div>

      <nav className="top-nav">
        <a href="/admin/security">Security</a>
        <a href="/admin/audit-logs">Audit Logs</a>
        <a href="/admin/users">Users</a>
        <a href="/admin/security-test">Security Test</a>
      </nav>
    </header>

    <section className="dashboard-layout">
      <aside className="app-sidebar">
        <div className="sidebar-label">Monitoring</div>

        <a className="app-sidebar-item active" href="/">
          <span className="sidebar-dot dot-cyan" />
          All cameras
        </a>

        <button className="app-sidebar-item" onClick={viewAllCameras}>
          <span className="sidebar-dot dot-green" />
          View all feeds
        </button>

        <a className="app-sidebar-item" href="/admin/audit-logs">
          <span className="sidebar-dot dot-red" />
          Event log
        </a>

        <div className="sidebar-divider" />

        <div className="sidebar-label">Administration</div>

        <a className="app-sidebar-item" href="/admin/security">
          <span className="sidebar-dot dot-cyan" />
          Security
        </a>

        <a className="app-sidebar-item" href="/admin/users">
          <span className="sidebar-dot dot-green" />
          Users
        </a>

        <a className="app-sidebar-item" href="/admin/security-test">
          <span className="sidebar-dot dot-red" />
          Test denial
        </a>
      </aside>

      <section className="dashboard-main">
        <header className="page-header">
          <div>
            <div className="page-kicker">Private monitoring dashboard</div>
            <h2 className="page-title">All Cameras</h2>
            <p className="page-subtitle">
              Live feeds are available only through authenticated Tailscale access.
            </p>
          </div>

          <div className="header-actions">
            <div className="search">
              <div className="search-icon" />
              <div className="search-text">Search cameras, events, zones…</div>
            </div>

            <div className="seg">
              <button className="seg-btn active">Grid</button>
              <button className="seg-btn">List</button>
            </div>

            <button className="btn-apple" onClick={viewAllCameras}>
              View all
            </button>
          </div>
        </header>

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
          {cameras.map((camera) => (
            <article className="cam-card active" key={camera.id}>
              <section
                id={`video-container-${camera.id}`}
                className="cam-feed"
                aria-label={`${camera.name} live feed`}
              >
                <div className="rec-pill">
                  <span className="live-dot" />
                  LIVE
                </div>

                <span className="feed-placeholder">NO FEED SELECTED</span>
              </section>

              <div className="cam-meta">
                <span className="cam-name">{camera.name}</span>
                <span
                  className={
                    camera.status === 'online'
                      ? 'badge badge-online'
                      : 'badge badge-offline'
                  }
                >
                  {camera.status}
                </span>
              </div>

              <div className="cam-ts">{new Date().toLocaleTimeString()}</div>

              <div className="cam-actions">
                <button className="btn-apple" onClick={() => viewCamera(camera)}>
                  View feed
                </button>
                <button className="btn-ghost" onClick={() => viewCamera(camera)}>
                  Refresh
                </button>
              </div>
            </article>
          ))}
        </section>
      </section>
    </section>
  </main>
);

}

function Publisher() {
  const [message, setMessage] = useState('');
  const roomRef = useRef<Room | null>(null);
  const trackRef = useRef<LocalVideoTrack | null>(null);

  const params = new URLSearchParams(window.location.search);
  const cameraId = params.get('camera') || 'camera-1';

  async function publish() {
    try {
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
        setMessage('Publisher disconnected. Keep the browser tab open and device awake.');
      });

      await room.connect(livekitUrl, data.token);

      setMessage('Publishing camera feed...');

      await room.localParticipant.publishTrack(track);

      setMessage('Publishing. Keep this phone/browser awake and plugged in.');
    } catch (err) {
      console.error('Publishing failed:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
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
      roomRef.current.disconnect();
      roomRef.current = null;
    }

    const preview = document.getElementById('publisher-preview');
    if (preview) {
      preview.innerHTML = '';
    }

    setMessage('Publishing stopped.');
  }

  return (
    <main style={{ padding: '16px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Phone Camera Publisher</h1>
      <p>Camera: {cameraId}</p>
      <p>{message}</p>

      <button onClick={publish}>Start publishing</button>
      <button onClick={stopPublishing} style={{ marginLeft: '8px' }}>
        Stop publishing
      </button>

      <section
        id="publisher-preview"
        aria-label="Phone camera preview"
        style={{ marginTop: '16px' }}
      />
    </main>
  );
}

function AdminSecurityPage() {
  const [user, setUser] = useState<any>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    apiGet('/api/v1/me')
      .then(setUser)
      .catch((err) => {
        console.error('Security page failed:', err);
        setMessage('Unable to load security information');
      });
  }, []);

  if (message) {
    return (
      <main style={{ padding: '16px', fontFamily: 'Arial, sans-serif' }}>
        <h1>Admin Security Page</h1>
        <p>{message}</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={{ padding: '16px', fontFamily: 'Arial, sans-serif' }}>
        <h1>Admin Security Page</h1>
        <p>Loading security information...</p>
      </main>
    );
  }

  return (
    <main style={{ padding: '16px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Admin Security Page</h1>

      <section style={{ border: '1px solid #ccc', padding: '12px', marginBottom: '16px' }}>
        <h2>Authenticated Identity</h2>
        <p><strong>User ID:</strong> {user.id}</p>
        <p><strong>Email:</strong> {user.email}</p>
        <p><strong>Roles:</strong> {user.roles?.join(', ')}</p>
      </section>

      <section style={{ border: '1px solid #ccc', padding: '12px', marginBottom: '16px' }}>
        <h2>Camera Permissions</h2>

        {Object.entries(user.camera_grants || {}).map(([cameraId, permissions]) => (
          <div key={cameraId} style={{ marginBottom: '8px' }}>
            <strong>{cameraId}</strong>: {(permissions as string[]).join(', ')}
          </div>
        ))}
      </section>

      <section style={{ border: '1px solid #ccc', padding: '12px', marginBottom: '16px' }}>
        <h2>Security Status</h2>
        <ul>
          <li>Private access through Tailscale: enabled</li>
          <li>Public registration: disabled</li>
          <li>Fake local admin header: removed</li>
          <li>Real identity header: enabled</li>
          <li>Camera access grants: enabled</li>
          <li>Short-lived stream tokens: enabled</li>
          <li>Direct public camera URLs: not exposed</li>
        </ul>
      </section>

      <section style={{ border: '1px solid #ccc', padding: '12px' }}>
        <h2>Demo Explanation</h2>
        <p>
          This page proves that the backend is receiving a real authenticated identity,
          checking roles, and enforcing camera-specific permissions before issuing stream tokens.
        </p>
      </section>
    </main>
  );
}

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

function AuditLogsPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [chainValid, setChainValid] = useState<boolean | null>(null);
  const [message, setMessage] = useState('Loading audit logs...');

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

  useEffect(() => {
    loadAuditEvents();
  }, []);

  return (
    <main style={{ padding: '16px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Audit Logs</h1>

      <p>
        <a href="/">Dashboard</a> | <a href="/admin/security">Admin Security Page</a>
      </p>

      <section style={{ border: '1px solid #ccc', padding: '12px', marginBottom: '16px' }}>
        <h2>Audit Integrity</h2>
        <p>
          <strong>Hash chain valid:</strong>{' '}
          {chainValid === null ? 'Unknown' : chainValid ? 'Valid' : 'Invalid'}
        </p>

        <button onClick={loadAuditEvents}>Refresh audit logs</button>
      </section>

      <section style={{ border: '1px solid #ccc', padding: '12px' }}>
        <h2>Recent Security Events</h2>

        {message && <p>{message}</p>}

        {!message && events.length === 0 && <p>No audit events yet.</p>}

        {!message && events.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table border={1} cellPadding={8} style={{ borderCollapse: 'collapse', width: '100%' }}>
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
                    <td>{event.result}</td>
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
    </main>
  );
}

type AdminUser = {
  id: string;
  email: string;
  roles: string[];
  camera_grants: Record<string, string[]>;
  status: string;
};

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
    <main style={{ padding: '16px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Admin Users</h1>

      <p>
        <a href="/">Dashboard</a> |{' '}
        <a href="/admin/security">Admin Security Page</a> |{' '}
        <a href="/admin/audit-logs">Audit Logs</a>
      </p>

      <section style={{ border: '1px solid #ccc', padding: '12px', marginBottom: '16px' }}>
        <h2>User Provisioning Policy</h2>
        <ul>
          <li>Public registration: disabled</li>
          <li>Self-signup: disabled</li>
          <li>Users are provisioned by admin/config only</li>
          <li>Default access rule: deny by default</li>
          <li>Camera access requires explicit permission grants</li>
        </ul>

        <button onClick={loadUsers}>Refresh users</button>
      </section>

      <section style={{ border: '1px solid #ccc', padding: '12px' }}>
        <h2>Authorized Users</h2>

        {message && <p>{message}</p>}

        {!message && (
          <div style={{ overflowX: 'auto' }}>
            <table border={1} cellPadding={8} style={{ borderCollapse: 'collapse', width: '100%' }}>
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
                    <td>{user.roles.join(', ')}</td>
                    <td>
                      {Object.entries(user.camera_grants || {}).map(([cameraId, permissions]) => (
                        <div key={cameraId}>
                          <strong>{cameraId}:</strong> {permissions.join(', ')}
                        </div>
                      ))}
                    </td>
                    <td>{user.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
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
    <main style={{ padding: '16px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Security Test Page</h1>

      <p>
        <a href="/">Dashboard</a> |{' '}
        <a href="/admin/security">Admin Security Page</a> |{' '}
        <a href="/admin/audit-logs">Audit Logs</a> |{' '}
        <a href="/admin/users">Admin Users</a>
      </p>

      <section style={{ border: '1px solid #ccc', padding: '12px', marginBottom: '16px' }}>
        <h2>Blocked Access Demo</h2>

        <p>
          This page creates a safe simulated denied-access event so the audit log can show
          how unauthorized or blocked behavior is recorded.
        </p>

        <button onClick={generateDeniedAccessEvent}>
          Generate denied-access test event
        </button>

        {message && <p>{message}</p>}
      </section>

      <section style={{ border: '1px solid #ccc', padding: '12px' }}>
        <h2>Demo Instructions</h2>
        <ol>
          <li>Click the button above.</li>
          <li>Open the Audit Logs page.</li>
          <li>Refresh audit logs.</li>
          <li>Look for ACCESS_DENIED_TEST.</li>
        </ol>
      </section>
    </main>
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

  if (window.location.pathname.startsWith('/admin/security-test')) {
    return <SecurityTestPage />;
  }

  return <Dashboard />;
}

createRoot(document.getElementById('root')!).render(<App />);