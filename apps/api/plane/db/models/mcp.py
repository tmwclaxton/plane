# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.conf import settings
from django.db import models

from .base import BaseModel


class McpOAuthClient(BaseModel):
    client_id = models.CharField(max_length=255, unique=True, db_index=True)
    client_secret = models.CharField(max_length=255, blank=True, default="")
    client_name = models.CharField(max_length=255, blank=True, default="")
    redirect_uris = models.JSONField(default=list)

    class Meta:
        db_table = "mcp_oauth_clients"
        verbose_name = "MCP OAuth Client"
        verbose_name_plural = "MCP OAuth Clients"
        ordering = ("-created_at",)


class McpOAuthCode(BaseModel):
    code = models.CharField(max_length=255, unique=True, db_index=True)
    client = models.ForeignKey(McpOAuthClient, on_delete=models.CASCADE, related_name="codes")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="mcp_oauth_codes")
    redirect_uri = models.TextField()
    code_challenge = models.CharField(max_length=255, blank=True, default="")
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "mcp_oauth_codes"
        verbose_name = "MCP OAuth Code"
        verbose_name_plural = "MCP OAuth Codes"
        ordering = ("-created_at",)


class McpOAuthGrant(BaseModel):
    refresh_token = models.CharField(max_length=255, unique=True, db_index=True)
    client = models.ForeignKey(McpOAuthClient, on_delete=models.CASCADE, related_name="grants")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="mcp_oauth_grants")
    expires_at = models.DateTimeField()

    class Meta:
        db_table = "mcp_oauth_grants"
        verbose_name = "MCP OAuth Grant"
        verbose_name_plural = "MCP OAuth Grants"
        ordering = ("-created_at",)
