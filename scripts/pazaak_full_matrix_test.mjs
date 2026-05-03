import { writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

const API = process.env.PAZAAK_TEST_API ?? "http://127.0.0.1:4001";
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const PASSWORD = "MatrixTest!2026";
const RESULT_FILE = `itest-pazaak-matrix-${RUN_ID}.json`;
const STAND_THRESHOLD = 18;
const MAX_MATCH_MS = 10 * 60 * 1000;

const results = [];
const artifacts = { runId: RUN_ID, api: API, matches: [], accounts: [], websockets: [] };
let accountCounter = 0;

const log = (...args) => console.log("[matrix]", ...args);

/** Python-style `%` with non-negative remainder (matches @openkotor/pazaak-engine). */
function modPythonStyle(a, modulus) {
  if (modulus <= 0) {
    throw new Error("modulus must be positive");
  }

  return ((a % modulus) + modulus) % modulus;
}
const pass = (name, details = {}) => {
  results.push({ name, ok: true, details });
  log("PASS", name, JSON.stringify(details));
};
const fail = (name, error, details = {}) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  results.push({ name, ok: false, error: message, details });
  log("FAIL", name, message);
};
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function api(path, opts = {}) {
  const response = await fetch(`${API}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { status: response.status, ok: response.ok, body };
}

async function expectOk(name, promise) {
  const response = await promise;
  if (!response.ok) throw new Error(`${name} HTTP ${response.status}: ${JSON.stringify(response.body)}`);
  return response.body;
}

async function expectStatus(name, promise, statuses) {
  const response = await promise;
  const allowed = Array.isArray(statuses) ? statuses : [statuses];
  if (!allowed.includes(response.status)) {
    throw new Error(`${name} expected ${allowed.join("/")} got ${response.status}: ${JSON.stringify(response.body)}`);
  }
  return response.body;
}

async function registerSurface(surface, label = surface) {
  accountCounter += 1;
  const username = `mx_${surface}_${RUN_ID}_${accountCounter}`.slice(0, 32);
  const displayName = `${label}_${accountCounter}`.slice(0, 32);
  const body = await expectStatus(
    `register ${surface}`,
    api("/api/auth/register", { method: "POST", body: { username, displayName, password: PASSWORD } }),
    [200, 201],
  );
  const account = {
    surface,
    username,
    displayName: body.account.displayName,
    token: body.app_token,
    userId: body.account.legacyGameUserId ?? body.account.accountId,
    accountId: body.account.accountId,
  };
  artifacts.accounts.push({ surface, username, displayName: account.displayName, userId: account.userId });
  return account;
}

async function loginSurface(account) {
  const body = await expectOk(
    `login ${account.surface}`,
    api("/api/auth/login", { method: "POST", body: { identifier: account.username, password: PASSWORD } }),
  );
  return { ...account, token: body.app_token };
}

function wsUrl(path) {
  return `${API.replace(/^http/, "ws")}${path}`;
}

function waitForWsMessage(url, trigger, predicate, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => {
      try { socket.close(); } catch {}
      reject(new Error(`Timed out waiting for websocket message from ${url}`));
    }, timeoutMs);

    socket.addEventListener("open", async () => {
      try {
        await trigger();
      } catch (error) {
        clearTimeout(timer);
        try { socket.close(); } catch {}
        reject(error);
      }
    });

    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data));
        if (!predicate || predicate(message)) {
          clearTimeout(timer);
          try { socket.close(); } catch {}
          resolve(message);
        }
      } catch {}
    });

    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error(`WebSocket error for ${url}`));
    });
  });
}

function playerIndex(match, userId) {
  return match.players[0].userId === userId ? 0 : 1;
}

function sideCardOptions(player) {
  const used = new Set(player.usedCardIds ?? []);
  const previousBoardValue = player.board?.at(-1)?.value;
  const options = [];
  for (const card of player.hand ?? []) {
    if (used.has(card.id)) continue;
    if (card.type === "plus") options.push({ cardId: card.id, appliedValue: card.value, label: card.label, cardType: card.type });
    if (card.type === "minus") options.push({ cardId: card.id, appliedValue: -card.value, label: card.label, cardType: card.type });
    if (card.type === "flip") {
      options.push({ cardId: card.id, appliedValue: card.value, label: `+${card.value}`, cardType: card.type });
      options.push({ cardId: card.id, appliedValue: -card.value, label: `-${card.value}`, cardType: card.type });
    }
    if (card.type === "value_change") {
      options.push({ cardId: card.id, appliedValue: 1, label: "+1", cardType: card.type });
      options.push({ cardId: card.id, appliedValue: 2, label: "+2", cardType: card.type });
      options.push({ cardId: card.id, appliedValue: -1, label: "-1", cardType: card.type });
      options.push({ cardId: card.id, appliedValue: -2, label: "-2", cardType: card.type });
    }
    if (card.type === "copy_previous" && previousBoardValue !== undefined) {
      options.push({ cardId: card.id, appliedValue: previousBoardValue, label: "D", cardType: card.type });
    }
    if (card.type === "tiebreaker") {
      options.push({ cardId: card.id, appliedValue: 1, label: "+1T", cardType: card.type });
      options.push({ cardId: card.id, appliedValue: -1, label: "-1T", cardType: card.type });
    }
    if (card.type === "flip_two_four" || card.type === "flip_three_six") {
      options.push({ cardId: card.id, appliedValue: 0, label: card.label, cardType: card.type });
    }
    if (card.type === "mod_previous" && previousBoardValue !== undefined && card.value > 0) {
      const remainder = modPythonStyle(previousBoardValue, card.value);
      options.push({ cardId: card.id, appliedValue: remainder, label: card.label, cardType: card.type });
    }
    if (card.type === "halve_previous" && previousBoardValue !== undefined) {
      const halved = Math.trunc(previousBoardValue / 2);
      options.push({ cardId: card.id, appliedValue: halved, label: card.label, cardType: card.type });
    }
    if (card.type === "hard_reset") {
      options.push({ cardId: card.id, appliedValue: 0, label: "00", cardType: card.type });
    }
  }
  return options;
}

function projectedTotalAfterSide(player, option) {
  const card = player.hand?.find((entry) => entry.id === option.cardId);
  if (!card) {
    return player.total + option.appliedValue;
  }

  const prev = player.board?.at(-1)?.value;
  if ((card.type === "mod_previous" || card.type === "halve_previous") && prev !== undefined) {
    return player.total + (option.appliedValue - prev);
  }

  if (card.type === "hard_reset") {
    return player.total;
  }

  return player.total + option.appliedValue;
}

async function actOnce(actor, match) {
  const idx = playerIndex(match, actor.userId);
  const me = match.players[idx];

  if (match.phase === "turn") {
    if (!me.stood && me.total >= STAND_THRESHOLD && me.total <= 20) {
      return (await expectOk(`${actor.surface} stand`, api(`/api/match/${match.id}/stand`, { method: "POST", token: actor.token }))).match;
    }
    return (await expectOk(`${actor.surface} draw`, api(`/api/match/${match.id}/draw`, { method: "POST", token: actor.token }))).match;
  }

  if (match.phase === "after-draw") {
    const refreshedIdx = playerIndex(match, actor.userId);
    const refreshedPlayer = match.players[refreshedIdx];
    const playable = sideCardOptions(refreshedPlayer)
      .filter((option) => projectedTotalAfterSide(refreshedPlayer, option) <= 20)
      .sort((left, right) => Math.abs(20 - projectedTotalAfterSide(refreshedPlayer, left)) - Math.abs(20 - projectedTotalAfterSide(refreshedPlayer, right)))[0];
    if (playable && (projectedTotalAfterSide(refreshedPlayer, playable) >= 18 || refreshedPlayer.total > 20)) {
      return (await expectOk(`${actor.surface} play side ${playable.label}`, api(`/api/match/${match.id}/play`, {
        method: "POST",
        token: actor.token,
        body: { cardId: playable.cardId, appliedValue: playable.appliedValue },
      }))).match;
    }
    if (refreshedPlayer.total >= STAND_THRESHOLD && refreshedPlayer.total <= 20) {
      return (await expectOk(`${actor.surface} stand after draw`, api(`/api/match/${match.id}/stand`, { method: "POST", token: actor.token }))).match;
    }
    return (await expectOk(`${actor.surface} endturn`, api(`/api/match/${match.id}/endturn`, { method: "POST", token: actor.token }))).match;
  }

  if (match.phase === "after-card") {
    const refreshedIdx = playerIndex(match, actor.userId);
    const refreshedPlayer = match.players[refreshedIdx];
    if (refreshedPlayer.total >= STAND_THRESHOLD && refreshedPlayer.total <= 20) {
      return (await expectOk(`${actor.surface} stand after card`, api(`/api/match/${match.id}/stand`, { method: "POST", token: actor.token }))).match;
    }
    return (await expectOk(`${actor.surface} endturn after card`, api(`/api/match/${match.id}/endturn`, { method: "POST", token: actor.token }))).match;
  }

  return match;
}

async function playFullMatch(name, match, actors) {
  const byId = new Map(actors.map((actor) => [actor.userId, actor]));
  const startedAt = Date.now();
  let actions = 0;
  let sideCardPlayed = false;

  while (Date.now() - startedAt < MAX_MATCH_MS) {
    if (match.phase === "completed") break;
    const activePlayer = match.players[match.activePlayerIndex];
    const actor = byId.get(activePlayer.userId);
    assert(actor, `No actor token for active user ${activePlayer.userId}`);
    const beforeSideCount = match.players[playerIndex(match, actor.userId)].sideCardsPlayed?.length ?? 0;
    match = await actOnce(actor, match);
    const afterSideCount = match.players[playerIndex(match, actor.userId)].sideCardsPlayed?.length ?? 0;
    if (afterSideCount > beforeSideCount) sideCardPlayed = true;
    actions += 1;
    await sleep(50);
  }

  assert(match.phase === "completed", `${name} did not complete in time`);
  assert(Boolean(match.winnerId), `${name} completed without winnerId`);

  for (const actor of actors) {
    const body = await expectOk(`${name} verify ${actor.surface}`, api(`/api/match/${match.id}`, { token: actor.token }));
    assert(body.match.phase === "completed", `${actor.surface} did not see completed match`);
    assert(body.match.winnerId === match.winnerId, `${actor.surface} saw mismatched winner`);
  }

  const summary = {
    matchId: match.id,
    name,
    winner: match.winnerName,
    score: `${match.players[0].roundWins}-${match.players[1].roundWins}`,
    setNumber: match.setNumber,
    actions,
    sideCardPlayed,
    statusLine: match.statusLine,
    players: match.players.map((player) => ({ userId: player.userId, displayName: player.displayName, wins: player.roundWins })),
  };
  artifacts.matches.push(summary);
  return summary;
}

async function pairViaMatchmaking(left, right) {
  await expectOk(`${left.surface} enqueue`, api("/api/matchmaking/enqueue", { method: "POST", token: left.token, body: { preferredMaxPlayers: 2 } }));
  await expectOk(`${right.surface} enqueue`, api("/api/matchmaking/enqueue", { method: "POST", token: right.token, body: { preferredMaxPlayers: 2 } }));
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await sleep(1000);
    const response = await api("/api/match/me", { token: left.token });
    if (response.ok) return response.body.match;
  }
  throw new Error(`matchmaking did not pair ${left.surface} and ${right.surface}`);
}

async function pairViaLobbyId(host, guest) {
  const created = await expectOk("create lobby by id", api("/api/lobbies", {
    method: "POST",
    token: host.token,
    body: { name: `Matrix ${host.surface} host`, maxPlayers: 2, variant: "canonical", ranked: true, turnTimerSeconds: 120 },
  }));
  const lobbyId = created.lobby.id;
  await expectOk("join lobby by id", api(`/api/lobbies/${encodeURIComponent(lobbyId)}/join`, { method: "POST", token: guest.token, body: {} }));
  await expectOk("host ready", api(`/api/lobbies/${encodeURIComponent(lobbyId)}/ready`, { method: "POST", token: host.token, body: { ready: true } }));
  await expectOk("guest ready", api(`/api/lobbies/${encodeURIComponent(lobbyId)}/ready`, { method: "POST", token: guest.token, body: { ready: true } }));
  return (await expectOk("start lobby by id", api(`/api/lobbies/${encodeURIComponent(lobbyId)}/start`, { method: "POST", token: host.token }))).match;
}

async function pairViaWackyLobby(host, guest) {
  const created = await expectOk("create wacky lobby by id", api("/api/lobbies", {
    method: "POST",
    token: host.token,
    body: {
      name: `Wacky ${host.surface} host`,
      maxPlayers: 2,
      variant: "canonical",
      ranked: false,
      gameMode: "wacky",
      turnTimerSeconds: 120,
    },
  }));
  const lobbyId = created.lobby.id;
  await expectOk("join wacky lobby by id", api(`/api/lobbies/${encodeURIComponent(lobbyId)}/join`, { method: "POST", token: guest.token, body: {} }));
  await expectOk("host ready wacky", api(`/api/lobbies/${encodeURIComponent(lobbyId)}/ready`, { method: "POST", token: host.token, body: { ready: true } }));
  await expectOk("guest ready wacky", api(`/api/lobbies/${encodeURIComponent(lobbyId)}/ready`, { method: "POST", token: guest.token, body: { ready: true } }));
  const match = (await expectOk("start wacky lobby by id", api(`/api/lobbies/${encodeURIComponent(lobbyId)}/start`, { method: "POST", token: host.token }))).match;
  assert(match.gameMode === "wacky", "wacky lobby must create a wacky match");
  return match;
}

async function pairViaLobbyCode(host, guest) {
  const password = "codepass";
  const created = await expectOk("create lobby by code", api("/api/lobbies", {
    method: "POST",
    token: host.token,
    body: { name: `Code ${host.surface} host`, maxPlayers: 2, password, variant: "canonical", allowAiFill: false },
  }));
  const lobby = created.lobby;
  assert(lobby.lobbyCode, "lobby did not expose a lobbyCode");
  await expectStatus("join by wrong code/password rejected", api("/api/lobbies/join-by-code", {
    method: "POST",
    token: guest.token,
    body: { lobbyCode: lobby.lobbyCode, password: "wrong" },
  }), [400, 401, 403]);
  await expectOk("join by code", api("/api/lobbies/join-by-code", { method: "POST", token: guest.token, body: { lobbyCode: lobby.lobbyCode, password } }));
  await expectOk("host ready code", api(`/api/lobbies/${encodeURIComponent(lobby.id)}/ready`, { method: "POST", token: host.token, body: { ready: true } }));
  await expectOk("guest ready code", api(`/api/lobbies/${encodeURIComponent(lobby.id)}/ready`, { method: "POST", token: guest.token, body: { ready: true } }));
  return (await expectOk("start lobby by code", api(`/api/lobbies/${encodeURIComponent(lobby.id)}/start`, { method: "POST", token: host.token }))).match;
}

async function runCase(name, fn) {
  try {
    const details = await fn();
    pass(name, details ?? {});
  } catch (error) {
    fail(name, error);
  }
}

async function smokeEndpoints() {
  await expectOk("health", api("/api/health"));
  await expectStatus("missing auth", api("/api/me"), 401);
  await expectStatus("invalid registration", api("/api/auth/register", { method: "POST", body: { username: "xy", password: "short" } }), 422);

  const user = await registerSurface("webui", "AuthSmoke");
  const loggedIn = await loginSurface(user);
  const session = await expectOk("session", api("/api/auth/session", { token: loggedIn.token }));
  assert(session.account.accountId === user.accountId, "session account mismatch");
  await expectOk("logout", api("/api/auth/logout", { method: "POST", token: loggedIn.token }));
  await expectStatus("logged out token rejected", api("/api/me", { token: loggedIn.token }), 401);
  const restored = await loginSurface(user);

  const settings = await expectOk("settings update", api("/api/settings", {
    method: "PUT",
    token: restored.token,
    body: {
      tableTheme: "tatooine",
      soundEnabled: false,
      reducedMotionEnabled: true,
      turnTimerSeconds: 45,
      preferredAiDifficulty: "hard",
    },
  }));
  assert(settings.settings.tableTheme === "tatooine", "settings tableTheme did not persist");
  assert(settings.settings.reducedMotionEnabled === true, "settings reduced motion did not persist");
  assert(settings.settings.preferredAiDifficulty === "hard", "settings AI difficulty did not persist");

  await expectOk("leaderboard", api("/api/leaderboard", { token: restored.token }));
  await expectOk("history", api("/api/me/history?limit=5", { token: restored.token }));
  return { userId: restored.userId };
}

async function sideboardEndpoints() {
  const user = await registerSurface("activity", "SideboardSmoke");
  await expectStatus("invalid sideboard rejected", api("/api/sideboards/Bad", { method: "PUT", token: user.token, body: { tokens: ["+1"] } }), 422);
  const alphaTokens = ["+1", "+2", "+3", "+4", "+5", "-1", "-2", "-3", "-4", "-5"];
  const betaTokens = ["*1", "*2", "*3", "*4", "*5", "TT", "F1", "F2", "VV", "$$"];
  let body = await expectOk("save alpha sideboard", api("/api/sideboards/Alpha", { method: "PUT", token: user.token, body: { tokens: alphaTokens, makeActive: true } }));
  assert(body.sideboards.sideboards.some((s) => s.name === "Alpha" && s.isActive), "Alpha not active");
  body = await expectOk("save beta sideboard", api("/api/sideboards/Beta", { method: "PUT", token: user.token, body: { tokens: betaTokens, makeActive: false } }));
  assert(body.sideboards.sideboards.some((s) => s.name === "Beta"), "Beta missing");
  body = await expectOk("activate beta sideboard", api("/api/sideboards/active", { method: "POST", token: user.token, body: { name: "Beta" } }));
  assert(body.sideboards.sideboards.some((s) => s.name === "Beta" && s.isActive), "Beta not active");
  body = await expectOk("delete alpha sideboard", api("/api/sideboards/Alpha", { method: "DELETE", token: user.token }));
  assert(!body.sideboards.sideboards.some((s) => s.name === "Alpha"), "Alpha not deleted");
  return { userId: user.userId, saved: body.sideboards.sideboards.length };
}

async function websocketEndpoints() {
  const host = await registerSurface("discord", "WsHost");
  const guest = await registerSurface("webui", "WsGuest");
  const lobbyMessage = await waitForWsMessage(
    wsUrl("/ws?stream=lobbies"),
    async () => {
      await expectOk("ws create lobby", api("/api/lobbies", { method: "POST", token: host.token, body: { name: `WS ${RUN_ID}`, maxPlayers: 2 } }));
    },
    (message) => message.type === "lobby_update" || message.type === "lobby_list_update",
  );

  const match = await pairViaLobbyId(host, guest);
  const activeActor = match.players[match.activePlayerIndex].userId === host.userId ? host : guest;
  const matchMessage = await waitForWsMessage(
    wsUrl(`/ws?matchId=${encodeURIComponent(match.id)}`),
    async () => {
      await expectOk("ws draw", api(`/api/match/${match.id}/draw`, { method: "POST", token: activeActor.token }));
    },
    (message) => message.type === "match_update" && message.data?.id === match.id,
  );
  artifacts.websockets.push({ lobbyMessageType: lobbyMessage.type, matchMessageType: matchMessage.type, matchId: match.id });
  await expectOk("cleanup ws match", api(`/api/match/${match.id}/forfeit`, { method: "POST", token: activeActor.token }));
  return { lobbyMessageType: lobbyMessage.type, matchMessageType: matchMessage.type, matchId: match.id };
}

async function fullMatchCombination(name, leftSurface, rightSurface, pairer) {
  const left = await registerSurface(leftSurface, `${leftSurface}_full`);
  const right = await registerSurface(rightSurface, `${rightSurface}_full`);
  const match = await pairer(left, right);
  return playFullMatch(name, match, [left, right]);
}

async function forfeitAndConcede() {
  const a = await registerSurface("discord", "ForfeitA");
  const b = await registerSurface("activity", "ForfeitB");
  const first = await pairViaMatchmaking(a, b);
  const forfeited = await expectOk("forfeit", api(`/api/match/${first.id}/forfeit`, { method: "POST", token: a.token }));
  assert(forfeited.match.phase === "completed", "forfeit did not complete match");
  assert(forfeited.match.winnerId === b.userId, "forfeit winner mismatch");

  const c = await registerSurface("webui", "ConcedeA");
  const d = await registerSurface("discord", "ConcedeB");
  const second = await pairViaLobbyId(c, d);
  const conceded = await expectOk("concede alias", api(`/api/match/${second.id}/concede`, { method: "POST", token: d.token }));
  assert(conceded.match.phase === "completed", "concede did not complete match");
  assert(conceded.match.winnerId === c.userId, "concede winner mismatch");
  return { forfeitWinner: forfeited.match.winnerName, concedeWinner: conceded.match.winnerName };
}

async function lobbyAiAndStatus() {
  const host = await registerSurface("webui", "AiHost");
  const created = await expectOk("create AI lobby", api("/api/lobbies", { method: "POST", token: host.token, body: { name: "AI Matrix", maxPlayers: 2, allowAiFill: true } }));
  const lobbyId = created.lobby.id;
  const withAi = await expectOk("add AI", api(`/api/lobbies/${encodeURIComponent(lobbyId)}/addAi`, { method: "POST", token: host.token, body: { difficulty: "easy" } }));
  const ai = withAi.lobby.players.find((player) => player.aiDifficulty);
  assert(ai, "AI seat was not added");
  const updatedAi = await expectOk("update AI difficulty", api(`/api/lobbies/${encodeURIComponent(lobbyId)}/ai/${encodeURIComponent(ai.userId)}/difficulty`, { method: "POST", token: host.token, body: { difficulty: "professional" } }));
  assert(updatedAi.lobby.players.some((player) => player.userId === ai.userId && player.aiDifficulty === "professional"), "AI difficulty did not update");
  await expectOk("set lobby status", api(`/api/lobbies/${encodeURIComponent(lobbyId)}/status`, { method: "POST", token: host.token, body: { status: "matchmaking" } }));
  await expectOk("host ready AI lobby", api(`/api/lobbies/${encodeURIComponent(lobbyId)}/ready`, { method: "POST", token: host.token, body: { ready: true } }));
  let match = (await expectOk("start AI lobby", api(`/api/lobbies/${encodeURIComponent(lobbyId)}/start`, { method: "POST", token: host.token }))).match;

  for (let action = 0; action < 12 && match.phase !== "completed" && match.players[match.activePlayerIndex].userId === host.userId; action += 1) {
    match = await actOnce(host, match);
  }

  assert(match.phase === "completed" || match.players[match.activePlayerIndex].userId === ai.userId, "AI did not become active in the lobby match");
  const aiBefore = match.players.find((player) => player.userId === ai.userId);
  const aiBoardBefore = aiBefore?.board?.length ?? 0;
  const aiSideBefore = aiBefore?.sideCardsPlayed?.length ?? 0;

  let observedAiAction = match.phase === "completed";
  for (let attempt = 0; attempt < 25 && !observedAiAction; attempt += 1) {
    await sleep(1000);
    const response = await expectOk("poll AI match", api(`/api/match/${encodeURIComponent(match.id)}`, { token: host.token }));
    match = response.match;
    const aiAfter = match.players.find((player) => player.userId === ai.userId);
    observedAiAction = match.phase === "completed"
      || (aiAfter?.board?.length ?? 0) > aiBoardBefore
      || (aiAfter?.sideCardsPlayed?.length ?? 0) > aiSideBefore
      || match.players[match.activePlayerIndex].userId !== ai.userId;
  }

  assert(observedAiAction, "AI seat did not auto-execute a move after becoming active");
  if (match.phase !== "completed") {
    await expectOk("cleanup AI match", api(`/api/match/${encodeURIComponent(match.id)}/forfeit`, { method: "POST", token: host.token }));
  }

  return { lobbyId, aiUserId: ai.userId, matchId: match.id, observedAiAction };
}

async function main() {
  await writeFile(RESULT_FILE, JSON.stringify({ startedAt: new Date().toISOString(), results: [], artifacts }, null, 2));

  await runCase("health/auth/settings/history/leaderboard", smokeEndpoints);
  await runCase("sideboard save/active/delete/validation", sideboardEndpoints);
  await runCase("lobby and match websocket broadcasts", websocketEndpoints);
  await runCase("lobby AI seat/status/difficulty", lobbyAiAndStatus);
  await runCase("forfeit and concede complete matches", forfeitAndConcede);

  const fullCases = [
    ["matchmaking discord-bot to webui", "discord", "webui", pairViaMatchmaking],
    ["matchmaking discord-bot to activity", "discord", "activity", pairViaMatchmaking],
    ["matchmaking webui to activity", "webui", "activity", pairViaMatchmaking],
    ["lobby id discord-bot host to webui guest", "discord", "webui", pairViaLobbyId],
    ["lobby id webui host to discord-bot guest", "webui", "discord", pairViaLobbyId],
    ["lobby code activity host to discord-bot guest", "activity", "discord", pairViaLobbyCode],
    ["lobby code webui host to activity guest", "webui", "activity", pairViaLobbyCode],
  ];

  for (const [name, left, right, pairer] of fullCases) {
    await runCase(name, () => fullMatchCombination(name, left, right, pairer));
  }

  await runCase("lobby id wacky mode discord-bot host to webui guest", () =>
    fullMatchCombination("lobby id wacky mode discord-bot host to webui guest", "discord", "webui", pairViaWackyLobby));

  const passed = results.filter((result) => result.ok).length;
  const failed = results.length - passed;
  const summary = { runId: RUN_ID, api: API, passed, failed, results, artifacts };
  await writeFile(RESULT_FILE, JSON.stringify(summary, null, 2));
  log("SUMMARY", JSON.stringify({ passed, failed, resultFile: RESULT_FILE }));
  if (failed > 0) process.exitCode = 1;
}

main().catch(async (error) => {
  fail("fatal", error);
  await writeFile(RESULT_FILE, JSON.stringify({ runId: RUN_ID, api: API, passed: 0, failed: results.length, results, artifacts }, null, 2));
  process.exit(1);
});
