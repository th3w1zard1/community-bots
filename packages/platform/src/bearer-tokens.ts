export const extractBearerToken = (authorization: string | null | undefined): string | null => {
  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/iu);
  return match?.[1] ?? null;
};

export const requireBearerToken = (authorization: string | null | undefined): string => {
  const token = extractBearerToken(authorization);
  if (!token) {
    throw Object.assign(new Error("Missing or malformed Authorization header."), { status: 401 });
  }
  return token;
};
