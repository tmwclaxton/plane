# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import status
from rest_framework.response import Response

from plane.db.models import APIToken
from plane.license.api.permissions import InstanceAdminPermission
from plane.license.models import InstanceConfiguration
from plane.mcp.connection import connection_guide
from plane.mcp.settings import (
    MCP_TOKEN_LABEL,
    ensure_mcp_configuration,
    is_mcp_enabled,
    is_mcp_enabled_for_members,
    mcp_url,
)
from plane.utils.cache import invalidate_cache

from .base import BaseAPIView


class InstanceMcpEndpoint(BaseAPIView):
    permission_classes = [InstanceAdminPermission]

    def get(self, request):
        ensure_mcp_configuration()
        token = (
            APIToken.objects.filter(user=request.user, label=MCP_TOKEN_LABEL, is_service=False, is_active=True)
            .order_by("-created_at")
            .first()
        )
        payload = connection_guide(mcp_url(request))
        payload.update(
            {
                "enable_mcp": is_mcp_enabled(),
                "enable_mcp_for_members": is_mcp_enabled_for_members(),
                "has_token": token is not None,
                "token": None,
            }
        )
        return Response(payload, status=status.HTTP_200_OK)

    @invalidate_cache(path="/api/instances/", user=False)
    @invalidate_cache(path="/api/instances/configurations/", user=False)
    def patch(self, request):
        ensure_mcp_configuration()
        updates = {}
        if "enable_mcp" in request.data:
            updates["ENABLE_MCP"] = "1" if request.data.get("enable_mcp") else "0"
        if "enable_mcp_for_members" in request.data:
            updates["ENABLE_MCP_FOR_MEMBERS"] = "1" if request.data.get("enable_mcp_for_members") else "0"
        if updates:
            rows = InstanceConfiguration.objects.filter(key__in=updates.keys())
            for row in rows:
                row.value = updates[row.key]
            InstanceConfiguration.objects.bulk_update(list(rows), ["value"], batch_size=10)

        token_value = None
        if request.data.get("rotate_token"):
            APIToken.objects.filter(user=request.user, label=MCP_TOKEN_LABEL, is_service=False).delete()
            token = APIToken.objects.create(label=MCP_TOKEN_LABEL, user=request.user, user_type=0)
            token_value = token.token

        payload = connection_guide(mcp_url(request))
        payload.update(
            {
                "enable_mcp": is_mcp_enabled(),
                "enable_mcp_for_members": is_mcp_enabled_for_members(),
                "has_token": token_value is not None
                or APIToken.objects.filter(user=request.user, label=MCP_TOKEN_LABEL, is_active=True).exists(),
                "token": token_value,
            }
        )
        return Response(payload, status=status.HTTP_200_OK)
