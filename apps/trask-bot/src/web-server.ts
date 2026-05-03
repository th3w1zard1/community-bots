import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { TraskBotConfig } from "@openkotor/config";
import type { Logger } from "@openkotor/core";
import {
  buildSocialAuthAuthorizeUrl,
  createNodeApiHost,
  extractBearerToken,
  fetchDiscordSocialAuthProfile,
} from "@openkotor/platform";
import {
  createTraskHttpRouter,
  type TraskHttpAuth,
  type TraskHttpRuntime,
  type TraskHttpSessionDto,
} from "@openkotor/trask-http";
import cookieParser from "cookie-parser";
import express, { type Request, type Response } from "express";
import { SignJWT, jwtVerify } from "jose";

const SESSION_COOKIE = "trask_web_session";
const OAUTH_STATE_COOKIE = "trask_oauth_state";

export interface EmbeddedTraskWebOptions {
  config: TraskBotConfig;
  runtime: TraskHttpRuntime;
  logger: Logger;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");

const createWebAuth = (
  config: TraskBotConfig,
  sessionSecretKey: Uint8Array | null,
): TraskHttpAuth<{ id: string; persistQueries?: boolean }> => ({
  requireAuth: (handler) => async (req: Request, res: Response) => {
    if (sessionSecretKey) {
      const token = req.cookies?.[SESSION_COOKIE];
      if (typeof token === "string" && token.length > 0) {
        try {
          const { payload } = await jwtVerify(token, sessionSecretKey);
          const sub = typeof payload.sub === "string" ? payload.sub : "";
          if (sub) {
            await handler(req, res, { id: sub, persistQueries: true });
            return;
          }
        } catch {
          /* fall through */
        }
      }
    }

    if (config.webApiKey) {
      const bearer = extractBearerToken(req.headers.authorization);
      const headerKey =
        typeof req.headers["x-trask-api-key"] === "string" ? req.headers["x-trask-api-key"].trim() : undefined;
      const ok = bearer === config.webApiKey || headerKey === config.webApiKey;
      if (!ok) {
        res.status(401).json({ error: "Invalid or missing API key." });
        return;
      }
      await handler(req, res, { id: config.webDefaultUserId, persistQueries: true });
      return;
    }

    if (config.webAllowAnonymous) {
      await handler(req, res, { id: config.webDefaultUserId, persistQueries: false });
      return;
    }

    res.status(401).json({
      error:
        "Sign in with Discord (Holocron), or set TRASK_WEB_API_KEY / TRASK_WEB_ALLOW_ANONYMOUS=1 for local development.",
    });
  },
});

export const startEmbeddedTraskWebUi = (
  options: EmbeddedTraskWebOptions,
): { stop: () => Promise<void> } | undefined => {
  const { config, runtime, logger } = options;

  if (!config.webPort) {
    return undefined;
  }

  const trimmedSecret = config.webSessionSecret?.trim();
  const sessionSecretKey = trimmedSecret ? new TextEncoder().encode(trimmedSecret) : null;

  const oauthReady = Boolean(
    sessionSecretKey &&
      config.webOAuthRedirectUri?.trim() &&
      config.discord.clientSecret?.trim(),
  );

  const app = express();
  app.use(cookieParser());
  app.use(express.json());

  const getSession = async (req: Request): Promise<TraskHttpSessionDto> => {
    if (!sessionSecretKey) {
      return { loggedIn: false, oauthAvailable: false };
    }

    const oauthAvailable = oauthReady;

    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== "string" || token.length === 0) {
      return { loggedIn: false, oauthAvailable };
    }

    try {
      const { payload } = await jwtVerify(token, sessionSecretKey);
      const sub = typeof payload.sub === "string" ? payload.sub : "";
      if (!sub) {
        return { loggedIn: false, oauthAvailable };
      }
      const username = typeof payload.username === "string" ? payload.username : "";
      const displayName = typeof payload.displayName === "string" ? payload.displayName : username;
      return {
        loggedIn: true,
        oauthAvailable,
        discord: { id: sub, username, displayName },
      };
    } catch {
      return { loggedIn: false, oauthAvailable };
    }
  };

  const onLogout = (_req: Request, res: Response): void => {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.status(204).end();
  };

  if (oauthReady && sessionSecretKey) {
    const redirectUri = config.webOAuthRedirectUri!.trim();
    const clientSecret = config.discord.clientSecret!.trim();

    app.get("/api/trask/auth/discord/start", (_req: Request, res: Response) => {
      const state = randomUUID();
      res.cookie(OAUTH_STATE_COOKIE, state, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 600_000,
        path: "/",
      });
      const url = buildSocialAuthAuthorizeUrl("discord", {
        clientId: config.discord.appId,
        redirectUri,
        state,
      });
      res.redirect(302, url);
    });

    app.get("/api/trask/auth/discord/callback", async (req: Request, res: Response) => {
      try {
        const state = typeof req.query.state === "string" ? req.query.state : "";
        const code = typeof req.query.code === "string" ? req.query.code : "";
        const saved = req.cookies?.[OAUTH_STATE_COOKIE];
        res.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });

        if (!state || !code || !saved || state !== saved) {
          res.status(400).send("Invalid OAuth state.");
          return;
        }

        const profile = await fetchDiscordSocialAuthProfile(code, {
          clientId: config.discord.appId,
          clientSecret,
          redirectUri,
        });

        const jwt = await new SignJWT({
          username: profile.username,
          displayName: profile.displayName,
        })
          .setProtectedHeader({ alg: "HS256" })
          .setSubject(profile.providerUserId)
          .setExpirationTime("30d")
          .sign(sessionSecretKey);

        const secure = process.env.NODE_ENV === "production";
        res.cookie(SESSION_COOKIE, jwt, {
          httpOnly: true,
          sameSite: "lax",
          secure,
          maxAge: 30 * 24 * 60 * 60 * 1000,
          path: "/",
        });
        res.redirect(302, "/");
      } catch (error) {
        logger.error(
          "Discord OAuth callback failed.",
          error instanceof Error ? error : { error: String(error) },
        );
        res.status(500).send("Discord sign-in failed.");
      }
    });
  } else if (config.webPort) {
    logger.warn("Holocron Discord OAuth disabled (need TRASK_SESSION_SECRET, TRASK_WEB_OAUTH_REDIRECT_URI, TRASK_DISCORD_CLIENT_SECRET).");
  }

  app.use(
    "/api/trask",
    createTraskHttpRouter({
      runtime,
      auth: createWebAuth(config, sessionSecretKey),
      getSession,
      onLogout,
    }),
  );

  const distFromEnv = process.env.TRASK_WEBUI_DIST_PATH?.trim();
  const defaultDist = path.join(repoRoot, "apps", "holocron-web", "dist");
  const webUiDist = distFromEnv ? path.resolve(distFromEnv) : defaultDist;

  if (existsSync(webUiDist)) {
    app.use(express.static(webUiDist));
    app.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      if (req.path.startsWith("/api")) return next();
      res.sendFile(path.join(webUiDist, "index.html"));
    });
    logger.info(`Serving Holocron web UI from ${webUiDist}`);
  } else {
    logger.warn(`Holocron web dist not found at ${webUiDist}; API only. Set TRASK_WEBUI_DIST_PATH or build apps/holocron-web.`);
  }

  const { server, listen } = createNodeApiHost({
    requestListener: app,
    createHub: () => ({}),
  });

  listen(config.webPort, () => {
    logger.info(`Trask Holocron web UI listening on port ${config.webPort}.`);
  });

  return {
    stop: () =>
      new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      }),
  };
};
