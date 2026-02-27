export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const getBackoffMs = (attempt: number, initialBackoffMs: number, maxBackoffMs: number): number => {
  const growth = Math.pow(2, Math.max(0, attempt - 1));
  return Math.min(maxBackoffMs, Math.floor(initialBackoffMs * growth));
};
