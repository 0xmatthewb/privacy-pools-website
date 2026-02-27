import { chainData } from '~/config';
import { AccountService } from '~/types';
import { DiscoveredCommitment, MigrationAccountDiscovery, MigrationPoolInfo, Scope } from '../types/migration';

export const normalizeScope = (scope: Scope): string => {
  return typeof scope === 'bigint' ? scope.toString() : scope;
};

export const normalizeLabel = (label: bigint | string): string => {
  return typeof label === 'bigint' ? label.toString() : label;
};

export const uniqueSorted = (values: Iterable<number>): number[] => {
  return [...new Set(values)].sort((a, b) => a - b);
};

const toBigInt = (value: unknown): bigint | null => {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === 'string' && value.trim()) {
    try {
      return BigInt(value);
    } catch {
      return null;
    }
  }
  return null;
};

const toLabel = (value: unknown): bigint | string => {
  if (typeof value === 'bigint' || typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  return String(value);
};

const toCommitmentKey = (chainId: number, scope: Scope, label: bigint | string): string => {
  return `${chainId}-${normalizeScope(scope)}-${normalizeLabel(label)}`;
};

const sortPools = (pools: MigrationPoolInfo[]): MigrationPoolInfo[] => {
  return pools.sort((a, b) => a.chainId - b.chainId || normalizeScope(a.scope).localeCompare(normalizeScope(b.scope)));
};

export const addPools = (
  pools: MigrationPoolInfo[],
  additionalPools: readonly MigrationPoolInfo[],
): MigrationPoolInfo[] => {
  const seen = new Set(pools.map((pool) => `${pool.chainId}-${normalizeScope(pool.scope)}`));
  const output = [...pools];

  for (const pool of additionalPools) {
    const dedupeKey = `${pool.chainId}-${normalizeScope(pool.scope)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    output.push(pool);
  }

  return sortPools(output);
};

export const createScopeToChainIndex = (): Map<string, number> => {
  const output = new Map<string, number>();

  for (const chain of Object.values(chainData)) {
    for (const pool of chain.poolInfo) {
      const normalizedScope = normalizeScope(pool.scope);
      if (!output.has(normalizedScope)) {
        output.set(normalizedScope, pool.chainId);
      }
    }
  }

  return output;
};

export const extractPoolsFromAccountState = (
  accountHandle: unknown,
  scopeToChainIndex: ReadonlyMap<string, number>,
): MigrationPoolInfo[] => {
  const accountState = (accountHandle as { account?: { poolAccounts?: Map<unknown, unknown[]> } })?.account;
  const poolAccounts = accountState?.poolAccounts;
  if (!(poolAccounts instanceof Map)) return [];

  const pools: MigrationPoolInfo[] = [];
  for (const rawScope of poolAccounts.keys()) {
    const normalizedScope = normalizeScope(rawScope as Scope);
    const chainId = scopeToChainIndex.get(normalizedScope);
    if (!chainId) continue;

    pools.push({
      chainId,
      scope: normalizedScope,
    });
  }

  return addPools([], pools);
};

const extractFromSpendableMap = (
  spendableByScope: Map<unknown, unknown>,
  scopeToChainIndex: ReadonlyMap<string, number>,
): DiscoveredCommitment[] => {
  const commitments: DiscoveredCommitment[] = [];

  for (const [rawScope, rawEntries] of spendableByScope.entries()) {
    const normalizedScope = normalizeScope(rawScope as Scope);
    const chainId = scopeToChainIndex.get(normalizedScope);
    if (!chainId || !Array.isArray(rawEntries)) continue;

    for (const entry of rawEntries) {
      const value = toBigInt((entry as { value?: unknown }).value);
      if (value === null || value <= 0n) continue;

      commitments.push({
        chainId,
        scope: normalizedScope,
        label: toLabel((entry as { label?: unknown }).label),
        hash: (entry as { hash?: bigint | string }).hash,
        value,
      });
    }
  }

  return commitments;
};

const extractFromAccountState = (
  accountHandle: unknown,
  scopeToChainIndex: ReadonlyMap<string, number>,
): DiscoveredCommitment[] => {
  const accountState = (accountHandle as { account?: { poolAccounts?: Map<unknown, unknown[]> } })?.account;
  const poolAccounts = accountState?.poolAccounts;
  if (!(poolAccounts instanceof Map)) return [];

  const commitments: DiscoveredCommitment[] = [];

  for (const [rawScope, rawAccounts] of poolAccounts.entries()) {
    if (!Array.isArray(rawAccounts)) continue;

    const normalizedScope = normalizeScope(rawScope as Scope);
    const chainId = scopeToChainIndex.get(normalizedScope);
    if (!chainId) continue;

    for (const rawAccount of rawAccounts) {
      if ((rawAccount as { ragequit?: unknown }).ragequit) continue;

      const account = rawAccount as {
        deposit?: { label?: unknown; value?: unknown; hash?: bigint | string };
        children?: Array<{ label?: unknown; value?: unknown; hash?: bigint | string }>;
      };
      const children = account.children ?? [];
      const lastCommitment = children.length > 0 ? children[children.length - 1] : account.deposit;
      if (!lastCommitment) continue;

      const value = toBigInt(lastCommitment.value);
      if (value === null || value <= 0n) continue;

      commitments.push({
        chainId,
        scope: normalizedScope,
        label: toLabel(lastCommitment.label),
        hash: lastCommitment.hash,
        value,
      });
    }
  }

  return commitments;
};

export const toMigrationDiscovery = (
  accountService: AccountService,
  scopeToChainIndex: ReadonlyMap<string, number>,
): MigrationAccountDiscovery => {
  const spendableByScope = (accountService as { getSpendableCommitments?: () => unknown }).getSpendableCommitments;

  const spendableCommitments =
    typeof spendableByScope === 'function'
      ? (() => {
          const candidate = spendableByScope.call(accountService);
          if (candidate instanceof Map) {
            return extractFromSpendableMap(candidate, scopeToChainIndex);
          }
          return extractFromAccountState(accountService, scopeToChainIndex);
        })()
      : extractFromAccountState(accountService, scopeToChainIndex);

  return {
    accountHandle: accountService,
    spendableCommitments,
    errors: [],
  };
};

export const addPoolsFromCommitments = (
  pools: MigrationPoolInfo[],
  commitments: readonly DiscoveredCommitment[],
): MigrationPoolInfo[] => {
  return addPools(
    pools,
    commitments.map((commitment) => ({
      chainId: commitment.chainId,
      scope: commitment.scope,
    })),
  );
};

export const collectCommitmentKeysByChain = (
  commitments: readonly DiscoveredCommitment[],
): Map<number, Set<string>> => {
  const output = new Map<number, Set<string>>();

  for (const commitment of commitments) {
    const bucket = output.get(commitment.chainId) ?? new Set<string>();
    bucket.add(toCommitmentKey(commitment.chainId, commitment.scope, commitment.label));
    output.set(commitment.chainId, bucket);
  }

  return output;
};

export const collectLegacyHistoryKeysByChain = (
  accountService: AccountService,
  scopeToChainIndex: ReadonlyMap<string, number>,
): Map<number, Set<string>> => {
  const output = new Map<number, Set<string>>();
  const accountState = (accountService as { account?: { poolAccounts?: Map<unknown, unknown[]> } })?.account;
  const poolAccounts = accountState?.poolAccounts;
  if (!(poolAccounts instanceof Map)) return output;

  for (const [rawScope, rawAccounts] of poolAccounts.entries()) {
    if (!Array.isArray(rawAccounts)) continue;

    const normalizedScope = normalizeScope(rawScope as Scope);
    const chainId = scopeToChainIndex.get(normalizedScope);
    if (!chainId) continue;

    for (const rawAccount of rawAccounts) {
      if ((rawAccount as { ragequit?: unknown }).ragequit) continue;

      const account = rawAccount as {
        label?: unknown;
        deposit?: { label?: unknown };
      };
      const rawLabel = account.label ?? account.deposit?.label;
      if (rawLabel === undefined || rawLabel === null) continue;

      const bucket = output.get(chainId) ?? new Set<string>();
      bucket.add(toCommitmentKey(chainId, normalizedScope, toLabel(rawLabel)));
      output.set(chainId, bucket);
    }
  }

  return output;
};

export const countIntersection = (left: ReadonlySet<string>, right: ReadonlySet<string>): number => {
  let matches = 0;
  for (const value of left) {
    if (right.has(value)) matches += 1;
  }
  return matches;
};
