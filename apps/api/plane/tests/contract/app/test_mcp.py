# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from io import BytesIO
from unittest.mock import patch
from uuid import uuid4

import pytest
from django.utils import timezone
from rest_framework import status

from plane.db.models import APIToken, FileAsset, Project, ProjectMember, User, Workspace, WorkspaceMember
from plane.license.models import Instance, InstanceAdmin, InstanceConfiguration
from plane.mcp.settings import ensure_mcp_configuration


def _rpc(method, params=None, request_id=1):
    return {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params or {}}


@pytest.fixture
def instance(db):
    existing = Instance.objects.first()
    if existing:
        return existing
    return Instance.objects.create(
        instance_name="Test Instance",
        instance_id=str(uuid4()),
        current_version="1.4.2",
        last_checked_at=timezone.now(),
        is_setup_done=True,
    )


@pytest.fixture
def instance_admin(db, create_user, instance):
    return InstanceAdmin.objects.create(user=create_user, instance=instance, role=20)


@pytest.fixture
def mcp_enabled(db):
    ensure_mcp_configuration()
    InstanceConfiguration.objects.filter(key="ENABLE_MCP").update(value="1")
    InstanceConfiguration.objects.filter(key="ENABLE_MCP_FOR_MEMBERS").update(value="0")


@pytest.fixture
def members_enabled(mcp_enabled):
    InstanceConfiguration.objects.filter(key="ENABLE_MCP_FOR_MEMBERS").update(value="1")


@pytest.fixture
def mcp_token(db, create_user):
    return APIToken.objects.create(user=create_user, label="MCP", token="plane_api_mcp_test_token")


@pytest.fixture
def member_user(db, workspace):
    user = User.objects.create(email="member@plane.so", first_name="Member", last_name="User")
    user.set_password("password")
    user.save()
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=15)
    return user


def _call(api_client, token, method, params=None):
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return api_client.post("/mcp", _rpc(method, params), format="json")


@pytest.mark.contract
@pytest.mark.django_db
def test_mcp_disabled_rejects_calls(api_client, mcp_token):
    ensure_mcp_configuration()
    InstanceConfiguration.objects.filter(key="ENABLE_MCP").update(value="0")
    response = _call(api_client, mcp_token.token, "initialize")
    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.contract
@pytest.mark.django_db
def test_bad_bearer_is_rejected(api_client, mcp_enabled):
    response = _call(api_client, "plane_api_invalid", "initialize")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.contract
@pytest.mark.django_db
def test_list_workspaces_matches_name_or_slug(api_client, mcp_enabled, instance_admin, mcp_token, workspace):
    listed = _call(api_client, mcp_token.token, "tools/call", {"name": "list_workspaces", "arguments": {}})
    assert listed.status_code == status.HTTP_200_OK
    rows = listed.data["result"]["structuredContent"]
    assert {"id": str(workspace.id), "name": workspace.name, "slug": workspace.slug} in rows

    queried = _call(
        api_client,
        mcp_token.token,
        "tools/call",
        {"name": "list_workspaces", "arguments": {"query": "Test"}},
    )
    assert queried.status_code == status.HTTP_200_OK
    assert queried.data["result"]["structuredContent"][0]["slug"] == workspace.slug

    by_name = _call(
        api_client,
        mcp_token.token,
        "tools/call",
        {"name": "get_workspace", "arguments": {"workspace": workspace.name}},
    )
    assert by_name.status_code == status.HTTP_200_OK
    assert by_name.data["result"]["structuredContent"]["slug"] == workspace.slug


@pytest.mark.contract
@pytest.mark.django_db
def test_bearer_whoami(api_client, mcp_enabled, instance_admin, mcp_token):
    response = _call(api_client, mcp_token.token, "tools/call", {"name": "whoami", "arguments": {}})
    assert response.status_code == status.HTTP_200_OK
    payload = response.data["result"]["structuredContent"]
    assert payload["email"] == mcp_token.user.email
    assert payload["is_instance_admin"] is True


@pytest.mark.contract
@pytest.mark.django_db
def test_member_cannot_use_mcp_until_enabled(api_client, mcp_enabled, workspace, member_user):
    token = APIToken.objects.create(user=member_user, label="MCP", token="plane_api_member_token")
    response = _call(api_client, token.token, "initialize")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.contract
@pytest.mark.django_db
def test_member_can_use_mcp_when_enabled(api_client, members_enabled, workspace, member_user):
    token = APIToken.objects.create(user=member_user, label="MCP", token="plane_api_member_token")
    response = _call(api_client, token.token, "initialize")
    assert response.status_code == status.HTTP_200_OK


