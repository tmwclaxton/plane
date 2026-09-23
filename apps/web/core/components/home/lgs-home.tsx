/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export function LgsHome() {
  return (
    <div className="mb-2 flex items-center gap-4 rounded-lg border border-subtle bg-surface-2 p-4">
      <img
        src="/lgs-brand/lgs-logo.png"
        alt=""
        className="size-14 shrink-0 object-contain sm:size-16"
      />
      <div className="min-w-0">
        <p className="text-14 font-medium text-primary">Let's Go Social</p>
        <p className="mt-1 text-13 leading-5 text-secondary">
          Meetup for people aged 20 to 35. Coffee, something active, then food. You do not have to know anyone already.
        </p>
      </div>
    </div>
  );
}
