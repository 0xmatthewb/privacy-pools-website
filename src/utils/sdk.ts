'use client';

import {
  Circuits,
  CommitmentProof,
  PrivacyPoolSDK,
  WithdrawalProofInput,
  calculateContext,
  Withdrawal,
  Secret,
  generateMerkleProof,
  Hash,
  WithdrawalProof,
  AccountService,
  DataService,
  PrivacyPoolAccount,
  AccountCommitment,
  ChainConfig,
  PoolInfo,
  PoolEventsError,
  hashPrecommitment,
} from '@0xbow/privacy-pools-core-sdk';
import { createPublicClient, Hex } from 'viem';
import { ChainData, chainData, whitelistedChains } from '~/config';
import { transports } from '~/config/wagmiConfig';
import { PoolAccount, ReviewStatus } from '~/types';
import { getTimestampFromBlockNumber } from '~/utils';

const chainDataByWhitelistedChains = Object.values(chainData).filter(
  (chain) => chain.poolInfo.length > 0 && whitelistedChains.some((c) => c.id === chain.poolInfo[0].chainId),
);

const poolsByChain = chainDataByWhitelistedChains.flatMap(
  (chain) => chain.poolInfo,
) as ChainData[keyof ChainData]['poolInfo'];

// Lazy load circuits only when needed
let circuits: Circuits | null = null;
let sdk: PrivacyPoolSDK | null = null;

const initializeSDK = () => {
  if (!circuits) {
    // Ensure we have a valid baseUrl (client-side only)
    const currentBaseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    if (!currentBaseUrl) {
      throw new Error('SDK can only be initialized on client-side');
    }
    circuits = new Circuits({ baseUrl: currentBaseUrl });
    sdk = new PrivacyPoolSDK(circuits);
  }
  return sdk!;
};

const pools: PoolInfo[] = poolsByChain.map((pool) => {
  return {
    chainId: pool.chainId,
    address: pool.address,
    scope: pool.scope as Hash,
    deploymentBlock: pool.deploymentBlock,
  };
});

const dataServiceConfig: ChainConfig[] = poolsByChain.map((pool) => {
  return {
    chainId: pool.chainId,
    privacyPoolAddress: pool.address,
    startBlock: pool.deploymentBlock,
    rpcUrl: chainData[pool.chainId].sdkRpcUrl,
    apiKey: 'sdk', // It's not an api key https://viem.sh/docs/clients/public#key-optional
  };
});
const dataService = new DataService(dataServiceConfig);

/**
 * Generates a zero-knowledge proof for a commitment using Poseidon hash.
 *
 * @param value - The value being committed to
 * @param label - Label associated with the commitment
 * @param nullifier - Unique nullifier for the commitment
 * @param secret - Secret key for the commitment
 * @returns Promise resolving to proof and public signals
 * @throws {ProofError} If proof generation fails
 */
