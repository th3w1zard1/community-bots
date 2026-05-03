# pazaak-world

Discord Embedded App Activity for the Pazaak Bot. Runs inside a Discord Activity iframe using the
[@discord/embedded-app-sdk](https://github.com/discord/embedded-app-sdk), and talks to the
embedded HTTP/WebSocket server that runs inside the `pazaak-bot` process.

## Stack

- Vite 8 + React 19 + TypeScript
- Tailwind CSS v4 (via `@tailwindcss/vite`)
- `@discord/embedded-app-sdk` for OAuth2 and Activity lifecycle

## Development

```bash
# From repo root — starts the Vite dev server on http://localhost:5173
pnpm dev:pazaak-world
```

The dev server proxies `/api` and `/ws` to `http://localhost:4001`, which is the embedded API
server inside the running `pazaak-bot` process. Start the bot first:

```bash
pnpm --filter @openkotor/pazaak-bot dev
```

## Routes and Operator Console

- `/bots` renders the public Discord bots hub (invites, docs, Web UI links).
- `/community-bots` renders the OpenKOTOR Bots operator console (API probes, runbooks).
- `/bots/pazaakworld` renders the PazaakWorld game surface.
- The operator console can probe API targets, build `VITE_API_BASES`, copy endpoint snippets,
  export an OpenAPI-style sketch, filter bot surfaces, track readiness checks, and show setup or
  maintenance runbooks for the embedded API, Cloudflare Worker fallback, OAuth, Pages, and ingest
  worker flows.

For local multiplayer or signed API probes, run the Pazaak bot first so `http://localhost:4001`
is available, then use the console's Primary API origin field to select that target.

## Environment

Create `.env` (copy `.env.example`) and fill in:

```env
VITE_DISCORD_CLIENT_ID=<your Discord application ID>
```

## Account Sessions

The Activity now uses a Pazaak app session token for API calls. In Discord Activity mode,
`/api/auth/token` still exchanges the Discord OAuth2 code and returns the Discord access token
needed by the Embedded App SDK, but it also creates/returns an `app_token` backed by the bot API's
account repository. Existing Discord-linked wallets remain compatible because the bridge preserves
the Discord user ID as the legacy game identity during migration.

Standalone browser mode can use:

- `POST /api/auth/register` with `username`, optional `displayName`/`email`, and `password`.
- `POST /api/auth/login` with `identifier` and `password`.
- `GET /api/auth/session` with `Authorization: Bearer <app_token>`.
- `POST /api/auth/logout` with `Authorization: Bearer <app_token>`.

The first implementation stores this bridge in `accounts.json` next to the existing Pazaak JSON
repositories while the new Drizzle schema is introduced. The production target is PostgreSQL via the
schema exports in `@openkotor/persistence`.

## Build

```bash
pnpm --filter pazaak-world build
```

Deploy `dist/` to any static host. The canonical production URL is
`https://openkotor.github.io/bots/pazaakworld`; register that URL in the Discord Developer Portal
(Activities -> URL Mappings) and use it for `PAZAAK_ACTIVITY_URL` plus `PAZAAK_PUBLIC_WEB_ORIGIN`.

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
