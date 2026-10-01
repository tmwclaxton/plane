# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import os

from django.conf import settings

from plane.license.models import InstanceAdmin, InstanceConfiguration
from plane.license.utils.instance_value import get_configuration_value


MCP_TOKEN_LABEL = "MCP"


def request_origin(request) -> str:
    configured = getattr(settings, "APP_BASE_URL", None)
    if configured:
        return str(configured).rstrip("/")
    forwarded = request.headers.get("X-Forwarded-Proto")
    scheme = forwarded or request.scheme
    host = request.get_host()
    return f"{scheme}://{host}".rstrip("/")


def mcp_url(request) -> str:
    return f"{request_origin(request)}/mcp"


def _flag(key: str, default: str = "0") -> bool:
    (value,) = get_configuration_value([{"key": key, "default": os.environ.get(key, default)}])
    return str(value or "0") == "1"


def is_mcp_enabled() -> bool:
    return _flag("ENABLE_MCP")


def is_mcp_enabled_for_members() -> bool:
    return _flag("ENABLE_MCP_FOR_MEMBERS")


def is_instance_admin(user) -> bool:
    if user is None or getattr(user, "is_anonymous", True):
        return False
    return InstanceAdmin.objects.filter(user=user, role__gte=15).exists()


def user_can_use_mcp(user) -> bool:
    if not is_mcp_enabled():
        return False
    if is_instance_admin(user):
        return True
    return is_mcp_enabled_for_members()


def ensure_mcp_configuration() -> None:
    defaults = (
        ("ENABLE_MCP", "0", "MCP"),
        ("ENABLE_MCP_FOR_MEMBERS", "0", "MCP"),
    )
    for key, value, category in defaults:
        InstanceConfiguration.objects.get_or_create(
            key=key,
            defaults={"value": value, "category": category, "is_encrypted": False},
        )
