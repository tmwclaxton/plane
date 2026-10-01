# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.authentication import SessionAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from plane.db.models import FileAsset, WorkspaceMember
from plane.settings.storage import S3Storage

from .auth import authenticate_mcp_token
from .settings import is_mcp_enabled, user_can_use_mcp
from .tools import ToolError, dispatch, tool_schemas


PROTOCOL_VERSION = "2024-11-05"


class CsrfExemptSessionAuthentication(SessionAuthentication):
    def enforce_csrf(self, request):
        return


@method_decorator(csrf_exempt, name="dispatch")
class McpEndpoint(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def _rpc(self, request_id, result=None, error=None, http_status=status.HTTP_200_OK):
        payload = {"jsonrpc": "2.0", "id": request_id}
        if error is not None:
            payload["error"] = error
        else:
            payload["result"] = result
        return Response(payload, status=http_status)

    def get(self, request):
        if not is_mcp_enabled():
            return Response({"error": "MCP is disabled."}, status=status.HTTP_404_NOT_FOUND)
        return Response({"name": "Plane", "mcp": True, "protocolVersion": PROTOCOL_VERSION})

    def post(self, request):
        if not is_mcp_enabled():
            return Response({"error": "MCP is disabled."}, status=status.HTTP_403_FORBIDDEN)

        payload = request.data if isinstance(request.data, dict) else {}
        request_id = payload.get("id")
        method = payload.get("method")
        params = payload.get("params") or {}

        if method in {None, "notifications/initialized", "notifications/cancelled"}:
            return Response(status=status.HTTP_204_NO_CONTENT)

        try:
            user, _token = authenticate_mcp_token(request.headers.get("Authorization"))
        except AuthenticationFailed as exc:
            return self._rpc(
                request_id,
                error={"code": -32001, "message": str(exc)},
                http_status=status.HTTP_401_UNAUTHORIZED,
            )

        if method == "initialize":
            return self._rpc(
                request_id,
                {
                    "protocolVersion": PROTOCOL_VERSION,
                    "capabilities": {"tools": {"listChanged": False}},
                    "serverInfo": {"name": "plane", "version": "1.0.0"},
                    "instructions": (
                        "Plane MCP. Tools run as the token user. "
                        "Call whoami first. Do not change God Mode, email, or auth settings."
                    ),
                },
            )

        if method == "ping":
            return self._rpc(request_id, {})

        if method == "tools/list":
            return self._rpc(request_id, {"tools": tool_schemas()})

        if method == "tools/call":
            name = params.get("name")
            if isinstance(name, str) and name.lower().startswith("admin"):
                return self._rpc(
                    request_id,
                    error={"code": -32003, "message": "Admin tools are not available over MCP."},
                    http_status=status.HTTP_403_FORBIDDEN,
                )
            try:
                result = dispatch(request, user, name, params.get("arguments") or {})
            except ToolError as exc:
                return self._rpc(
                    request_id,
                    {
                        "content": [{"type": "text", "text": exc.message}],
                        "isError": True,
                    },
                )
            except Exception as exc:
                return self._rpc(
                    request_id,
                    {
                        "content": [{"type": "text", "text": str(exc)}],
                        "isError": True,
                    },
                )
            return self._rpc(request_id, result)

        return self._rpc(
            request_id,
            error={"code": -32601, "message": f"Method not found: {method}"},
            http_status=status.HTTP_400_BAD_REQUEST,
        )


class PublicMcpFileEndpoint(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, asset_id):
        asset = FileAsset.objects.filter(
            id=asset_id,
            entity_type=FileAsset.EntityTypeContext.MCP_FILE,
            is_public=True,
            is_uploaded=True,
            is_deleted=False,
        ).first()
        if asset is None:
            return Response({"error": "File not found."}, status=status.HTTP_404_NOT_FOUND)
        return _redirect_asset(request, asset)


class PrivateMcpFileEndpoint(APIView):
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [AllowAny]

    def _user(self, request):
        if request.user and request.user.is_authenticated and user_can_use_mcp(request.user):
            return request.user
        user, _token = authenticate_mcp_token(request.headers.get("Authorization"))
        return user

    def get(self, request, asset_id):
        try:
            user = self._user(request)
        except AuthenticationFailed as exc:
            return Response({"error": str(exc)}, status=status.HTTP_401_UNAUTHORIZED)

        asset = FileAsset.objects.filter(
            id=asset_id,
            entity_type=FileAsset.EntityTypeContext.MCP_FILE,
            is_deleted=False,
        ).first()
        if asset is None:
            return Response({"error": "File not found."}, status=status.HTTP_404_NOT_FOUND)
        if not WorkspaceMember.objects.filter(workspace=asset.workspace, member=user, is_active=True).exists():
            return Response({"error": "You do not have access to this file."}, status=status.HTTP_403_FORBIDDEN)
        if not asset.is_uploaded:
            return Response({"error": "The requested asset could not be found."}, status=status.HTTP_404_NOT_FOUND)
        return _redirect_asset(request, asset)

    def post(self, request, asset_id):
        try:
            user = self._user(request)
        except AuthenticationFailed as exc:
            return Response({"error": str(exc)}, status=status.HTTP_401_UNAUTHORIZED)

        asset = FileAsset.objects.filter(
            id=asset_id,
            entity_type=FileAsset.EntityTypeContext.MCP_FILE,
            is_deleted=False,
            created_by=user,
        ).first()
        if asset is None:
            return Response({"error": "File not found."}, status=status.HTTP_404_NOT_FOUND)
        asset.is_uploaded = True
        asset.save(update_fields=["is_uploaded"])
        return Response({"id": str(asset.id), "is_uploaded": True}, status=status.HTTP_200_OK)


def _redirect_asset(request, asset):
    from django.http import HttpResponseRedirect

    storage = S3Storage(request=request)
    signed_url = storage.generate_presigned_url(object_name=asset.asset.name, disposition="attachment")
    if not signed_url:
        return Response({"error": "Could not generate a download URL."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    return HttpResponseRedirect(signed_url)
