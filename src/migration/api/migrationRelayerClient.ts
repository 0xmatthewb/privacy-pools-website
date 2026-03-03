import { MigrationRelayerCallInput, MigrationRelayerResponse } from '../types/relayer';

const DEFAULT_TIMEOUT_MS = 60_000;

const parseJsonSafely = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const isMigrationRelayerResponse = (value: unknown): value is MigrationRelayerResponse => {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<MigrationRelayerResponse>;
  return Array.isArray(candidate.failed) && Array.isArray(candidate.success);
};

export const migrationRelayerClient = async (input: MigrationRelayerCallInput): Promise<MigrationRelayerResponse> => {
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const endpoint = input.endpoint.trim().replace(/\/+$/, '');
  const migrateUrl = `${endpoint}/migrate`;

  if (!endpoint) {
    throw new Error('migrationRelayerClient: endpoint is required');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const relayerPayloads = input.payloads.map(({ txId, chainId, to, callData }) => ({
    txId,
    chainId,
    to,
    callData,
  }));

  try {
    const response = await fetchImpl(migrateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(relayerPayloads),
      signal: controller.signal,
    });

    const parsed = await parseJsonSafely(response);
    if (!response.ok) {
      throw new Error(`Migration relayer request failed with status ${response.status}`);
    }

    if (!isMigrationRelayerResponse(parsed)) {
      throw new Error('Migration relayer response shape is invalid');
    }

    return parsed;
  } finally {
    clearTimeout(timeout);
  }
};
