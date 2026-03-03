import { AccountService } from '~/types';
import { DiscoveredCommitment, MigrationChainReadiness, MigrationReadinessSnapshot, Scope } from '../types/migration';
import {
  createScopeToChainIndex,
  toMigrationDiscovery,
  extractPoolsFromAccountState,
  addPoolsFromCommitments,
  uniqueSorted,
  collectLegacyHistoryKeysByChain,
  collectCommitmentKeysByChain,
  countIntersection,
  normalizeScope,
  addPools,
} from '../utils/misc';

const createEmptyMigrationReadinessSnapshot = (): MigrationReadinessSnapshot => {
  return {
    chains: {},
    requiresMigration: false,
    isFullyMigrated: true,
    requiredChainIds: [],
    migratedChainIds: [],
    missingChainIds: [],
    diagnostics: {
      warnings: [],
      legacyErrors: [],
      upgradedErrors: [],
    },
  };
};

export const buildMigrationReadinessSnapshot = (input: {
  accountService: AccountService;
  legacyAccountService: AccountService;
}): MigrationReadinessSnapshot => {
  const scopeToChainIndex = createScopeToChainIndex();

  const legacyDiscovery = toMigrationDiscovery(input.legacyAccountService, scopeToChainIndex);
  const upgradedDiscovery = toMigrationDiscovery(input.accountService, scopeToChainIndex);

  const poolsFromAccountState = addPools(
    extractPoolsFromAccountState(input.legacyAccountService, scopeToChainIndex),
    extractPoolsFromAccountState(input.accountService, scopeToChainIndex),
  );

  const pools = addPoolsFromCommitments(
    addPoolsFromCommitments(poolsFromAccountState, legacyDiscovery.spendableCommitments),
    upgradedDiscovery.spendableCommitments,
  );

  if (pools.length === 0) {
    return createEmptyMigrationReadinessSnapshot();
  }

  const chainIds = uniqueSorted(pools.map((pool) => pool.chainId));
  const poolScopesByChain = new Map<number, Scope[]>();
  for (const pool of pools) {
    const scoped = poolScopesByChain.get(pool.chainId) ?? [];
    scoped.push(pool.scope);
    poolScopesByChain.set(pool.chainId, scoped);
  }

  const legacyByChain = new Map<number, DiscoveredCommitment[]>();
  const upgradedByChain = new Map<number, DiscoveredCommitment[]>();
  for (const chainId of chainIds) {
    legacyByChain.set(chainId, []);
    upgradedByChain.set(chainId, []);
  }

  for (const commitment of legacyDiscovery.spendableCommitments) {
    const bucket = legacyByChain.get(commitment.chainId);
    if (bucket) bucket.push(commitment);
  }

  for (const commitment of upgradedDiscovery.spendableCommitments) {
    const bucket = upgradedByChain.get(commitment.chainId);
    if (bucket) bucket.push(commitment);
  }

  const legacyHistoryKeysByChain = collectLegacyHistoryKeysByChain(input.legacyAccountService, scopeToChainIndex);
  const legacySpendableKeysByChain = collectCommitmentKeysByChain(legacyDiscovery.spendableCommitments);
  const upgradedSpendableKeysByChain = collectCommitmentKeysByChain(upgradedDiscovery.spendableCommitments);

  const warnings: string[] = [];
  const chains: Record<number, MigrationChainReadiness> = {};

  for (const chainId of chainIds) {
    const scopes = poolScopesByChain.get(chainId) ?? [];
    const legacyCommitments = legacyByChain.get(chainId) ?? [];
    const upgradedCommitments = upgradedByChain.get(chainId) ?? [];

    const legacySpendableCount = legacyCommitments.length;
    const upgradedSpendableCount = upgradedCommitments.length;
    const legacySpendableKeys = legacySpendableKeysByChain.get(chainId) ?? new Set<string>();
    const upgradedSpendableKeys = upgradedSpendableKeysByChain.get(chainId) ?? new Set<string>();
    const legacyHistoryKeys = legacyHistoryKeysByChain.get(chainId) ?? legacySpendableKeys;

    const migratedCommitments = countIntersection(upgradedSpendableKeys, legacyHistoryKeys);
    const expectedLegacyCommitments = new Set([
      ...legacySpendableKeys,
      ...[...upgradedSpendableKeys].filter((key) => legacyHistoryKeys.has(key)),
    ]).size;
    const legacyMasterSeedNullifiedCount = Math.max(expectedLegacyCommitments - legacySpendableKeys.size, 0);
    const hasPostMigrationCommitments = upgradedSpendableCount > 0;

    const isMigrated =
      expectedLegacyCommitments === 0
        ? true
        : migratedCommitments >= expectedLegacyCommitments &&
          legacyMasterSeedNullifiedCount >= expectedLegacyCommitments &&
          hasPostMigrationCommitments;

    chains[chainId] = {
      expectedLegacyCommitments,
      migratedCommitments,
      legacyMasterSeedNullifiedCount,
      hasPostMigrationCommitments,
      isMigrated,
      legacySpendableCommitments: legacySpendableCount,
      upgradedSpendableCommitments: upgradedSpendableCount,
      scopes: scopes.map((scope) => normalizeScope(scope)),
    };
  }

  const requiredChainIds = chainIds.filter((chainId) => {
    const chain = chains[chainId];
    return chain.expectedLegacyCommitments > 0 || chain.legacyMasterSeedNullifiedCount > 0;
  });
  const isFullyMigrated =
    requiredChainIds.length === 0 || requiredChainIds.every((chainId) => chains[chainId].isMigrated);
  const requiresMigration = requiredChainIds.length > 0 && !isFullyMigrated;
  const migratedChainIds = requiredChainIds.filter((chainId) => chains[chainId].isMigrated);
  const missingChainIds = requiredChainIds.filter((chainId) => !chains[chainId].isMigrated);

  return {
    chains,
    requiresMigration,
    isFullyMigrated,
    requiredChainIds,
    migratedChainIds,
    missingChainIds,
    diagnostics: {
      warnings,
      legacyErrors: [...(legacyDiscovery.errors ?? [])],
      upgradedErrors: [...(upgradedDiscovery.errors ?? [])],
    },
  };
};
