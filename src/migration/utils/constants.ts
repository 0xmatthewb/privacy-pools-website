export const FALLBACK_MIGRATION_CHAIN_ID = 1;

export const MOCK_RELAYER_DELAY_MS = 1200;

export const MIGRATION_MESSAGES = {
  deriveStateFailed: 'Failed to derive migration state',
  success: 'Migration successful. Please sign in again to re-sync your account.',
  missingRequiredAccountData: 'Missing required account data to start migration.',
  failedToBuildPayloads: 'Failed to build migration transaction payloads.',
  noEligibleCommitments: 'No eligible commitments found for migration.',
  failedAfterMaxRetries: 'Migration failed after max retries. Please try again later.',
  unexpectedFailure: 'Migration failed unexpectedly',
} as const;
