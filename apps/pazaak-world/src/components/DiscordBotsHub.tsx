import { useEffect } from "react";
import "./discordBotsHub.css";

/** Matches `scripts/discord-install-links.ts` permission integers. */
const INSTALL_TRASK_PERMS = "84992";
const INSTALL_HK_PERMS = "268454912";
const INSTALL_PAZAAK_PERMS = "19456";

const DEFAULT_REPO_BASE = "https://github.com/OpenKotOR/bots";
const DEFAULT_WIKI_BASE = "https://github.com/OpenKotOR/community-bots/wiki";
const HK_GUIDE_WIKI_SLUG = "docs/guides/hk-86";

function inviteHref(appId: string, permissions: string): string {
  const params = new URLSearchParams({
    client_id: appId,
    permissions,
    scope: "bot applications.commands",
  });
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

function trimEnv(value: string | undefined): string {
  return (value ?? "").trim();
}

function pagesDeployRoot(): string {
  if (import.meta.env.PROD) {
    const base = import.meta.env.BASE;
    const pathOnly = base === "/" ? "" : base.replace(/\/$/, "");
    return `${window.location.origin}${pathOnly}/`;
  }
  return "https://openkotor.github.io/bots/";
}

export function DiscordBotsHub() {
  useEffect(() => {
    document.title = "OpenKotOR — Discord bots";
  }, []);

  const repoBase = trimEnv(import.meta.env.VITE_REPO_BASE_URL).replace(/\/$/, "") || DEFAULT_REPO_BASE;
  const wikiBase = trimEnv(import.meta.env.VITE_WIKI_BASE_URL).replace(/\/$/, "") || DEFAULT_WIKI_BASE;

  const traskAppId = trimEnv(import.meta.env.VITE_TRASK_DISCORD_APPLICATION_ID);
  const hkAppId =
    trimEnv(import.meta.env.VITE_HK_DISCORD_APPLICATION_ID) ||
    trimEnv(import.meta.env.VITE_DISCORD_APPLICATION_ID);
  const pazaakAppId = trimEnv(import.meta.env.VITE_PAZAAK_DISCORD_APPLICATION_ID);

  const blob = (path: string) => `${repoBase}/blob/main${path}`;
  const guide = (path: string) => `${blob(path)}#quick-start`;
  const wikiPage = (slug: string) => `${wikiBase}/${slug.replace(/^\/+/, "")}`;

  const webRoot = pagesDeployRoot();
  const traskWebUiHref = `${webRoot}qa-webui/`;
  const pazaakWebUiHref = `${webRoot}pazaakworld`;

  const operatorConsoleHref = `${webRoot.replace(/\/$/, "")}/community-bots`;

  return (
    <div className="discord-bots-hub">
      <div className="discord-bots-hub__wrap">
        <header className="discord-bots-hub__hero">
          <p className="discord-bots-hub__eyebrow">OpenKotOR · Discord bots</p>
          <h1 className="discord-bots-hub__title">Discord bots</h1>
          <p className="discord-bots-hub__lede">
            Invite links, documentation, and quick-start anchors for every Discord bot in this repo. OAuth URLs use the same permission integers as{" "}
            <code>scripts/discord-install-links.ts</code>
            {" "}— set each bot&apos;s application ID at build time so &quot;Invite to server&quot; stays live.
          </p>
        </header>

        <main className="discord-bots-hub__grid">
          {/* Trask */}
          <section className="discord-bots-hub__card" aria-labelledby="hub-trask-title">
            <div>
              <h2 id="hub-trask-title">Trask</h2>
              <p className="discord-bots-hub__tagline">
                KOTOR Q&amp;A with citations — use <code>/ask</code> in Discord.
              </p>
            </div>
            <ul className="discord-bots-hub__actions">
              <li>
                {traskAppId ? (
                  <a
                    className="discord-bots-hub__btn discord-bots-hub__btn--primary"
                    href={inviteHref(traskAppId, INSTALL_TRASK_PERMS)}
                    rel="noopener noreferrer"
                  >
                    Invite to server
                  </a>
                ) : (
                  <span className="discord-bots-hub__btn discord-bots-hub__btn--primary discord-bots-hub__btn--disabled">Invite to server</span>
                )}
              </li>
              <li>
                <a className="discord-bots-hub__btn discord-bots-hub__btn--ghost" href={blob("/docs/guides/trask.md")} rel="noopener noreferrer">
                  Documentation
                </a>
              </li>
              <li>
                <a className="discord-bots-hub__btn discord-bots-hub__btn--ghost" href={guide("/docs/guides/trask.md")} rel="noopener noreferrer">
                  Quick start
                </a>
              </li>
              <li>
                <a className="discord-bots-hub__btn discord-bots-hub__btn--ghost" href={traskWebUiHref} rel="noopener noreferrer">
                  Holocron Archive
                </a>
              </li>
            </ul>
            {!traskAppId ? (
              <p className="discord-bots-hub__callout">
                Set <code>VITE_TRASK_DISCORD_APPLICATION_ID</code> at build time (or GitHub Actions variable <code>TRASK_DISCORD_APP_ID</code>) for the invite URL.
              </p>
            ) : null}
            <p className="discord-bots-hub__perms">
              Permissions: <code>{INSTALL_TRASK_PERMS}</code>
            </p>
          </section>

          {/* HK-86 */}
          <section className="discord-bots-hub__card" aria-labelledby="hub-hk-title">
            <div>
              <h2 id="hub-hk-title">HK-86</h2>
              <p className="discord-bots-hub__tagline">
                Curated self-assignable roles — <code>/designations</code> and optional reaction panels.
              </p>
            </div>
            <ul className="discord-bots-hub__actions">
              <li>
                {hkAppId ? (
                  <a
                    className="discord-bots-hub__btn discord-bots-hub__btn--primary"
                    href={inviteHref(hkAppId, INSTALL_HK_PERMS)}
                    rel="noopener noreferrer"
                  >
                    Invite to server
                  </a>
                ) : (
                  <span className="discord-bots-hub__btn discord-bots-hub__btn--primary discord-bots-hub__btn--disabled">Invite to server</span>
                )}
              </li>
              <li>
                <a className="discord-bots-hub__btn discord-bots-hub__btn--ghost" href={wikiPage(HK_GUIDE_WIKI_SLUG)} rel="noopener noreferrer">
                  Documentation
                </a>
              </li>
              <li>
                <a
                  className="discord-bots-hub__btn discord-bots-hub__btn--ghost"
                  href={`${wikiPage(HK_GUIDE_WIKI_SLUG)}#quick-start`}
                  rel="noopener noreferrer"
                >
                  Quick start
                </a>
              </li>
            </ul>
            <p className="discord-bots-hub__extra">
              <a className="discord-bots-hub__text-link" href={blob("/apps/hk-bot/reaction-role-panels.example.json")} rel="noopener noreferrer">
                Reaction panels example JSON
              </a>
            </p>
            {!hkAppId ? (
              <p className="discord-bots-hub__callout">
                Set <code>VITE_HK_DISCORD_APPLICATION_ID</code> or <code>VITE_DISCORD_APPLICATION_ID</code> (or variable <code>HK86_DISCORD_APP_ID</code>) for the invite URL.
              </p>
            ) : null}
            <p className="discord-bots-hub__perms">
              Permissions: <code>{INSTALL_HK_PERMS}</code>
            </p>
            <p className="discord-bots-hub__note">
              Reaction-panel-only installs use <code>2416266304</code>; run <code>/designations reactions help</code> in Discord for that OAuth link.
            </p>
            <details className="discord-bots-hub__details">
              <summary>Operator checklist (reaction panels)</summary>
              <ol className="discord-bots-hub__steps">
                <li>
                  Put <code>reaction-role-panels.json</code> under the HK data directory (default <code>data/hk-bot/</code>; override with <code>HK_DATA_DIR</code>). Hot reload on file change.
                </li>
                <li>
                  Run <code>/designations reactions help</code> in Discord for the full setup embed.
                </li>
                <li>
                  Use <code>/designations reactions status</code> (Manage Server) to verify config.
                </li>
              </ol>
            </details>
          </section>

          {/* Pazaak */}
          <section className="discord-bots-hub__card" aria-labelledby="hub-pazaak-title">
            <div>
              <h2 id="hub-pazaak-title">Pazaak Bot</h2>
              <p className="discord-bots-hub__tagline">
                Pazaak tables, wallets, and challenges — <code>/pazaak</code> commands.
              </p>
            </div>
            <ul className="discord-bots-hub__actions">
              <li>
                {pazaakAppId ? (
                  <a
                    className="discord-bots-hub__btn discord-bots-hub__btn--primary"
                    href={inviteHref(pazaakAppId, INSTALL_PAZAAK_PERMS)}
                    rel="noopener noreferrer"
                  >
                    Invite to server
                  </a>
                ) : (
                  <span className="discord-bots-hub__btn discord-bots-hub__btn--primary discord-bots-hub__btn--disabled">Invite to server</span>
                )}
              </li>
              <li>
                <a className="discord-bots-hub__btn discord-bots-hub__btn--ghost" href={blob("/docs/guides/pazaak.md")} rel="noopener noreferrer">
                  Documentation
                </a>
              </li>
              <li>
                <a className="discord-bots-hub__btn discord-bots-hub__btn--ghost" href={guide("/docs/guides/pazaak.md")} rel="noopener noreferrer">
                  Quick start
                </a>
              </li>
              <li>
                <a className="discord-bots-hub__btn discord-bots-hub__btn--ghost" href={pazaakWebUiHref} rel="noopener noreferrer">
                  Main menu &amp; lobby
                </a>
              </li>
            </ul>
            {!pazaakAppId ? (
              <p className="discord-bots-hub__callout">
                Set <code>VITE_PAZAAK_DISCORD_APPLICATION_ID</code> at build time (or GitHub Actions variable <code>PAZAAK_DISCORD_APP_ID</code>) for the invite URL.
              </p>
            ) : null}
            <p className="discord-bots-hub__perms">
              Permissions: <code>{INSTALL_PAZAAK_PERMS}</code>
            </p>
          </section>
        </main>

        <footer className="discord-bots-hub__foot">
          <span>
            Static hub served from GitHub Pages under <code>/bots/</code>. HK operator WebUI remains under <code>/bots/hk86/</code>. Ingest worker is not a Discord bot — it has no invite here.
          </span>
          <p className="discord-bots-hub__console-link">
            <a href={operatorConsoleHref}>Operator console</a> (API probes, deploy notes) lives at <code>/community-bots</code>.
          </p>
        </footer>
      </div>
    </div>
  );
}
