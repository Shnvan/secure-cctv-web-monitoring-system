-- Secure CCTV Web Monitoring System initial PostgreSQL schema
-- Starter schema. Review and migrate using a real migration tool before production.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email CITEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending','active','disabled','deleted')) DEFAULT 'pending',
    external_subject TEXT UNIQUE,
    mfa_required BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    disabled_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
);

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL CHECK (name IN ('super_admin','security_admin','viewer','auditor','camera_source')),
    description TEXT NOT NULL
);

CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES users(id),
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL
);

CREATE TABLE role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE cameras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    source_type TEXT NOT NULL CHECK (source_type IN ('phone_webrtc','rtsp_relay','onvif','nvr')) DEFAULT 'phone_webrtc',
    livekit_room TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('offline','online','disabled','maintenance')) DEFAULT 'offline',
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE camera_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN ('view','publish','manage')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES users(id),
    expires_at TIMESTAMPTZ,
    UNIQUE(user_id, camera_id, action)
);

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    external_session_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    source_ip INET,
    user_agent_hash TEXT,
    device_fingerprint_hash TEXT
);

CREATE TABLE stream_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL CHECK (purpose IN ('view','publish')),
    livekit_room TEXT NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    source_ip INET,
    user_agent_hash TEXT
);

CREATE TABLE audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_user_id UUID REFERENCES users(id),
    actor_email TEXT,
    actor_roles TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    result TEXT NOT NULL CHECK (result IN ('success','failure','denied','blocked')),
    reason_code TEXT,
    source_ip INET,
    user_agent_hash TEXT,
    session_id UUID REFERENCES sessions(id),
    request_id TEXT,
    correlation_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    previous_hash TEXT,
    event_hash TEXT NOT NULL
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_camera_grants_user_camera ON camera_grants(user_id, camera_id);
CREATE INDEX idx_sessions_user_active ON sessions(user_id, revoked_at, expires_at);
CREATE INDEX idx_stream_tokens_user_camera ON stream_tokens(user_id, camera_id, expires_at);
CREATE INDEX idx_audit_events_occurred_at ON audit_events(occurred_at DESC);
CREATE INDEX idx_audit_events_actor ON audit_events(actor_user_id, occurred_at DESC);
CREATE INDEX idx_audit_events_action ON audit_events(action, occurred_at DESC);

-- Seed roles and core permissions.
INSERT INTO roles (name, description) VALUES
('super_admin', 'Full administrative control for MVP'),
('security_admin', 'Manage camera access and security events'),
('viewer', 'View assigned cameras'),
('auditor', 'Read audit logs'),
('camera_source', 'Publish one assigned camera feed')
ON CONFLICT DO NOTHING;

INSERT INTO permissions (name, description) VALUES
('user.manage', 'Create, update, disable users'),
('role.manage', 'Assign and remove roles'),
('camera.view', 'View assigned camera'),
('camera.publish', 'Publish assigned camera source'),
('camera.manage', 'Configure cameras'),
('audit.read', 'Read audit logs'),
('security.configure', 'Change security configuration')
ON CONFLICT DO NOTHING;
