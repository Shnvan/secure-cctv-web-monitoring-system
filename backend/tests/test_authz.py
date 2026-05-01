import os

os.environ['ENVIRONMENT'] = 'dev'
os.environ['DEV_AUTH_ENABLED'] = 'true'
os.environ['AUDIT_HMAC_KEY'] = 'test-key'

from fastapi.testclient import TestClient
from app.audit import audit_logger
from app.main import app

client = TestClient(app)


def test_unknown_user_gets_404():
    response = client.get('/api/v1/me', headers={'x-dev-user': 'unknown@example.edu'})
    assert response.status_code == 404


def test_viewer_can_get_assigned_camera_token():
    response = client.post(
        '/api/v1/cameras/camera-1/stream-token',
        headers={'x-dev-user': 'viewer1@example.edu'},
        json={'purpose': 'view'},
    )
    assert response.status_code == 200
    assert response.json()['camera_id'] == 'camera-1'


def test_viewer_cannot_get_unassigned_camera_token():
    response = client.post(
        '/api/v1/cameras/camera-2/stream-token',
        headers={'x-dev-user': 'viewer1@example.edu'},
        json={'purpose': 'view'},
    )
    assert response.status_code in (403, 404)


def test_camera_source_cannot_view():
    response = client.post(
        '/api/v1/cameras/camera-1/stream-token',
        headers={'x-dev-user': 'camera1@example.edu'},
        json={'purpose': 'view'},
    )
    assert response.status_code in (403, 404)


def test_camera_source_can_publish_assigned_camera():
    response = client.post(
        '/api/v1/cameras/camera-1/publish-token',
        headers={'x-dev-user': 'camera1@example.edu'},
        json={'purpose': 'publish'},
    )
    assert response.status_code == 200


def test_viewer_cannot_list_admin_users():
    response = client.get('/api/v1/admin/users', headers={'x-dev-user': 'viewer1@example.edu'})
    assert response.status_code == 403


def test_camera_source_can_log_publisher_started_event():
    response = client.post(
        '/api/v1/cameras/camera-1/publisher-events',
        headers={'x-dev-user': 'camera1@example.edu'},
        json={'event': 'publisher_started', 'message': 'test publisher started'},
    )
    assert response.status_code == 200
    assert response.json()['action'] == 'CAMERA_PUBLISHER_STARTED'


def test_viewer_cannot_log_publisher_event_without_publish_grant():
    response = client.post(
        '/api/v1/cameras/camera-1/publisher-events',
        headers={'x-dev-user': 'viewer1@example.edu'},
        json={'event': 'publisher_started'},
    )
    assert response.status_code in (403, 404)


def test_invalid_publisher_event_is_rejected():
    response = client.post(
        '/api/v1/cameras/camera-1/publisher-events',
        headers={'x-dev-user': 'camera1@example.edu'},
        json={'event': 'not_a_real_event'},
    )
    assert response.status_code == 422


def test_publisher_failed_event_is_logged_as_failure():
    response = client.post(
        '/api/v1/cameras/camera-1/publisher-events',
        headers={'x-dev-user': 'camera1@example.edu'},
        json={'event': 'publisher_failed', 'message': 'simulated publisher failure'},
    )
    assert response.status_code == 200

    matching_events = [
        event
        for event in audit_logger.events
        if event.action == 'CAMERA_PUBLISHER_FAILED'
        and event.target_id == 'camera-1'
        and event.metadata.get('message') == 'simulated publisher failure'
    ]
    assert matching_events
    assert matching_events[-1].result == 'failure'
