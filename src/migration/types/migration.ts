import { Hash } from '~/types';

export type Scope = bigint | string;

export type MigrationFlowState = 'intro' | 'migrating' | 'success' | 'failed';

export interface MigrationPoolInfo {
  chainId: number;
  scope: Scope;
}

export interface DiscoveredCommitment {
  chainId: number;
  scope: Scope;
  label: bigint | string;
  value: bigint;
  hash?: bigint | string;
}

export interface MigrationAccountDiscovery {
  accountHandle: unknown;
  spendableCommitments: DiscoveredCommitment[];
  errors?: readonly unknown[];
}

export interface ChainDerivedStatus {
  expectedLegacyCommitments?: number;
  legacyMasterSeedNullifiedCount?: number;
  migratedCommitments?: number;
  hasPostMigrationCommitments?: boolean;
}

export interface MigrationChainReadiness {
  expectedLegacyCommitments: number;
  migratedCommitments: number;
  legacyMasterSeedNullifiedCount: number;
  hasPostMigrationCommitments: boolean;
  isMigrated: boolean;
  legacySpendableCommitments: number;
  upgradedSpendableCommitments: number;
  scopes: Scope[];
}

export interface MigrationReadinessSnapshot {
  chains: Record<number, MigrationChainReadiness>;
  requiresMigration: boolean;
  isFullyMigrated: boolean;
  requiredChainIds: number[];
  migratedChainIds: number[];
  missingChainIds: number[];
  diagnostics: {
    warnings: string[];
    legacyErrors: unknown[];
    upgradedErrors: unknown[];
  };
}

export interface MigrationProofShape {
  proof: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
  };
  publicSignals: string[];
}

export interface MigrationProofBundle {
  chainId: number;
  scope: Hash;
  poolAddress: `0x${string}`;
  commitmentLabel: bigint | string;
  commitmentHash: bigint | string;
  withdrawal: {
    processooor: `0x${string}`;
    data: `0x${string}`;
  };
  proof: MigrationProofShape;
}

export interface MigrationContextState {
  isActive: boolean;
  isBlocking: boolean;
  flowState: MigrationFlowState;
  errorMessage: string | null;
  migrationReadiness: MigrationReadinessSnapshot | null;
  retryCount: number;
  maxRetries: number;
}
