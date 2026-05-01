import os

os.environ['ENVIRONMENT'] = 'dev'
os.environ['DEV_AUTH_ENABLED'] = 'true'
os.environ['AUDIT_HMAC_KEY'] = 'test-key'

from fastapi.testclient import TestClient
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
