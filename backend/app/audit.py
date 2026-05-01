from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import datetime, timezone
import hashlib
import hmac
import json
import uuid
from typing import Any

from .settings import settings


@dataclass
class AuditEvent:
    id: str
    occurred_at: str
    actor_email: str | None
    actor_roles: list[str]
    action: str
    target_type: str | None
    target_id: str | None
    result: str
    reason_code: str | None
    source_ip: str | None
    user_agent_hash: str | None
    request_id: str | None
    metadata: dict[str, Any]
    previous_hash: str | None
    event_hash: str


class AuditLogger:
    def __init__(self) -> None:
        self.events: list[AuditEvent] = []

    def _hash_user_agent(self, user_agent: str | None) -> str | None:
        if not user_agent:
            return None
        return hashlib.sha256(user_agent.encode('utf-8')).hexdigest()

    def log(
        self,
        *,
        action: str,
        result: str,
        actor_email: str | None = None,
        actor_roles: list[str] | None = None,
        target_type: str | None = None,
        target_id: str | None = None,
        reason_code: str | None = None,
        source_ip: str | None = None,
        user_agent: str | None = None,
        request_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> AuditEvent:
        previous_hash = self.events[-1].event_hash if self.events else None
        base = {
            'id': str(uuid.uuid4()),
            'occurred_at': datetime.now(timezone.utc).isoformat(),
            'actor_email': actor_email,
            'actor_roles': actor_roles or [],
            'action': action,
            'target_type': target_type,
            'target_id': target_id,
            'result': result,
            'reason_code': reason_code,
            'source_ip': source_ip,
            'user_agent_hash': self._hash_user_agent(user_agent),
            'request_id': request_id,
            'metadata': metadata or {},
            'previous_hash': previous_hash,
        }
        canonical = json.dumps(base, sort_keys=True, separators=(',', ':'))
        event_hash = hmac.new(
            settings.audit_hmac_key.encode('utf-8'),
            canonical.encode('utf-8'),
            hashlib.sha256,
        ).hexdigest()
        event = AuditEvent(event_hash=event_hash, **base)
        self.events.append(event)
        return event

    def verify_chain(self) -> bool:
        previous_hash: str | None = None
        for event in self.events:
            data = asdict(event)
            event_hash = data.pop('event_hash')
            if data['previous_hash'] != previous_hash:
                return False
            canonical = json.dumps(data, sort_keys=True, separators=(',', ':'))
            expected = hmac.new(
                settings.audit_hmac_key.encode('utf-8'),
                canonical.encode('utf-8'),
                hashlib.sha256,
            ).hexdigest()
            if not hmac.compare_digest(event_hash, expected):
                return False
            previous_hash = event_hash
        return True


audit_logger = AuditLogger()
