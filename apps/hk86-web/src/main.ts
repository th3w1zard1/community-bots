/** Same permission integers as `scripts/discord-install-links.ts` (install URLs). */
const INSTALL_TRASK_PERMS = "84992";
/** Matches `HK_REACTION_BOT_PERMISSIONS` in hk-bot (Manage Roles + reactions + slash, etc.). */
const INSTALL_HK_PERMS = "2416266304";
const INSTALL_PAZAAK_PERMS = "19456";

function inviteHref(appId: string, permissions: string): string {
  const params = new URLSearchParams({
    client_id: appId,
    permissions,
    scope: "bot applications.commands",
  });
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

/** Canonical upstream (matches `origin`); forks override with `VITE_REPO_BASE_URL` at build time. */
const DEFAULT_REPO_BASE = "https://github.com/OpenKotOR/bots";
const repoBaseRaw = (import.meta.env.VITE_REPO_BASE_URL ?? "").trim();
const repoBase = (repoBaseRaw || DEFAULT_REPO_BASE).replace(/\/$/, "");

/** HK user guide lives on the wiki submodule (`community-bots.wiki`), not in repo `docs/guides`. */
const DEFAULT_WIKI_BASE = "https://github.com/OpenKotOR/community-bots/wiki";
const wikiBaseRaw = (import.meta.env.VITE_WIKI_BASE_URL ?? "").trim();
const wikiBase = (wikiBaseRaw || DEFAULT_WIKI_BASE).replace(/\/$/, "");

const wikiPage = (slug: string): string => `${wikiBase}/${slug.replace(/^\/+/, "")}`;
const HK_GUIDE_WIKI_SLUG = "docs/guides/hk-86";

function wireInvite(opts: {
  appId: string;
  inviteElId: string;
  missingElId: string;
  permissions: string;
  permLabelElId: string;
}): void {
  const inviteEl = document.getElementById(opts.inviteElId) as HTMLAnchorElement;
  const missingEl = document.getElementById(opts.missingElId);
  document.getElementById(opts.permLabelElId)!.textContent = opts.permissions;

  if (opts.appId) {
    inviteEl.href = inviteHref(opts.appId, opts.permissions);
    inviteEl.classList.remove("hidden");
  } else {
    missingEl?.classList.remove("hidden");
  }
}

const traskAppId = (import.meta.env.VITE_TRASK_DISCORD_APPLICATION_ID ?? "").trim();
const hkAppId = (
  import.meta.env.VITE_HK_DISCORD_APPLICATION_ID ??
  import.meta.env.VITE_DISCORD_APPLICATION_ID ??
  ""
).trim();
const pazaakAppId = (import.meta.env.VITE_PAZAAK_DISCORD_APPLICATION_ID ?? "").trim();

wireInvite({
  appId: traskAppId,
  inviteElId: "trask-invite",
  missingElId: "trask-invite-missing",
  permissions: INSTALL_TRASK_PERMS,
  permLabelElId: "trask-perms",
});

wireInvite({
  appId: hkAppId,
  inviteElId: "hk-invite",
  missingElId: "hk-invite-missing",
  permissions: INSTALL_HK_PERMS,
  permLabelElId: "hk-perms",
});

wireInvite({
  appId: pazaakAppId,
  inviteElId: "pazaak-invite",
  missingElId: "pazaak-invite-missing",
  permissions: INSTALL_PAZAAK_PERMS,
  permLabelElId: "pazaak-perms",
});

const blob = (path: string) => `${repoBase}/blob/main${path}`;
const guide = (path: string) => `${blob(path)}#quick-start`;

const pairs: Array<[string, string]> = [
  ["trask-docs", blob("/docs/guides/trask.md")],
  ["trask-quickstart", guide("/docs/guides/trask.md")],
  ["hk-docs", wikiPage(HK_GUIDE_WIKI_SLUG)],
  ["hk-quickstart", `${wikiPage(HK_GUIDE_WIKI_SLUG)}#quick-start`],
  ["hk-panels-json", blob("/apps/hk-bot/reaction-role-panels.example.json")],
  ["pazaak-docs", blob("/docs/guides/pazaak.md")],
  ["pazaak-quickstart", guide("/docs/guides/pazaak.md")],
];

for (const [id, href] of pairs) {
  const el = document.getElementById(id) as HTMLAnchorElement;
  el.href = href;
}
