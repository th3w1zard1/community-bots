/**
 * Pazaak tournaments surface for the Discord bot.
 *
 * Exposes `buildTournamentSubcommandGroup` + `buildAdminTournamentSubcommandGroup`
 * so the builder composition in main.ts stays flat, and a self-contained
 * `PazaakTournamentController` that owns the repository, subcommand dispatch,
 * match-scheduling hook, and match-settlement callback.
 *
 * The controller never imports main.ts itself — instead, main.ts wires its
 * PazaakCoordinator + walletRepository instance in, and calls
 * `controller.onMatchSettled(match)` after `settleCompletedMatch`.
 */

import type { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import {
  PermissionFlagsBits,
  SlashCommandSubcommandGroupBuilder,
  SlashCommandSubcommandBuilder,
} from "discord.js";

import { buildErrorEmbed, buildInfoEmbed, buildSuccessEmbed, buildWarningEmbed } from "@openkotor/discord-ui";
import { pickRandomCardTokenByRarity, type PazaakCoordinator, type PazaakGameMode, type PazaakMatch } from "@openkotor/pazaak-engine";
import {
  advanceTournament,
  attachEngineMatchId,
  buildBracketView,
  computeSwissStandings,
  createTournament,
  JsonTournamentRepository,
  registerParticipant,
  startTournament,
  withdrawParticipant,
  type TournamentBracketView,
  type TournamentFormat,
  type TournamentMatchRecord,
  type TournamentParticipant,
  type TournamentRepository,
  type TournamentState,
} from "@openkotor/pazaak-tournament";
import type { JsonWalletRepository } from "@openkotor/persistence";

// ---------------------------------------------------------------------------
// Command builders
// ---------------------------------------------------------------------------

const TOURNAMENT_FORMAT_CHOICES = [
  { name: "Single Elimination", value: "single_elim" },
  { name: "Double Elimination", value: "double_elim" },
  { name: "Swiss Rounds", value: "swiss" },
] as const;

const TOURNAMENT_MODE_CHOICES = [
  { name: "Canonical (TSL)", value: "canonical" },
  { name: "Wacky (experimental)", value: "wacky" },
] as const;

export const buildTournamentSubcommandGroup = (): SlashCommandSubcommandGroupBuilder =>
  new SlashCommandSubcommandGroupBuilder()
    .setName("tournament")
    .setDescription("Manage Pazaak tournaments from the table.")
    .addSubcommand((sub: SlashCommandSubcommandBuilder) =>
      sub
        .setName("create")
        .setDescription("Open a new tournament for registrations.")
        .addStringOption((option) => option.setName("name").setDescription("Tournament name.").setRequired(true))
        .addStringOption((option) =>
          option
            .setName("format")
            .setDescription("Tournament format.")
            .setRequired(true)
            .addChoices(...TOURNAMENT_FORMAT_CHOICES),
        )
        .addStringOption((option) =>
          option.setName("mode").setDescription("Game mode (default: canonical).").addChoices(...TOURNAMENT_MODE_CHOICES),
        )
        .addIntegerOption((option) =>
          option.setName("sets_per_match").setDescription("Sets required to win a match (default 3).").setMinValue(1).setMaxValue(9),
        )
        .addIntegerOption((option) =>
          option.setName("swiss_rounds").setDescription("Swiss round count (default 5).").setMinValue(2).setMaxValue(12),
        )
        .addIntegerOption((option) =>
          option.setName("max_participants").setDescription("Optional participant cap.").setMinValue(2).setMaxValue(64),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("join")
        .setDescription("Register for an open tournament.")
        .addStringOption((option) => option.setName("tournament_id").setDescription("Tournament id.").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("leave")
        .setDescription("Withdraw from a tournament.")
        .addStringOption((option) => option.setName("tournament_id").setDescription("Tournament id.").setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("List open and active tournaments."))
    .addSubcommand((sub) =>
      sub
        .setName("start")
        .setDescription("Start a tournament (organizer only).")
        .addStringOption((option) => option.setName("tournament_id").setDescription("Tournament id.").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("bracket")
        .setDescription("Show the bracket or Swiss pairings.")
        .addStringOption((option) => option.setName("tournament_id").setDescription("Tournament id.").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("standings")
        .setDescription("Show the current standings (Swiss) or bracket status.")
        .addStringOption((option) => option.setName("tournament_id").setDescription("Tournament id.").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("report")
        .setDescription("Manually report the winner of a tournament match (organizer / participant).")
        .addStringOption((option) => option.setName("tournament_id").setDescription("Tournament id.").setRequired(true))
        .addStringOption((option) => option.setName("match_id").setDescription("Match id from /pazaak tournament bracket.").setRequired(true))
        .addUserOption((option) => option.setName("winner").setDescription("Match winner.").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("cancel")
        .setDescription("Cancel a tournament (organizer only).")
        .addStringOption((option) => option.setName("tournament_id").setDescription("Tournament id.").setRequired(true)),
    );

export const buildAdminTournamentSubcommandGroup = (): SlashCommandSubcommandGroupBuilder =>
  new SlashCommandSubcommandGroupBuilder()
    .setName("tournament")
    .setDescription("Admin overrides for tournaments.")
    .addSubcommand((sub) =>
      sub
        .setName("force-report")
        .setDescription("Force-report a tournament match outcome.")
        .addStringOption((option) => option.setName("tournament_id").setDescription("Tournament id.").setRequired(true))
        .addStringOption((option) => option.setName("match_id").setDescription("Match id.").setRequired(true))
        .addUserOption((option) => option.setName("winner").setDescription("Match winner.").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("reseed")
        .setDescription("Reseed a tournament still in registration (does not affect active brackets).")
        .addStringOption((option) => option.setName("tournament_id").setDescription("Tournament id.").setRequired(true)),
    );

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export interface TournamentControllerDeps {
  coordinator: PazaakCoordinator;
  walletRepository: JsonWalletRepository;
  repository?: TournamentRepository;
  dataFile?: string;
  logger?: Pick<Console, "info" | "warn" | "error">;
}

/**
 * One-per-process coordinator for tournament state, command dispatch, and
 * engine-match ↔ tournament-match linkage. The controller also listens to
 * match-settled notifications from the Pazaak coordinator so reported matches
 * can flow back into `advanceTournament`.
 */
export class PazaakTournamentController {
  private readonly repository: TournamentRepository;
  private readonly coordinator: PazaakCoordinator;
  private readonly walletRepository: JsonWalletRepository;
  private readonly logger: Pick<Console, "info" | "warn" | "error">;
  /** Reverse index: engineMatchId -> tournamentId for fast match-settled lookups. */
  private readonly engineMatchToTournament = new Map<string, string>();

  public constructor(deps: TournamentControllerDeps) {
    if (!deps.repository && !deps.dataFile) {
      throw new Error("PazaakTournamentController requires either `repository` or `dataFile`.");
    }
    this.repository = deps.repository ?? new JsonTournamentRepository(deps.dataFile!);
    this.coordinator = deps.coordinator;
    this.walletRepository = deps.walletRepository;
    this.logger = deps.logger ?? console;
  }

  /** Hydrate the in-memory engine→tournament index. Call once at bot start. */
  public async initialize(): Promise<void> {
    const tournaments = await this.repository.list();
    for (const state of tournaments) {
      for (const match of state.matches) {
        if (match.engineMatchId) {
          this.engineMatchToTournament.set(match.engineMatchId, state.id);
        }
      }
    }
  }

  // ---------- Command dispatch ------------------------------------------------

  public async handleSubcommand(interaction: ChatInputCommandInteraction, isAdmin = false): Promise<void> {
    const subcommand = interaction.options.getSubcommand(true);

    if (isAdmin) {
      if (subcommand === "force-report") return this.handleForceReport(interaction);
      if (subcommand === "reseed") return this.handleReseed(interaction);
      await interaction.reply({
        embeds: [buildErrorEmbed({ title: "Unknown Admin Subcommand", description: `Subcommand \`${subcommand}\` is not implemented.` })],
        ephemeral: true,
      });
      return;
    }

    switch (subcommand) {
      case "create":
        return this.handleCreate(interaction);
      case "join":
        return this.handleJoin(interaction);
      case "leave":
        return this.handleLeave(interaction);
      case "list":
        return this.handleList(interaction);
      case "start":
        return this.handleStart(interaction);
      case "bracket":
        return this.handleBracket(interaction);
      case "standings":
        return this.handleStandings(interaction);
      case "report":
        return this.handleReport(interaction);
      case "cancel":
        return this.handleCancel(interaction);
      default:
        await interaction.reply({
          embeds: [buildErrorEmbed({ title: "Unknown Subcommand", description: `Subcommand \`${subcommand}\` is not implemented.` })],
          ephemeral: true,
        });
    }
  }

  // ---------- Engine integration ---------------------------------------------

  /**
   * Called from main.ts after a completed match has been settled. Looks the
   * match up by engineMatchId; if it was a tournament match, routes the winner
   * into `advanceTournament` and schedules any newly-active matches.
   */
  public async onMatchSettled(match: PazaakMatch): Promise<void> {
    const tournamentId = this.engineMatchToTournament.get(match.id);
    if (!tournamentId || !match.winnerId) return;

    const state = await this.repository.get(tournamentId);
    if (!state) {
      this.engineMatchToTournament.delete(match.id);
      return;
    }

    const tournamentMatch = state.matches.find((entry) => entry.engineMatchId === match.id);
    if (!tournamentMatch || tournamentMatch.state !== "active") return;

    try {
      const result = advanceTournament(state, {
        matchId: tournamentMatch.id,
        winnerUserId: match.winnerId,
        loserUserId: match.loserId ?? null,
      });
      const nextState = await this.scheduleMatches(result.state, result.matchesToSchedule, match.channelId);
      await this.repository.save(nextState);
      if (nextState.status === "completed") {
        await this.grantTournamentCardRewards(nextState);
      }
      this.engineMatchToTournament.delete(match.id);
    } catch (err) {
      this.logger.error("Tournament advance failed.", err instanceof Error ? err.message : String(err));
    }
  }

  /** Rare drop for champion; Uncommon for runner-up / Swiss 2nd place. */
  private async grantTournamentCardRewards(state: TournamentState): Promise<void> {
    if (state.status !== "completed" || !state.championUserId) {
      return;
    }

    const champion = state.participants[state.championUserId];
    if (!champion) {
      return;
    }

    try {
      const rare = pickRandomCardTokenByRarity("rare");
      if (rare) {
        await this.walletRepository.addOwnedSideDeckTokens(champion.userId, champion.displayName, [rare]);
      }

      let runnerUpId: string | null = null;
      if (state.format === "swiss") {
        const rows = computeSwissStandings(state);
        runnerUpId = rows[1]?.userId ?? null;
      } else {
        const decisive = state.matches
          .filter((m) => m.state === "reported" && m.winnerUserId === state.championUserId && m.loserUserId)
          .sort((a, b) => b.round - a.round)[0];
        runnerUpId = decisive?.loserUserId ?? null;
      }

      if (runnerUpId) {
        const runnerUp = state.participants[runnerUpId];
        if (runnerUp) {
          const uncommon = pickRandomCardTokenByRarity("uncommon");
          if (uncommon) {
            await this.walletRepository.addOwnedSideDeckTokens(runnerUp.userId, runnerUp.displayName, [uncommon]);
          }
        }
      }
    } catch (err) {
      this.logger.error("Tournament card rewards failed.", err instanceof Error ? err.message : String(err));
    }
  }

  // ---------- Subcommand handlers -------------------------------------------

  private async handleCreate(interaction: ChatInputCommandInteraction): Promise<void> {
    const name = interaction.options.getString("name", true).trim();
    const format = interaction.options.getString("format", true) as TournamentFormat;
    const modeRaw = interaction.options.getString("mode") ?? "canonical";
    const setsPerMatch = interaction.options.getInteger("sets_per_match") ?? 3;
    const rounds = interaction.options.getInteger("swiss_rounds") ?? 5;
    const maxParticipants = interaction.options.getInteger("max_participants");

    const gameMode: PazaakGameMode = modeRaw === "wacky" ? "wacky" : "canonical";

    const state = createTournament({
      name,
      organizerId: interaction.user.id,
      organizerName: interaction.user.displayName,
      format,
      gameMode,
      setsPerMatch,
      rounds,
      maxParticipants: maxParticipants ?? null,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
    });
    await this.repository.save(state);

    await interaction.reply({
      embeds: [this.buildTournamentEmbed(state, "Tournament Opened")],
      ephemeral: false,
    });
  }

  private async handleJoin(interaction: ChatInputCommandInteraction): Promise<void> {
    const tournamentId = interaction.options.getString("tournament_id", true);
    const state = await this.requireTournament(interaction, tournamentId);
    if (!state) return;

    if (state.status !== "registration") {
      await this.replyError(interaction, "Registration Closed", `This tournament is **${state.status}** and no longer accepts registrations.`);
      return;
    }

    const wallet = await this.walletRepository.getWallet(interaction.user.id, interaction.user.displayName);
    let nextState: TournamentState;
    try {
      nextState = registerParticipant(state, {
        userId: interaction.user.id,
        displayName: interaction.user.displayName,
        mmr: wallet.mmr,
      });
    } catch (err) {
      await this.replyError(interaction, "Registration Failed", err instanceof Error ? err.message : String(err));
      return;
    }
    await this.repository.save(nextState);

    await interaction.reply({
      embeds: [buildSuccessEmbed({
        title: "Registered",
        description: `You are now registered for **${nextState.name}** (\`${nextState.id}\`). Participants: ${Object.keys(nextState.participants).length}.`,
      })],
      ephemeral: true,
    });
  }

  private async handleLeave(interaction: ChatInputCommandInteraction): Promise<void> {
    const tournamentId = interaction.options.getString("tournament_id", true);
    const state = await this.requireTournament(interaction, tournamentId);
    if (!state) return;

    if (!state.participants[interaction.user.id]) {
      await this.replyError(interaction, "Not Registered", "You are not registered for this tournament.");
      return;
    }

    const nextState = withdrawParticipant(state, interaction.user.id);
    await this.repository.save(nextState);

    await interaction.reply({
      embeds: [buildSuccessEmbed({
        title: "Withdrawn",
        description: state.status === "registration"
          ? `You have withdrawn from **${state.name}**.`
          : `You have withdrawn mid-event. Any active match is forfeited and the bracket advances your opponent.`,
      })],
      ephemeral: true,
    });
  }

  private async handleList(interaction: ChatInputCommandInteraction): Promise<void> {
    const tournaments = await this.repository.list();
    const visible = tournaments.filter((entry) =>
      entry.status === "registration" || entry.status === "active",
    );

    if (visible.length === 0) {
      await interaction.reply({
        embeds: [buildInfoEmbed({ title: "Tournaments", description: "No open or active tournaments. Run `/pazaak tournament create` to open one." })],
        ephemeral: true,
      });
      return;
    }

    const lines = visible.slice(0, 15).map((entry) => {
      const count = Object.keys(entry.participants).length;
      return `• \`${entry.id}\` — **${entry.name}** (${entry.format.replace("_", "-")}, ${entry.gameMode}) · ${entry.status} · ${count} participants`;
    });

    await interaction.reply({
      embeds: [buildInfoEmbed({ title: "Tournaments", description: lines.join("\n") })],
      ephemeral: true,
    });
  }

  private async handleStart(interaction: ChatInputCommandInteraction): Promise<void> {
    const tournamentId = interaction.options.getString("tournament_id", true);
    const state = await this.requireTournament(interaction, tournamentId);
    if (!state) return;

    if (state.organizerId !== interaction.user.id) {
      await this.replyError(interaction, "Organizer Only", "Only the tournament organizer can start the event.");
      return;
    }

    let started: TournamentState;
    try {
      started = startTournament(state);
    } catch (err) {
      await this.replyError(interaction, "Cannot Start", err instanceof Error ? err.message : String(err));
      return;
    }

    const initialMatches = started.matches.filter((entry) => entry.state === "active");
    const scheduled = await this.scheduleMatches(started, initialMatches, interaction.channelId);
    await this.repository.save(scheduled);

    await interaction.reply({
      embeds: [this.buildTournamentEmbed(scheduled, "Tournament Started")],
      ephemeral: false,
    });
  }

  private async handleBracket(interaction: ChatInputCommandInteraction): Promise<void> {
    const tournamentId = interaction.options.getString("tournament_id", true);
    const state = await this.requireTournament(interaction, tournamentId);
    if (!state) return;

    const view = buildBracketView(state);

    await interaction.reply({
      embeds: [this.buildBracketEmbed(state, view)],
      ephemeral: true,
    });
  }

  private async handleStandings(interaction: ChatInputCommandInteraction): Promise<void> {
    const tournamentId = interaction.options.getString("tournament_id", true);
    const state = await this.requireTournament(interaction, tournamentId);
    if (!state) return;

    if (state.format !== "swiss") {
      // For SE/DE, fall back to bracket view.
      return this.handleBracket(interaction);
    }

    const standings = computeSwissStandings(state);
    const lines = standings.length === 0
      ? ["No participants yet."]
      : standings.map((row, index) =>
          `${index + 1}. **${row.displayName}** — ${row.wins}-${row.losses}-${row.draws}  (${row.matchPoints} MP, Bchz ${row.buchholz.toFixed(1)}, SB ${row.sonnebornBerger.toFixed(1)})`,
        );

    await interaction.reply({
      embeds: [buildInfoEmbed({ title: `Standings — ${state.name}`, description: lines.join("\n") })],
      ephemeral: true,
    });
  }

  private async handleReport(interaction: ChatInputCommandInteraction): Promise<void> {
    const tournamentId = interaction.options.getString("tournament_id", true);
    const matchId = interaction.options.getString("match_id", true);
    const winner = interaction.options.getUser("winner", true);

    const state = await this.requireTournament(interaction, tournamentId);
    if (!state) return;

    const match = state.matches.find((entry) => entry.id === matchId);
    if (!match) {
      await this.replyError(interaction, "Match Not Found", "No match with that id in this tournament.");
      return;
    }

    // Only the two participants or the organizer may self-report.
    const isParticipant = interaction.user.id === match.participantAId || interaction.user.id === match.participantBId;
    const isOrganizer = interaction.user.id === state.organizerId;
    if (!isParticipant && !isOrganizer) {
      await this.replyError(interaction, "Not Allowed", "Only the match participants or the organizer can report this match.");
      return;
    }

    await this.applyMatchReport(interaction, state, match, winner.id);
  }

  private async handleCancel(interaction: ChatInputCommandInteraction): Promise<void> {
    const tournamentId = interaction.options.getString("tournament_id", true);
    const state = await this.requireTournament(interaction, tournamentId);
    if (!state) return;

    if (state.organizerId !== interaction.user.id) {
      await this.replyError(interaction, "Organizer Only", "Only the tournament organizer can cancel the event.");
      return;
    }

    const cancelled: TournamentState = { ...state, status: "cancelled", updatedAt: Date.now() };
    await this.repository.save(cancelled);
    await interaction.reply({
      embeds: [buildWarningEmbed({ title: "Tournament Cancelled", description: `**${cancelled.name}** has been cancelled.` })],
      ephemeral: false,
    });
  }

  private async handleForceReport(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await this.replyError(interaction, "Not Allowed", "Manage-Guild permission required.");
      return;
    }

    const tournamentId = interaction.options.getString("tournament_id", true);
    const matchId = interaction.options.getString("match_id", true);
    const winner = interaction.options.getUser("winner", true);

    const state = await this.requireTournament(interaction, tournamentId);
    if (!state) return;

    const match = state.matches.find((entry) => entry.id === matchId);
    if (!match) {
      await this.replyError(interaction, "Match Not Found", "No match with that id in this tournament.");
      return;
    }

    await this.applyMatchReport(interaction, state, match, winner.id);
  }

  private async handleReseed(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await this.replyError(interaction, "Not Allowed", "Manage-Guild permission required.");
      return;
    }

    const tournamentId = interaction.options.getString("tournament_id", true);
    const state = await this.requireTournament(interaction, tournamentId);
    if (!state) return;

    if (state.status !== "registration") {
      await this.replyError(interaction, "Reseed Blocked", "Active tournaments cannot be reseeded — cancel and re-open instead.");
      return;
    }

    await this.repository.save({ ...state, updatedAt: Date.now() });
    await interaction.reply({
      embeds: [buildSuccessEmbed({ title: "Reseed Queued", description: "Participants will be reseeded when the tournament starts." })],
      ephemeral: true,
    });
  }

  // ---------- Helpers -------------------------------------------------------

  private async requireTournament(interaction: ChatInputCommandInteraction, tournamentId: string): Promise<TournamentState | null> {
    const state = await this.repository.get(tournamentId);
    if (!state) {
      await this.replyError(interaction, "Tournament Not Found", `No tournament with id \`${tournamentId}\`.`);
      return null;
    }
    return state;
  }

  private async replyError(interaction: ChatInputCommandInteraction, title: string, description: string): Promise<void> {
    await interaction.reply({
      embeds: [buildErrorEmbed({ title, description })],
      ephemeral: true,
    });
  }

  /**
   * Schedule each newly-active match through PazaakCoordinator.createDirectMatch,
   * record the engine match id on the tournament match, and update the reverse
   * index so later settlements can route back to advanceTournament.
   */
  private async scheduleMatches(
    state: TournamentState,
    matches: readonly TournamentMatchRecord[],
    channelId: string | null,
  ): Promise<TournamentState> {
    let next = state;
    for (const match of matches) {
      if (!match.participantAId || !match.participantBId) continue;
      if (match.engineMatchId) continue;

      const participantA = next.participants[match.participantAId];
      const participantB = next.participants[match.participantBId];
      if (!participantA || !participantB) continue;

      try {
        const engineMatch = this.coordinator.createDirectMatch({
          channelId: channelId ?? state.channelId ?? "tournament",
          challengerId: participantA.userId,
          challengerName: participantA.displayName,
          opponentId: participantB.userId,
          opponentName: participantB.displayName,
          gameMode: state.gameMode,
          setsToWin: state.setsPerMatch,
        });
        next = attachEngineMatchId(next, match.id, engineMatch.id);
        this.engineMatchToTournament.set(engineMatch.id, next.id);
      } catch (err) {
        this.logger.error("Tournament match scheduling failed.", err instanceof Error ? err.message : String(err));
      }
    }
    return next;
  }

  private async applyMatchReport(
    interaction: ChatInputCommandInteraction,
    state: TournamentState,
    match: TournamentMatchRecord,
    winnerId: string,
  ): Promise<void> {
    if (match.state !== "active") {
      await this.replyError(interaction, "Match Not Active", `Match is currently **${match.state}**.`);
      return;
    }

    if (winnerId !== match.participantAId && winnerId !== match.participantBId) {
      await this.replyError(interaction, "Invalid Winner", "Winner must be one of the match participants.");
      return;
    }

    let result;
    try {
      result = advanceTournament(state, { matchId: match.id, winnerUserId: winnerId });
    } catch (err) {
      await this.replyError(interaction, "Advance Failed", err instanceof Error ? err.message : String(err));
      return;
    }

    const nextState = await this.scheduleMatches(result.state, result.matchesToSchedule, interaction.channelId);
    await this.repository.save(nextState);

    // If the match had an engine match in progress, clear the forward linkage.
    if (match.engineMatchId) {
      this.engineMatchToTournament.delete(match.engineMatchId);
    }

    await interaction.reply({
      embeds: [buildSuccessEmbed({
        title: "Match Reported",
        description: result.tournamentCompleted
          ? `Match recorded. **${nextState.name}** is complete — champion: **${resolveParticipantName(nextState, nextState.championUserId)}**.`
          : result.newSwissRound !== null
            ? `Match recorded. Advancing to Swiss round ${result.newSwissRound}.`
            : `Match recorded. ${result.matchesToSchedule.length} match(es) scheduled next.`,
      })],
      ephemeral: false,
    });
  }

  private buildTournamentEmbed(state: TournamentState, title: string): EmbedBuilder {
    const participantCount = Object.keys(state.participants).length;
    return buildInfoEmbed({
      title: `${title} — ${state.name}`,
      description: `Id: \`${state.id}\`\nFormat: **${state.format.replace("_", "-")}**  |  Mode: **${state.gameMode}**\nStatus: **${state.status}**  |  Participants: **${participantCount}**${state.maxParticipants !== null ? `/${state.maxParticipants}` : ""}\nSets per match: ${state.setsPerMatch}${state.format === "swiss" ? `  |  Rounds: ${state.rounds}` : ""}`,
    });
  }

  private buildBracketEmbed(state: TournamentState, view: TournamentBracketView): EmbedBuilder {
    const lines: string[] = [];
    if (view.columns.length === 0) {
      lines.push("No matches yet. Start the tournament to generate the bracket.");
    }

    for (const column of view.columns) {
      const bracketLabel = column.bracket === "swiss"
        ? `Round ${column.round}`
        : column.bracket === "grand_final_reset"
          ? "Grand Final Reset"
          : column.bracket === "grand_final"
            ? "Grand Final"
            : `${column.bracket[0]!.toUpperCase()}${column.bracket.slice(1)} Round ${column.round}`;

      lines.push(`**${bracketLabel}**`);
      for (const match of column.matches) {
        const a = resolveParticipantName(state, match.participantAId) ?? "TBD";
        const b = match.participantBId ? resolveParticipantName(state, match.participantBId) : "BYE";
        const annotation = match.state === "reported"
          ? ` — ${match.winnerUserId ? `W: ${resolveParticipantName(state, match.winnerUserId)}` : "draw"}`
          : match.state === "bye"
            ? " — bye"
            : match.state === "active"
              ? " — in progress"
              : "";
        lines.push(`  \`${match.id.slice(0, 8)}\` ${a} vs ${b}${annotation}`);
      }
    }

    return buildInfoEmbed({
      title: `Bracket — ${state.name}`,
      description: lines.join("\n").slice(0, 4000),
    });
  }
}

const resolveParticipantName = (state: TournamentState, userId: string | null): string => {
  if (!userId) return "TBD";
  const participant: TournamentParticipant | undefined = state.participants[userId];
  return participant?.displayName ?? userId;
};
