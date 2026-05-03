/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** @deprecated Prefer `VITE_HK_DISCORD_APPLICATION_ID`; kept for existing Pages builds. */
  readonly VITE_DISCORD_APPLICATION_ID?: string;
  readonly VITE_HK_DISCORD_APPLICATION_ID?: string;
  readonly VITE_TRASK_DISCORD_APPLICATION_ID?: string;
  readonly VITE_PAZAAK_DISCORD_APPLICATION_ID?: string;
  readonly VITE_REPO_BASE_URL?: string;
  /** Wiki root for HK guide links (default `https://github.com/OpenKotOR/community-bots/wiki`). */
  readonly VITE_WIKI_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