export const generateRagequitProof = async (commitment: AccountCommitment): Promise<CommitmentProof> => {
  // CRITICAL DEBUG: Log commitment at SDK generateRagequitProof entry
  console.log('🔍 [COMMITMENT_DEBUG] SDK generateRagequitProof entry:', {
    hash: commitment.hash,
    label: commitment.label,
    value: commitment.value,
    commitmentStringified: JSON.stringify({ ...commitment, secret: '', nullifier: '' }, (_, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    ),
    timestamp: new Date().toISOString(),
  });

  const sdkInstance = initializeSDK();
  const result = await sdkInstance.proveCommitment(
    commitment.value,
    commitment.label,
    commitment.nullifier,
    commitment.secret,
  );

  // CRITICAL DEBUG: Log commitment after SDK ragequit proof call
  console.log('🔍 [COMMITMENT_DEBUG] SDK generateRagequitProof exit:', {
    hash: commitment.hash,
    label: commitment.label,
    value: commitment.value,
    timestamp: new Date().toISOString(),
  });

  return result;
};

/**
 * Verifies a commitment proof.
 *
 * @param proof - The commitment proof to verify
 * @param publicSignals - Public signals associated with the proof
 * @returns Promise resolving to boolean indicating proof validity
 * @throws {ProofError} If verification fails
 */
export const verifyRagequitProof = async ({ proof, publicSignals }: CommitmentProof) => {
  const sdkInstance = initializeSDK();
  return await sdkInstance.verifyCommitment({ proof, publicSignals });
};

/**
 * Generates a withdrawal proof.
 *
 * @param commitment - Commitment to withdraw
 * @param input - Input parameters for the withdrawal
 * @param withdrawal - Withdrawal details
 * @returns Promise resolving to withdrawal payload
 * @throws {ProofError} If proof generation fails
 */
export const generateWithdrawalProof = async (commitment: AccountCommitment, input: WithdrawalProofInput) => {
  // CRITICAL DEBUG: Log commitment at SDK generateWithdrawalProof entry
  console.log('🔍 [COMMITMENT_DEBUG] SDK generateWithdrawalProof entry:', {
    hash: commitment.hash,
    label: commitment.label,
    value: commitment.value,
    commitmentStringified: JSON.stringify({ ...commitment, secret: '', nullifier: '' }, (_, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    ),
    timestamp: new Date().toISOString(),
  });

  const sdkInstance = initializeSDK();

  const precommitmentHash = hashPrecommitment(commitment.nullifier, commitment.secret);

  const commitmentInput = {
    preimage: {
      label: commitment.label,
      value: commitment.value,
      precommitment: {
        hash: precommitmentHash,
        nullifier: commitment.nullifier,
        secret: commitment.secret,
      },
    },
    hash: commitment.hash,
    nullifierHash: precommitmentHash,
  };

  // CRITICAL DEBUG: Log commitment input to SDK
  console.log('🔍 [COMMITMENT_DEBUG] SDK commitment input:', {
    original: { ...commitment, secret: '', nullifier: '' },
    transformed: { ...commitmentInput, precommitment: { hash: commitmentInput.hash } },
    timestamp: new Date().toISOString(),
  });

  const result = await sdkInstance.proveWithdrawal(commitmentInput, input);

  // CRITICAL DEBUG: Log commitment after SDK call
  console.log('🔍 [COMMITMENT_DEBUG] SDK generateWithdrawalProof exit:', {
    hash: commitment.hash,
    label: commitment.label,
    value: commitment.value,
    timestamp: new Date().toISOString(),
  });

  return result;
};

export const getContext = async (withdrawal: Withdrawal, scope: Hash) => {
  return await calculateContext(withdrawal, scope);
};

export const getMerkleProof = async (leaves: bigint[], leaf: bigint) => {
  return await generateMerkleProof(leaves, leaf);
};

export const verifyWithdrawalProof = async (proof: WithdrawalProof) => {
  const sdkInstance = initializeSDK();
  return await sdkInstance.verifyWithdrawal(proof);
};

export const createAccount = (seed: string) => {
  const accountService = new AccountService(dataService, { mnemonic: seed });

  return accountService;
};

export const loadAccount = async (
  seed: string,
): Promise<{ accountService: AccountService; errors: PoolEventsError[] }> => {
  const result = await AccountService.initializeWithEvents(dataService, { mnemonic: seed }, pools);

  // Log any errors that occurred during event fetching
  if (result.errors.length > 0) {
    console.warn('Some pools failed to load:', result.errors);
  }

  return {
    accountService: result.account,
    errors: result.errors,
  };
};

export const createDepositSecrets = (accountService: AccountService, scope: Hash, index: bigint) => {
  return accountService.createDepositSecrets(scope, index);
};

export const createWithdrawalSecrets = (accountService: AccountService, commitment: AccountCommitment) => {
  // CRITICAL DEBUG: Log commitment at createWithdrawalSecrets entry
  console.log('🔍 [COMMITMENT_DEBUG] SDK createWithdrawalSecrets entry:', {
    hash: commitment.hash,
    label: commitment.label,
    value: commitment.value,
    commitmentStringified: JSON.stringify({ ...commitment, secret: '', nullifier: '' }, (_, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    ),
    timestamp: new Date().toISOString(),
  });

  const result = accountService.createWithdrawalSecrets(commitment);

  // CRITICAL DEBUG: Log commitment after createWithdrawalSecrets
  console.log('🔍 [COMMITMENT_DEBUG] SDK createWithdrawalSecrets exit:', {
    hash: commitment.hash,
    label: commitment.label,
    value: commitment.value,
    commitmentModified:
      JSON.stringify(commitment, (_, v) => (typeof v === 'bigint' ? v.toString() : v)) !==
      JSON.stringify(
        {
          hash: commitment.hash,
          label: commitment.label,
          value: commitment.value,
          nullifier: commitment.nullifier,
          secret: commitment.secret,
        },
        (_, v) => (typeof v === 'bigint' ? v.toString() : v),
      ),
    timestamp: new Date().toISOString(),
  });

  return result;
};

export const addPoolAccount = (
  accountService: AccountService,
  newPoolAccount: {
    scope: bigint;
    value: bigint;
    nullifier: Secret;
    secret: Secret;
    label: Hash;
    blockNumber: bigint;
    txHash: Hex;
  },
) => {
  const accountInfo = accountService.addPoolAccount(
    newPoolAccount.scope as Hash,
    newPoolAccount.value,
    newPoolAccount.nullifier,
    newPoolAccount.secret,
    newPoolAccount.label,
    newPoolAccount.blockNumber,
    newPoolAccount.txHash,
  );

  return accountInfo;
};

export const addWithdrawal = async (
  accountService: AccountService,
  withdrawalParams: {
    parentCommitment: AccountCommitment;
    value: bigint;
    nullifier: Secret;
    secret: Secret;
    blockNumber: bigint;
    txHash: Hex;
  },
) => {
  // CRITICAL DEBUG: Log parentCommitment before addWithdrawalCommitment
  console.log('🔍 [COMMITMENT_DEBUG] addWithdrawal entry - parentCommitment:', {
    hash: withdrawalParams.parentCommitment.hash,
    label: withdrawalParams.parentCommitment.label,
    value: withdrawalParams.parentCommitment.value,
    hasNullifier:
      !!withdrawalParams.parentCommitment.nullifier && String(withdrawalParams.parentCommitment.nullifier) !== '',
    hasSecret: !!withdrawalParams.parentCommitment.secret && String(withdrawalParams.parentCommitment.secret) !== '',
    newValue: withdrawalParams.value,
    timestamp: new Date().toISOString(),
  });

  const result = accountService.addWithdrawalCommitment(
    withdrawalParams.parentCommitment,
    withdrawalParams.value,
    withdrawalParams.nullifier,
    withdrawalParams.secret,
    withdrawalParams.blockNumber,
    withdrawalParams.txHash,
  );

  // CRITICAL DEBUG: Log parentCommitment after addWithdrawalCommitment
  console.log('🔍 [COMMITMENT_DEBUG] addWithdrawal exit - parentCommitment after SDK call:', {
    hash: withdrawalParams.parentCommitment.hash,
    label: withdrawalParams.parentCommitment.label,
    value: withdrawalParams.parentCommitment.value,
    hasNullifier:
      !!withdrawalParams.parentCommitment.nullifier && String(withdrawalParams.parentCommitment.nullifier) !== '',
    hasSecret: !!withdrawalParams.parentCommitment.secret && String(withdrawalParams.parentCommitment.secret) !== '',
    timestamp: new Date().toISOString(),
  });

  return result;
};

export const addRagequit = async (
  accountService: AccountService,
  ragequitParams: {
    label: Hash;
    ragequit: {
      ragequitter: string;
      commitment: Hash;
      label: Hash;
      value: bigint;
      blockNumber: bigint;
      transactionHash: Hex;
    };
  },
) => {
  return accountService.addRagequitToAccount(ragequitParams.label, ragequitParams.ragequit);
};

export const getPoolAccountsFromAccount = async (account: PrivacyPoolAccount, chainId: number) => {
  const paMap = account.poolAccounts.entries();
  const poolAccounts = [];

  for (const [_scope, _poolAccounts] of paMap) {
    let idx = 1;

    for (const poolAccount of _poolAccounts) {
      // CRITICAL DEBUG: Log before computing lastCommitment
      console.log('🔍 [COMMITMENT_DEBUG] Computing lastCommitment for poolAccount:', {
        hasChildren: poolAccount.children.length > 0,
        childrenCount: poolAccount.children.length,
        deposit: {
          hash: poolAccount.deposit.hash,
          label: poolAccount.deposit.label,
          value: poolAccount.deposit.value,
          hasNullifier: !!poolAccount.deposit.nullifier && String(poolAccount.deposit.nullifier) !== '',
          hasSecret: !!poolAccount.deposit.secret && String(poolAccount.deposit.secret) !== '',
          blockNumber: poolAccount.deposit.blockNumber,
        },
        children: poolAccount.children.map((child, index) => ({
          index,
          hash: child.hash,
          label: child.label,
          value: child.value,
          hasNullifier: !!child.nullifier && String(child.nullifier) !== '',
          hasSecret: !!child.secret && String(child.secret) !== '',
          blockNumber: child.blockNumber,
        })),
        timestamp: new Date().toISOString(),
      });

      // CRITICAL FIX: Find the spendable commitment (one with valid nullifier/secret)
      // Start with the last child and work backwards, then check deposit
      let lastCommitment = poolAccount.deposit;
      let commitmentSource = 'deposit';

      // Check children from newest to oldest for one with valid secrets
      for (let i = poolAccount.children.length - 1; i >= 0; i--) {
        const child = poolAccount.children[i];
        if (child.nullifier && String(child.nullifier) !== '' && child.secret && String(child.secret) !== '') {
          lastCommitment = child;
          commitmentSource = `children[${i}]`;
          break;
        }
      }

      // If no children have secrets, verify deposit has secrets, otherwise it's an error
      if (
        commitmentSource === 'deposit' &&
        (!lastCommitment.nullifier ||
          String(lastCommitment.nullifier) === '' ||
          !lastCommitment.secret ||
          String(lastCommitment.secret) === '')
      ) {
        console.error('🚨 [COMMITMENT_DEBUG] CRITICAL: No spendable commitment found with valid secrets!');
      }

      // CRITICAL DEBUG: Log the selected lastCommitment
      console.log('🔍 [COMMITMENT_DEBUG] Selected spendable lastCommitment:', {
        source: commitmentSource,
        hash: lastCommitment.hash,
        label: lastCommitment.label,
        value: lastCommitment.value,
        hasNullifier: !!lastCommitment.nullifier && String(lastCommitment.nullifier) !== '',
        hasSecret: !!lastCommitment.secret && String(lastCommitment.secret) !== '',
        blockNumber: lastCommitment.blockNumber,
        selectedFromChildren: poolAccount.children.map((child, idx) => ({
          index: idx,
          hash: child.hash,
          hasSecrets:
            !!child.nullifier && String(child.nullifier) !== '' && !!child.secret && String(child.secret) !== '',
        })),
        timestamp: new Date().toISOString(),
      });

      const _chainId = Object.keys(chainData).find((key) =>
        chainData[Number(key)].poolInfo.some((pool) => pool.scope === _scope),
      );

      const updatedPoolAccount = {
        ...(poolAccount as PoolAccount),
        balance: lastCommitment!.value,
        lastCommitment: lastCommitment,
        reviewStatus: ReviewStatus.PENDING,
        isValid: false,
        name: idx,
        scope: _scope,
        chainId: Number(_chainId),
      };

      const publicClient = createPublicClient({
        chain: whitelistedChains.find((chain) => chain.id === Number(_chainId))!,
        transport: transports[Number(_chainId)],
      });

      // CRITICAL DEBUG: Log deposit before timestamp assignment
      console.log('🔍 [COMMITMENT_DEBUG] Before deposit timestamp assignment:', {
        hash: updatedPoolAccount.deposit.hash,
        hasNullifier: !!updatedPoolAccount.deposit.nullifier && String(updatedPoolAccount.deposit.nullifier) !== '',
        hasSecret: !!updatedPoolAccount.deposit.secret && String(updatedPoolAccount.deposit.secret) !== '',
        timestamp: new Date().toISOString(),
      });

      updatedPoolAccount.deposit.timestamp = await getTimestampFromBlockNumber(
        poolAccount.deposit.blockNumber,
        publicClient,
      );

      // CRITICAL DEBUG: Log deposit after timestamp assignment
      console.log('🔍 [COMMITMENT_DEBUG] After deposit timestamp assignment:', {
        hash: updatedPoolAccount.deposit.hash,
        hasNullifier: !!updatedPoolAccount.deposit.nullifier && String(updatedPoolAccount.deposit.nullifier) !== '',
        hasSecret: !!updatedPoolAccount.deposit.secret && String(updatedPoolAccount.deposit.secret) !== '',
        timestamp: new Date().toISOString(),
      });

      if (updatedPoolAccount.children.length > 0) {
        updatedPoolAccount.children.forEach(async (child, childIndex) => {
          // CRITICAL DEBUG: Log child before timestamp assignment
          console.log('🔍 [COMMITMENT_DEBUG] Before child timestamp assignment:', {
            childIndex,
            hash: child.hash,
            hasNullifier: !!child.nullifier && String(child.nullifier) !== '',
            hasSecret: !!child.secret && String(child.secret) !== '',
            timestamp: new Date().toISOString(),
          });

          child.timestamp = await getTimestampFromBlockNumber(child.blockNumber, publicClient);

          // CRITICAL DEBUG: Log child after timestamp assignment
          console.log('🔍 [COMMITMENT_DEBUG] After child timestamp assignment:', {
            childIndex,
            hash: child.hash,
            hasNullifier: !!child.nullifier && String(child.nullifier) !== '',
            hasSecret: !!child.secret && String(child.secret) !== '',
            timestamp: new Date().toISOString(),
          });
        });
      }

      if (updatedPoolAccount.ragequit) {
        updatedPoolAccount.balance = 0n;
        updatedPoolAccount.reviewStatus = ReviewStatus.EXITED;
      }

      if (updatedPoolAccount.ragequit) {
        updatedPoolAccount.ragequit.timestamp = await getTimestampFromBlockNumber(
          updatedPoolAccount.ragequit.blockNumber,
          publicClient!,
        );
      }

      poolAccounts.push(updatedPoolAccount);
      idx++;
    }
  }

  const poolAccountsByChainScope = poolAccounts.reduce(
    (acc, curr) => {
      acc[`${curr.chainId}-${curr.scope}`] = [...(acc[`${curr.chainId}-${curr.scope}`] || []), curr];
      return acc;
    },
    {} as Record<string, PoolAccount[]>,
  );
  const poolAccountsByCurrentChain = poolAccounts.filter((pa) => pa.chainId === chainId);

  return { poolAccounts: poolAccountsByCurrentChain, poolAccountsByChainScope };
};