@pytest.mark.contract
@pytest.mark.django_db
def test_member_cannot_update_inaccessible_project(api_client, members_enabled, workspace, member_user, create_user):
    project = Project.objects.create(
        name="Hidden",
        identifier="HID",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    token = APIToken.objects.create(user=member_user, label="MCP", token="plane_api_member_token")
    response = _call(
        api_client,
        token.token,
        "tools/call",
        {
            "name": "update_project",
            "arguments": {"workspace": workspace.slug, "project_id": str(project.id), "name": "Nope"},
        },
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.data["result"]["isError"] is True


@pytest.mark.contract
@pytest.mark.django_db
def test_instance_mcp_config_is_admin_only(session_client, create_user, instance):
    session_client.force_authenticate(user=create_user)
    response = session_client.get("/api/instances/mcp/")
    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.contract
@pytest.mark.django_db
def test_instance_admin_can_enable_mcp(session_client, create_user, instance_admin):
    session_client.force_authenticate(user=create_user)
    response = session_client.patch("/api/instances/mcp/", {"enable_mcp": True, "rotate_token": True}, format="json")
    assert response.status_code == status.HTTP_200_OK
    assert response.data["enable_mcp"] is True
    assert response.data["token"]


@pytest.mark.contract
@pytest.mark.django_db
def test_oauth_authorize_rejects_non_admin_when_members_off(session_client, create_user, mcp_enabled, instance):
    session_client.force_authenticate(user=create_user)
    response = session_client.get("/oauth/authorize?client_id=missing&redirect_uri=https://example.com")
    assert response.status_code == 403


@pytest.mark.contract
@pytest.mark.django_db
def test_private_file_download_rejected_without_auth(api_client, workspace, create_user):
    asset = FileAsset.objects.create(
        attributes={"name": "secret.txt", "type": "text/plain"},
        asset="mcp/secret.txt",
        user=create_user,
        workspace=workspace,
        entity_type=FileAsset.EntityTypeContext.MCP_FILE,
        is_public=False,
        is_uploaded=True,
        created_by=create_user,
    )
    response = api_client.get(f"/api/assets/v2/mcp/{asset.id}/")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.contract
@pytest.mark.django_db
def test_public_file_download_allowed_without_auth(api_client, workspace, create_user):
    asset = FileAsset.objects.create(
        attributes={"name": "open.txt", "type": "text/plain"},
        asset="mcp/open.txt",
        user=create_user,
        workspace=workspace,
        entity_type=FileAsset.EntityTypeContext.MCP_FILE,
        is_public=True,
        is_uploaded=True,
        created_by=create_user,
    )
    with patch("django.db.models.fields.files.FieldFile.open", return_value=BytesIO(b"hello")):
        response = api_client.get(f"/api/assets/v2/public/{asset.id}/open.txt")
    assert response.status_code == status.HTTP_200_OK
    assert response["Content-Type"].startswith("text/plain")
    assert b"hello" in response.content


@pytest.mark.contract
@pytest.mark.django_db
def test_complete_file_marks_upload_done(api_client, mcp_enabled, instance_admin, mcp_token, workspace):
    asset = FileAsset.objects.create(
        attributes={"name": "cover.webp", "type": "image/webp"},
        asset="mcp/cover.webp",
        user=mcp_token.user,
        workspace=workspace,
        entity_type=FileAsset.EntityTypeContext.MCP_FILE,
        is_public=True,
        is_uploaded=False,
        created_by=mcp_token.user,
    )
    response = _call(
        api_client,
        mcp_token.token,
        "tools/call",
        {"name": "complete_file", "arguments": {"workspace": workspace.slug, "file_id": str(asset.id)}},
    )
    assert response.status_code == status.HTTP_200_OK
    payload = response.data["result"]["structuredContent"]
    assert payload["is_uploaded"] is True
    asset.refresh_from_db()
    assert asset.is_uploaded is True


@pytest.mark.contract
@pytest.mark.django_db
def test_complete_url_works_without_login(api_client, workspace, create_user):
    asset = FileAsset.objects.create(
        attributes={"name": "cover.webp", "type": "image/webp"},
        asset="mcp/cover.webp",
        user=create_user,
        workspace=workspace,
        entity_type=FileAsset.EntityTypeContext.MCP_FILE,
        is_public=True,
        is_uploaded=False,
        created_by=create_user,
    )
    response = api_client.post(f"/api/assets/v2/mcp/{asset.id}/complete/")
    assert response.status_code == status.HTTP_200_OK
    assert response.data["is_uploaded"] is True
    asset.refresh_from_db()
    assert asset.is_uploaded is True
