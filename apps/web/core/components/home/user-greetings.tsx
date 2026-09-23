/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IUser } from "@plane/types";

export interface IUserGreetingsView {
  user: IUser;
}

export function UserGreetingsView(props: IUserGreetingsView) {
  const { user } = props;
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() || user?.display_name || "you";

  return (
    <div className="my-6 flex flex-col items-center">
      <h2 className="text-center text-20 font-semibold">
        Thank you {name}, for keeping Let&apos;s Go Social running 🙏
      </h2>
    </div>
  );
}
