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

/**
 * Standard Multicall3 lacks a receive/fallback function. The privacy pool withdraw
 * path always attempts a native ETH transfer to `withdrawal.processor`, even when the
 * amount is 0, causing a FailedToSendNativeAsset() revert. This Multicall3 variant
 * includes a payable fallback so it can safely act as the withdrawal processor.
 *
 * mainnet: https://etherscan.io/address/0xe3b3DBB09193Db1BC4A37f1Fc2ac027A11b76134#code
 * optimism: https://optimistic.etherscan.io/address/0xe3b3DBB09193Db1BC4A37f1Fc2ac027A11b76134#code
 * arbitrum: https://arbiscan.io/address/0xe3b3DBB09193Db1BC4A37f1Fc2ac027A11b76134#code
 * bsc: https://bscscan.com/address/0xe3b3DBB09193Db1BC4A37f1Fc2ac027A11b76134#code
 */
export const MULTICALL3_WITH_FALLBACK = '0xe3b3DBB09193Db1BC4A37f1Fc2ac027A11b76134';
