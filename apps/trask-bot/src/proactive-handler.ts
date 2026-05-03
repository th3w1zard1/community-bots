import { randomUUID } from "node:crypto";

import type { Client, Message, NewsChannel, TextChannel } from "discord.js";

import type { TraskBotConfig } from "@openkotor/config";
import type { Logger } from "@openkotor/core";
import type { JsonTraskQueryRepository } from "@openkotor/persistence";
import {
  classifyTraskProactiveMessage,
  createOpenAiClient,
  formatProactivePlainReply,
  type ResearchWizardClient,
  scoreResearchAlignment,
} from "@openkotor/trask";

type Pending = {
  messageId: string;
  channelId: string;
  authorId: string;
  content: string;
};

const isTextableChannel = (channel: Message["channel"]): channel is TextChannel | NewsChannel => {
  return channel.isTextBased() && !channel.isDMBased();
};

const resolveProactiveChannelIds = (config: TraskBotConfig): string[] => {
  return config.proactive.channelIds.length > 0 ? config.proactive.channelIds : config.approvedChannelIds;
};

const shouldIgnoreMessage = (message: Message, config: TraskBotConfig): boolean => {
  if (message.author.bot) {
    return true;
  }

  if (!message.guildId || !isTextableChannel(message.channel)) {
    return true;
  }

  const content = message.content.trim();

  if (content.length === 0) {
    return true;
  }

  if (content.length < config.proactive.minMessageLength || content.length > config.proactive.maxMessageLength) {
    return true;
  }

  if (content.startsWith("/")) {
    return true;
  }

  return false;
};

export const registerTraskProactiveHandlers = (
  client: Client,
  config: TraskBotConfig,
  researchWizard: ResearchWizardClient,
  logger: Logger,
  queryRepository?: JsonTraskQueryRepository,
): void => {
  const openAi = createOpenAiClient(config.ai);

  if (!openAi) {
    logger.warn("Trask proactive mode needs OPENAI_API_KEY or OPENROUTER_API_KEY for classification and embeddings.");
    return;
  }

  const channelAllowlist = new Set(resolveProactiveChannelIds(config));

  if (channelAllowlist.size === 0) {
    logger.warn(
      "Trask proactive mode needs TRASK_PROACTIVE_CHANNEL_IDS or TRASK_APPROVED_CHANNEL_IDS — no channels resolved; proactive listener not attached.",
    );
    return;
  }

  const isAllowedGuild = (guildId: string | null): boolean => {
    if (config.allowedGuildIds.length === 0) {
      return true;
    }

    return guildId !== null && config.allowedGuildIds.includes(guildId);
  };

  const pendingByChannel = new Map<string, Pending>();
  const timers = new Map<string, NodeJS.Timeout>();
  const userCooldownUntil = new Map<string, number>();

  const clearTimer = (channelId: string): void => {
    const existing = timers.get(channelId);

    if (existing) {
      clearTimeout(existing);
      timers.delete(channelId);
    }
  };

  const processPending = async (channelId: string): Promise<void> => {
    timers.delete(channelId);
    const pending = pendingByChannel.get(channelId);
    pendingByChannel.delete(channelId);

    if (!pending) {
      return;
    }

    try {
      const channel = await client.channels.fetch(channelId);

      if (!channel || !("messages" in channel) || channel.isDMBased()) {
        return;
      }

      const trigger = await channel.messages.fetch(pending.messageId).catch(() => null);

      if (!trigger || trigger.content.trim() !== pending.content.trim()) {
        return;
      }

      const competing = await channel.messages.fetch({ limit: 20, after: pending.messageId }).catch(() => null);

      if (competing) {
        for (const [, newer] of competing) {
          if (newer.author.bot) {
            continue;
          }

          if (newer.author.id === pending.authorId) {
            continue;
          }

          if (newer.content.trim().length >= config.proactive.competingReplyMinLength) {
            logger.debug("Skipping proactive reply — competing human message detected.", {
              channelId,
              triggerId: pending.messageId,
              competitorId: newer.id,
            });
            return;
          }
        }
      }

      const classification = await classifyTraskProactiveMessage(
        openAi,
        config.proactive.classifierModel,
        pending.content,
      );

      if (
        !classification ||
        !classification.isQuestion ||
        !classification.kotorRelevant ||
        classification.confidence < config.proactive.classifierMinConfidence
      ) {
        logger.debug("Skipping proactive reply — classifier rejected message.", {
          channelId,
          classification,
        });
        return;
      }

      const now = Date.now();
      const cooldownUntil = userCooldownUntil.get(pending.authorId) ?? 0;

      if (cooldownUntil > now) {
        logger.debug("Skipping proactive reply — user cooldown.", { authorId: pending.authorId });
        return;
      }

      const brief = await researchWizard.answerQuestionBrief(pending.content);

      const similarity = await scoreResearchAlignment(openAi, config.ai.embeddingModel, {
        question: pending.content,
        answerMarkdown: brief.answer,
        researchReport: brief.researchReport,
      });

      if (similarity < config.proactive.similarityThreshold) {
        logger.debug("Skipping proactive reply — semantic gate.", { channelId, similarity });
        return;
      }

      const plain = formatProactivePlainReply(brief.answer, {
        maxBodyChars: Math.min(520, config.proactive.maxReplyChars),
        maxSources: 3,
      });

      let outbound = plain.slice(0, config.proactive.maxReplyChars);

      if (outbound.length === 0) {
        return;
      }

      if (!outbound.includes("Sources:") && brief.approvedSources.length > 0) {
        const urls = brief.approvedSources
          .slice(0, 3)
          .map((s) => s.homeUrl)
          .join(" · ");
        outbound = `${outbound}\n\nSources: ${urls}`.slice(0, config.proactive.maxReplyChars);
      }

      await trigger.reply({
        content: outbound,
        allowedMentions: { repliedUser: false, parse: [] },
      });

      if (queryRepository) {
        const queryId = randomUUID();
        const threadId = randomUUID();
        const createdAt = new Date().toISOString();
        await queryRepository.append({
          queryId,
          threadId,
          userId: pending.authorId,
          query: pending.content,
          status: "complete",
          answer: outbound,
          sources: brief.approvedSources.map((source) => ({
            id: source.id,
            name: source.name,
            url: source.homeUrl,
          })),
          error: null,
          createdAt,
          completedAt: createdAt,
        });
      }

      userCooldownUntil.set(pending.authorId, now + config.proactive.userCooldownMs);
    } catch (error) {
      logger.error("Trask proactive pipeline failed.", error instanceof Error ? error : { error: String(error) });
    }
  };

  client.on("messageCreate", (message: Message) => {
    if (!isAllowedGuild(message.guildId)) {
      return;
    }

    if (!channelAllowlist.has(message.channelId)) {
      return;
    }

    if (shouldIgnoreMessage(message, config)) {
      return;
    }

    const pending: Pending = {
      messageId: message.id,
      channelId: message.channelId,
      authorId: message.author.id,
      content: message.content.trim(),
    };

    pendingByChannel.set(message.channelId, pending);
    clearTimer(message.channelId);

    const timer = setTimeout(() => {
      void processPending(message.channelId);
    }, config.proactive.debounceMs);

    timers.set(message.channelId, timer);
  });

  logger.info("Trask proactive listener attached.", {
    channelCount: channelAllowlist.size,
    debounceMs: config.proactive.debounceMs,
  });
};
