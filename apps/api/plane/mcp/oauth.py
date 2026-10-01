# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import base64
import hashlib
import secrets
from datetime import timedelta
from urllib.parse import urlencode
from uuid import uuid4

from django.http import HttpResponse, HttpResponseRedirect
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.utils.html import escape
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from plane.authentication.session import BaseSessionAuthentication
from plane.db.models import APIToken, McpOAuthClient, McpOAuthCode, McpOAuthGrant

from .settings import MCP_TOKEN_LABEL, is_mcp_enabled, mcp_url, request_origin, user_can_use_mcp
from .views import CsrfExemptSessionAuthentication


class OAuthMetadataEndpoint(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, resource=None):
        origin = request_origin(request)
        return Response(
            {
                "resource": mcp_url(request),
                "authorization_servers": [origin],
                "bearer_methods_supported": ["header"],
                "scopes_supported": ["mcp"],
            }
        )


class OAuthAuthorizationServerEndpoint(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, resource=None):
        origin = request_origin(request)
        return Response(
            {
                "issuer": origin,
                "authorization_endpoint": f"{origin}/oauth/authorize",
                "token_endpoint": f"{origin}/oauth/token",
                "registration_endpoint": f"{origin}/oauth/register",
                "response_types_supported": ["code"],
                "grant_types_supported": ["authorization_code", "refresh_token"],
                "code_challenge_methods_supported": ["S256"],
                "token_endpoint_auth_methods_supported": ["none", "client_secret_post"],
                "scopes_supported": ["mcp"],
            }
        )


