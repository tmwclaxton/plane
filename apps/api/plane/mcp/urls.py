# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from .oauth import (
    OAuthAuthorizationServerEndpoint,
    OAuthAuthorizeEndpoint,
    OAuthMetadataEndpoint,
    OAuthRegisterEndpoint,
    OAuthTokenEndpoint,
)
from .views import McpEndpoint

urlpatterns = [
    path("mcp", McpEndpoint.as_view(), name="mcp"),
    path("mcp/", McpEndpoint.as_view(), name="mcp-slash"),
    path(".well-known/oauth-protected-resource", OAuthMetadataEndpoint.as_view(), name="mcp-oauth-resource"),
    path(".well-known/oauth-protected-resource/<path:resource>", OAuthMetadataEndpoint.as_view(), name="mcp-oauth-resource-path"),
    path(
        ".well-known/oauth-authorization-server",
        OAuthAuthorizationServerEndpoint.as_view(),
        name="mcp-oauth-server",
    ),
    path(
        ".well-known/oauth-authorization-server/<path:resource>",
        OAuthAuthorizationServerEndpoint.as_view(),
        name="mcp-oauth-server-path",
    ),
    path("oauth/register", OAuthRegisterEndpoint.as_view(), name="mcp-oauth-register"),
    path("oauth/authorize", OAuthAuthorizeEndpoint.as_view(), name="mcp-oauth-authorize"),
    path("oauth/token", OAuthTokenEndpoint.as_view(), name="mcp-oauth-token"),
]
