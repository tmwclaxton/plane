# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed

from plane.db.models import APIToken

from .settings import user_can_use_mcp


def authenticate_mcp_token(token: str | None):
    if not token:
        raise AuthenticationFailed("Pass Authorization: Bearer <token>.")

    raw = token.removeprefix("Bearer ").strip() if token.startswith("Bearer ") else token.strip()
    try:
        api_token = APIToken.objects.get(
            Q(Q(expired_at__gt=timezone.now()) | Q(expired_at__isnull=True)),
            token=raw,
            is_active=True,
            user__is_active=True,
        )
    except APIToken.DoesNotExist as exc:
        raise AuthenticationFailed("Given API token is not valid") from exc

    api_token.last_used = timezone.now()
    api_token.save(update_fields=["last_used"])

    if not user_can_use_mcp(api_token.user):
        raise AuthenticationFailed("MCP is not enabled for this user.")

    return api_token.user, api_token
