const normalizeWhitespace = (value: string): string => value.replace(/\n{3,}/g, "\n\n").trim();

export const splitResearchAnswer = (value: string): { body: string; sourceLines: string[] } => {
  const match = /\nSources\s*\n/i.exec(value);

  if (!match) {
    return {
      body: normalizeWhitespace(value),
      sourceLines: [],
    };
  }

  const body = normalizeWhitespace(value.slice(0, match.index));
  const sourceLines = value
    .slice(match.index + match[0].length)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return { body, sourceLines };
};

/** Plain, chat-style reply (no embed): short body plus compact source URLs. */
export const formatProactivePlainReply = (
  rawAnswer: string,
  options: { maxBodyChars: number; maxSources: number },
): string => {
  const { body, sourceLines } = splitResearchAnswer(rawAnswer);
  let text = body.replace(/^#{1,6}\s+/gm, "").trim();

  if (text.length > options.maxBodyChars) {
    text = `${text.slice(0, Math.max(0, options.maxBodyChars - 1)).trimEnd()}…`;
  }

  const urls = sourceLines
    .map((line) => {
      const urlMatch = line.match(/https?:\/\/[^\s)]+/);
      return urlMatch ? urlMatch[0]!.replace(/[.,;:!?)]+$/, "") : null;
    })
    .filter((url): url is string => Boolean(url));

  const unique = [...new Set(urls)].slice(0, options.maxSources);

  if (unique.length === 0) {
    return text;
  }

  return `${text}\n\nSources: ${unique.join(" · ")}`;
};
