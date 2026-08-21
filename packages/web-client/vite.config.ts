// Copyright (C) 2024-2025 Guyutongxue
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import { defineConfig, type Plugin } from "vite";
import unoCss from "unocss/vite";
import solid from "vite-plugin-solid";
import babel from "@rollup/plugin-babel";
import { SERVER_HOST, WEB_CLIENT_BASE_PATH } from "@gi-tcg/config";
import { readdirSync } from "node:fs";

const AVATARS_BASE_PATH = "public/avatars";
const AVATARS = [...readdirSync(AVATARS_BASE_PATH)];

function serializeForHtml(value: unknown): string {
  return JSON.stringify(value).replace(
    /[<\u2028\u2029]/g,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

function injectAssetsManagerOptions(): Plugin {
  let serializedOptions: string;
  return {
    name: "inject-assets-manager-options",
    apply: "serve",
    async configResolved() {
      const serverHost = SERVER_HOST || "http://localhost:3000";
      const endpoint = new URL(
        `${WEB_CLIENT_BASE_PATH}api/assetsManagerOptions`,
        serverHost,
      );
      let response: Response;
      try {
        response = await fetch(endpoint);
      } catch (cause) {
        throw new Error(
          `Failed to fetch AssetsManager options from ${endpoint}. Is the server running?`,
          { cause },
        );
      }
      if (!response.ok) {
        throw new Error(
          `Failed to fetch AssetsManager options from ${endpoint}: ${response.status} ${response.statusText}`,
        );
      }
      serializedOptions = serializeForHtml(await response.json());
    },
    transformIndexHtml() {
      return [
        {
          tag: "script",
          attrs: {
            id: "assets-manager-options",
            type: "application/json",
          },
          children: serializedOptions,
          injectTo: "body-prepend",
        },
      ];
    },
  };
}

export default defineConfig({
  esbuild: {
    target: "ES2020",
  },
  base: WEB_CLIENT_BASE_PATH,
  plugins: [
    injectAssetsManagerOptions(),
    unoCss(),
    solid(),
    babel({
      babelHelpers: "bundled",
    }),
  ],
  define: {
    AVATARS: JSON.stringify(AVATARS),
  },
});