@method_decorator(csrf_exempt, name="dispatch")
class OAuthRegisterEndpoint(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        if not is_mcp_enabled():
            return Response({"error": "MCP is disabled."}, status=status.HTTP_403_FORBIDDEN)
        redirect_uris = request.data.get("redirect_uris") or []
        if not isinstance(redirect_uris, list) or not redirect_uris:
            return Response({"error": "redirect_uris is required."}, status=status.HTTP_400_BAD_REQUEST)
        client = McpOAuthClient.objects.create(
            client_id=uuid4().hex,
            client_secret=secrets.token_urlsafe(32),
            client_name=request.data.get("client_name") or "MCP client",
            redirect_uris=redirect_uris,
        )
        return Response(
            {
                "client_id": client.client_id,
                "client_secret": client.client_secret,
                "client_name": client.client_name,
                "redirect_uris": client.redirect_uris,
                "grant_types": ["authorization_code", "refresh_token"],
                "response_types": ["code"],
                "token_endpoint_auth_method": "none",
            },
            status=status.HTTP_201_CREATED,
        )


@method_decorator(csrf_exempt, name="dispatch")
class OAuthAuthorizeEndpoint(APIView):
    authentication_classes = [BaseSessionAuthentication]
    permission_classes = [AllowAny]

    def get(self, request):
        if not request.user.is_authenticated:
            next_url = request.get_full_path()
            return HttpResponseRedirect(f"/?next={next_url}")
        if not user_can_use_mcp(request.user):
            return HttpResponse("MCP is not enabled for this user.", status=403)
        client_id = request.GET.get("client_id", "")
        redirect_uri = request.GET.get("redirect_uri", "")
        state = request.GET.get("state", "")
        challenge = request.GET.get("code_challenge", "")
        client = McpOAuthClient.objects.filter(client_id=client_id).first()
        if client is None or redirect_uri not in (client.redirect_uris or []):
            return HttpResponse("Unknown OAuth client or redirect URI.", status=400)
        return HttpResponse(
            _authorize_html(client.client_name, client_id, redirect_uri, state, challenge),
            content_type="text/html",
        )

    def post(self, request):
        if not request.user.is_authenticated or not user_can_use_mcp(request.user):
            return HttpResponse("MCP is not enabled for this user.", status=403)
        client_id = request.POST.get("client_id") or request.data.get("client_id")
        redirect_uri = request.POST.get("redirect_uri") or request.data.get("redirect_uri")
        state = request.POST.get("state") or request.data.get("state") or ""
        challenge = request.POST.get("code_challenge") or request.data.get("code_challenge") or ""
        client = McpOAuthClient.objects.filter(client_id=client_id).first()
        if client is None or redirect_uri not in (client.redirect_uris or []):
            return HttpResponse("Unknown OAuth client or redirect URI.", status=400)
        code = secrets.token_urlsafe(32)
        McpOAuthCode.objects.create(
            code=code,
            client=client,
            user=request.user,
            redirect_uri=redirect_uri,
            code_challenge=challenge,
            expires_at=timezone.now() + timedelta(minutes=10),
        )
        separator = "&" if "?" in redirect_uri else "?"
        query = urlencode({"code": code, "state": state})
        return HttpResponseRedirect(f"{redirect_uri}{separator}{query}")


@method_decorator(csrf_exempt, name="dispatch")
class OAuthTokenEndpoint(APIView):
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [AllowAny]

    def post(self, request):
        if not is_mcp_enabled():
            return Response({"error": "MCP is disabled."}, status=status.HTTP_403_FORBIDDEN)
        grant_type = request.data.get("grant_type")
        if grant_type == "refresh_token":
            return self._refresh(request)
        if grant_type != "authorization_code":
            return Response({"error": "unsupported_grant_type"}, status=status.HTTP_400_BAD_REQUEST)

        code = request.data.get("code")
        redirect_uri = request.data.get("redirect_uri")
        verifier = request.data.get("code_verifier")
        record = McpOAuthCode.objects.filter(code=code, used_at__isnull=True).select_related("client", "user").first()
        if record is None or record.expires_at < timezone.now():
            return Response({"error": "invalid_grant"}, status=status.HTTP_400_BAD_REQUEST)
        if record.redirect_uri != redirect_uri:
            return Response({"error": "invalid_grant"}, status=status.HTTP_400_BAD_REQUEST)
        if record.code_challenge:
            digest = hashlib.sha256((verifier or "").encode()).digest()
            expected = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
            if expected != record.code_challenge:
                return Response({"error": "invalid_grant"}, status=status.HTTP_400_BAD_REQUEST)
        if not user_can_use_mcp(record.user):
            return Response({"error": "access_denied"}, status=status.HTTP_403_FORBIDDEN)

        record.used_at = timezone.now()
        record.save(update_fields=["used_at"])
        return Response(_issue_tokens(record.client, record.user))

    def _refresh(self, request):
        grant = (
            McpOAuthGrant.objects.filter(refresh_token=request.data.get("refresh_token"))
            .select_related("client", "user")
            .first()
        )
        if grant is None or grant.expires_at < timezone.now():
            return Response({"error": "invalid_grant"}, status=status.HTTP_400_BAD_REQUEST)
        if not user_can_use_mcp(grant.user):
            return Response({"error": "access_denied"}, status=status.HTTP_403_FORBIDDEN)
        grant.delete()
        return Response(_issue_tokens(grant.client, grant.user))


def _issue_tokens(client, user) -> dict:
    api_token = APIToken.objects.create(label=f"{MCP_TOKEN_LABEL} OAuth", user=user, user_type=0)
    refresh = secrets.token_urlsafe(32)
    McpOAuthGrant.objects.create(
        refresh_token=refresh,
        client=client,
        user=user,
        expires_at=timezone.now() + timedelta(days=30),
    )
    return {
        "access_token": api_token.token,
        "token_type": "Bearer",
        "expires_in": 86400 * 30,
        "refresh_token": refresh,
        "scope": "mcp",
    }


def _authorize_html(client_name, client_id, redirect_uri, state, challenge) -> str:
    return f"""<!doctype html>
<html><body style="font-family:sans-serif;max-width:32rem;margin:4rem auto">
<h1>Connect to Plane MCP</h1>
<p>{escape(client_name or "An MCP client")} wants to use Plane as you.</p>
<form method="post">
<input type="hidden" name="client_id" value="{escape(client_id)}" />
<input type="hidden" name="redirect_uri" value="{escape(redirect_uri)}" />
<input type="hidden" name="state" value="{escape(state)}" />
<input type="hidden" name="code_challenge" value="{escape(challenge)}" />
<button type="submit">Allow</button>
</form>
</body></html>"""
