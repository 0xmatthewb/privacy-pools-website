import { useState, useCallback } from 'react';
import { addBreadcrumb, captureException, withScope } from '@sentry/nextjs';
import { getAddress, Hex, parseUnits, TransactionExecutionError } from 'viem';
import { generatePrivateKey } from 'viem/accounts';
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import { getConfig } from '~/config';
import { useQuoteContext } from '~/contexts/QuoteContext';
import {
  useExternalServices,
  useAccountContext,
  useModal,
  useNotifications,
  usePoolAccountsContext,
  useChainContext,
  useSafeApp,
} from '~/hooks';
import { Hash, ModalType, Secret, ProofRelayerPayload, WithdrawalRelayerPayload } from '~/types';
import {
  prepareWithdrawRequest,
  getContext,
  getMerkleProof,
  generateWithdrawalProof,
  decodeEventsFromReceipt,
  withdrawEventAbi,
  verifyWithdrawalProof,
  prepareWithdrawalProofInput,
  getScope,
  createWithdrawalSecrets,
} from '~/utils';

const {
  env: { TEST_MODE },
} = getConfig();

const PRIVACY_POOL_ERRORS = {
  'Error: InvalidProof()': 'Failed to verify withdrawal proof. Please regenerate your proof and try again.',
  'Error: InvalidCommitment()':
    'The commitment you are trying to spend does not exist. Please check your transaction history.',
  'Error: InvalidProcessooor()': 'You are not authorized to perform this withdrawal operation.',
  'Error: InvalidTreeDepth()':
    'Invalid tree depth provided. Please refresh and try again, contact support if error persists.',
  'Error: InvalidDepositValue()': 'The deposit amount is invalid. Maximum allowed value exceeded.',
  'Error: ScopeMismatch()':
    'Invalid scope provided for this privacy pool. Please refresh and try again, contact support if error persists.',
  'Error: ContextMismatch()':
    'Invalid context provided for this pool and withdrawal. Please refresh and try again, contact support if error persists.',
  'Error: UnknownStateRoot()':
    'The state root is unknown or outdated. Please refresh and try again, contact support if error persists.',
  'Error: IncorrectASPRoot()':
    'The ASP root is unknown or outdated. Please refresh and try again, contact support if error persists.',
  'Error: OnlyOriginalDepositor()': 'Only the original depositor can ragequit from this commitment.',
} as const;

export const useWithdraw = () => {
  const { addNotification, getDefaultErrorMessage } = useNotifications();
  const [isLoading, setIsLoading] = useState(false);
  const { setModalOpen, setIsClosable } = useModal();
  const { aspData, relayerData } = useExternalServices();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const { resetQuote } = useQuoteContext();
  const { isSafeApp } = useSafeApp();
  const {
    selectedPoolInfo,
    chainId,
    balanceBN: { decimals },
    relayersData,
    selectedRelayer,
  } = useChainContext();

  const { accountService, addWithdrawal } = useAccountContext();
  const publicClient = usePublicClient({ chainId });

  const {
    amount,
    target,
    poolAccount,
    proof,
    setProof,
    withdrawal,
    setWithdrawal,
    newSecretKeys,
    setNewSecretKeys,
    setTransactionHash,
    feeCommitment,
    feeBPSForWithdraw,
  } = usePoolAccountsContext();

  const commitment = poolAccount?.lastCommitment;

  // CRITICAL DEBUG: Log commitment immediately after assignment from poolAccount
  if (commitment) {
    console.log('🔍 [COMMITMENT_DEBUG] Initial commitment from poolAccount:', {
      hash: commitment.hash,
      label: commitment.label,
      value: commitment.value,
      originalpoolaccount: poolAccount,
      commitmentStringified: JSON.stringify({ ...commitment, secret: '', nullifier: '' }),
      timestamp: new Date().toISOString(),
    });
  }
  const aspLeaves = aspData.mtLeavesData?.aspLeaves;
  const stateLeaves = aspData.mtLeavesData?.stateTreeLeaves;
  const { address } = useAccount();

  const logErrorToSentry = useCallback(
    (error: Error | unknown, context: Record<string, unknown>) => {
      // Filter out expected user behavior errors
      if (error && typeof error === 'object') {
        const message = (error as { message?: string }).message || '';
        const errorName = (error as { name?: string }).name || '';
        const errorCode = (error as { code?: number }).code;

        // Don't log wallet rejections and user behavior errors
        if (
          errorCode === 4001 ||
          errorCode === 4100 ||
          errorCode === 4200 ||
          errorCode === -32002 ||
          errorCode === -32003 ||
          message.includes('User rejected the request') ||
          message.includes('User denied') ||
          message.includes('User cancelled') ||
          message.includes('Pop up window failed to open') ||
          message.includes('provider is not defined') ||
          message.includes('No Ethereum provider found') ||
          message.includes('Connection timeout') ||
          message.includes('Request timeout') ||
          message.includes('Transaction cancelled') ||
          message.includes('Chain switching failed') ||
          errorName === 'UserRejectedRequestError'
        ) {
          console.warn('Filtered wallet user behavior error (not logging to Sentry)');
          return;
        }
      }

      withScope((scope) => {
        scope.setUser({
          address: address,
        });

        // Set additional context
        scope.setContext('withdrawal_context', {
          chainId,
          poolAddress: selectedPoolInfo?.address,
          entryPointAddress: selectedPoolInfo?.entryPointAddress,
          amount: amount?.toString(),
          target,
          hasPoolAccount: !!poolAccount,
          hasCommitment: !!commitment,
          hasAspLeaves: !!aspLeaves,
          hasStateLeaves: !!stateLeaves,
          hasSelectedRelayer: !!selectedRelayer?.url,
          selectedRelayer,
          testMode: TEST_MODE,
          ...context,
        });

        // Set tags for filtering
        scope.setTag('operation', 'withdraw');
        scope.setTag('chain_id', chainId?.toString());
        scope.setTag('test_mode', TEST_MODE.toString());

        // Log the error
        captureException(error);
      });
    },
    [
      address,
      chainId,
      selectedPoolInfo?.address,
      selectedPoolInfo?.entryPointAddress,
      selectedRelayer,
      amount,
      target,
      poolAccount,
      commitment,
      aspLeaves,
      stateLeaves,
    ],
  );

  const getPrivacyPoolErrorMessage = useCallback((errorMessage: string): string | null => {
    // Check for exact matches first
    for (const [contractError, userMessage] of Object.entries(PRIVACY_POOL_ERRORS)) {
      if (errorMessage.includes(contractError)) {
        return userMessage;
      }
    }

    // Check for error function names without "Error:" prefix
    const errorFunctionMatch = errorMessage.match(/(\w+)\(\)/);
    if (errorFunctionMatch) {
      const errorFunction = `Error: ${errorFunctionMatch[1]}()`;
      if (errorFunction in PRIVACY_POOL_ERRORS) {
        return PRIVACY_POOL_ERRORS[errorFunction as keyof typeof PRIVACY_POOL_ERRORS];
      }
    }

    return null;
  }, []);

  const generateProof = useCallback(
    async (
      onProgress?: (progress: {
        phase: 'loading_circuits' | 'generating_proof' | 'verifying_proof';
        progress: number;
      }) => void,
      onComplete?: (proof: unknown, withdrawal: unknown, newSecretKeys: unknown) => void,
    ) => {
      // Check for valid quote data immediately
      if (!feeBPSForWithdraw || feeBPSForWithdraw === 0n || !feeCommitment) {
        throw new Error('No valid quote available. Please ensure you have a valid quote before withdrawing.');
      }

      if (TEST_MODE) return;

      const relayerDetails = relayersData.find((r) => r.url === selectedRelayer?.url);

      const missingFields = [];
      if (!poolAccount) missingFields.push('poolAccount');
      if (!target) missingFields.push('target');
      if (!commitment) missingFields.push('commitment');
      if (!aspLeaves) missingFields.push('aspLeaves');
      if (!stateLeaves) missingFields.push('stateLeaves');
      if (!relayerDetails) missingFields.push('relayerDetails');
      if (!relayerDetails?.relayerAddress) missingFields.push('relayerAddress');
      if (!feeBPSForWithdraw) missingFields.push('feeBPS');
      if (!accountService) missingFields.push('accountService');

      if (missingFields.length > 0) {
        console.error('❌ Missing required data for proof generation:', missingFields);
        throw new Error(`Missing required data: ${missingFields.join(', ')}`);
      }

      // TypeScript assertions - we've already validated these exist above
      if (!relayerDetails || !relayerDetails.relayerAddress) {
        throw new Error('Relayer details not available');
      }
      if (!commitment) {
        throw new Error('Commitment not available');
      }
      if (!accountService) {
        throw new Error('Account service not available');
      }
      if (!stateLeaves) {
        throw new Error('State leaves not available');
      }
      if (!aspLeaves) {
        throw new Error('ASP leaves not available');
      }

      let poolScope: Hash | bigint | undefined;
      let stateMerkleProof: Awaited<ReturnType<typeof getMerkleProof>>;
      let aspMerkleProof: Awaited<ReturnType<typeof getMerkleProof>>;
      let merkleProofGenerated = false;

      try {
        const newWithdrawal = prepareWithdrawRequest(
          getAddress(target),
          getAddress(selectedPoolInfo.entryPointAddress),
          getAddress(relayerDetails.relayerAddress),
          feeBPSForWithdraw.toString(),
        );

        // CRITICAL DEBUG: Log commitment details at proof generation start
        console.log('🔍 [COMMITMENT_DEBUG] Starting proof generation with commitment:', {
          hash: commitment.hash,
          label: commitment.label,
          value: commitment.value,
          originalCommitmentObject: commitment,
          commitmentStringified: JSON.stringify({ ...commitment, secret: '', nullifier: '' }),
          timestamp: new Date().toISOString(),
        });
        poolScope = await getScope(publicClient, selectedPoolInfo?.address);
        stateMerkleProof = await getMerkleProof(stateLeaves?.map(BigInt) as bigint[], commitment.hash);
        aspMerkleProof = await getMerkleProof(aspLeaves?.map(BigInt), commitment.label);
        const context = await getContext(newWithdrawal, poolScope as Hash);
        const { secret, nullifier } = createWithdrawalSecrets(accountService, commitment);

        // CRITICAL DEBUG: Log commitment after secret generation
        console.log('🔍 [COMMITMENT_DEBUG] After createWithdrawalSecrets:', {
          hash: commitment.hash,
          label: commitment.label,
          value: commitment.value,
          commitmentChanged: JSON.stringify(commitment) !== JSON.stringify(poolAccount?.lastCommitment),
          timestamp: new Date().toISOString(),
        });

        aspMerkleProof.index = Object.is(aspMerkleProof.index, NaN) ? 0 : aspMerkleProof.index; // workaround for NaN index, SDK issue

        // CRITICAL DEBUG: Log commitment before prepareWithdrawalProofInput
        console.log('🔍 [COMMITMENT_DEBUG] Before prepareWithdrawalProofInput:', {
          hash: commitment.hash,
          label: commitment.label,
          value: commitment.value,
          timestamp: new Date().toISOString(),
        });

        const withdrawalProofInput = prepareWithdrawalProofInput(
          commitment,
          parseUnits(amount, decimals),
          stateMerkleProof,
          aspMerkleProof,
          BigInt(context),
          secret,
          nullifier,
        );

        // CRITICAL DEBUG: Log commitment after prepareWithdrawalProofInput
        console.log('🔍 [COMMITMENT_DEBUG] After prepareWithdrawalProofInput:', {
          hash: commitment.hash,
          label: commitment.label,
          value: commitment.value,
          timestamp: new Date().toISOString(),
        });
        if (aspMerkleProof && stateMerkleProof) merkleProofGenerated = true;

        // Use worker for progress updates, but still call actual SDK for proof generation
        const workerPromise = new Promise((resolve, reject) => {
          const worker = new Worker(new URL('../workers/zkProofWorker.ts', import.meta.url));
          const requestId = Math.random().toString(36).substring(2, 15);

          worker.onmessage = (event) => {
            const { type, payload, id } = event.data;

            if (id !== requestId) return;

            switch (type) {
              case 'success':
                worker.terminate();
                resolve(payload);
                break;
              case 'error':
                worker.terminate();
                reject(new Error(payload.message));
                break;
              case 'progress':
                if (onProgress) {
                  onProgress(payload);
                }
                break;
            }
          };

          worker.onerror = (error) => {
            worker.terminate();
            reject(error);
          };

          // CRITICAL DEBUG: Log commitment before sending to worker
          console.log('🔍 [COMMITMENT_DEBUG] Before sending to worker:', {
            hash: commitment.hash,
            label: commitment.label,
            value: commitment.value,
            timestamp: new Date().toISOString(),
          });

          worker.postMessage({
            type: 'generateWithdrawalProof',
            payload: { commitment, input: withdrawalProofInput },
            id: requestId,
          });
        });

        // CRITICAL DEBUG: Log commitment before SDK proof generation
        console.log('🔍 [COMMITMENT_DEBUG] Before generateWithdrawalProof SDK call:', {
          hash: commitment.hash,
          label: commitment.label,
          value: commitment.value,
          timestamp: new Date().toISOString(),
        });

        // Run both worker (for progress) and actual SDK call in parallel
        const [, proof] = await Promise.all([workerPromise, generateWithdrawalProof(commitment, withdrawalProofInput)]);

        // CRITICAL DEBUG: Log commitment after SDK proof generation
        console.log('🔍 [COMMITMENT_DEBUG] After generateWithdrawalProof SDK call:', {
          hash: commitment.hash,
          label: commitment.label,
          value: commitment.value,
          timestamp: new Date().toISOString(),
        });

        const verified = await verifyWithdrawalProof(proof);

        if (!verified) throw new Error('Proof verification failed');

        setProof(proof);
        setWithdrawal(newWithdrawal);
        setNewSecretKeys({ secret, nullifier });

        if (onProgress) {
          onProgress({ phase: 'verifying_proof', progress: 1.0 });
        }

        // Signal that proof generation is complete
        if (onComplete) {
          onComplete(proof, newWithdrawal, { secret, nullifier });
        }

        return proof;
      } catch (err) {
        const error = err as TransactionExecutionError;

        // Log proof generation error to Sentry
        logErrorToSentry(error, {
          operation_step: 'proof_generation',
          error_type: error?.name || 'unknown',
          has_pool_scope: !!poolScope,
          merkle_proof_generated: merkleProofGenerated,
          proof_verified: false,
        });

        const errorMessage = getDefaultErrorMessage(error?.shortMessage || error?.message);
        addNotification('error', errorMessage);
        console.error('Error generating proof', error);
        throw error;
      }
    },
    [
      feeCommitment,
      feeBPSForWithdraw,
      relayersData,
      selectedRelayer?.url,
      poolAccount,
      target,
      commitment,
      aspLeaves,
      stateLeaves,
      accountService,
      selectedPoolInfo,
      publicClient,
      amount,
      decimals,
      addNotification,
      getDefaultErrorMessage,
      setProof,
      setWithdrawal,
      setNewSecretKeys,
      logErrorToSentry,
    ],
  );

  const withdraw = useCallback(
    async (proofData?: unknown, withdrawalData?: unknown, secretKeysData?: unknown) => {
      // Use passed data if available, otherwise use state
      const currentProof = proofData || proof;
      const currentWithdrawal = withdrawalData || withdrawal;
      const currentNewSecretKeys = secretKeysData || newSecretKeys;
      if (!TEST_MODE) {
        const relayerDetails = relayersData.find((r) => r.url === selectedRelayer?.url);

        if (
          !currentProof ||
          !currentWithdrawal ||
          !commitment ||
          !target ||
          !relayerDetails ||
          !relayerDetails.relayerAddress ||
          !feeCommitment ||
          !currentNewSecretKeys ||
          !accountService
        )
          throw new Error('Missing required data to withdraw');

        // Only switch chain if not already on the correct chain and not using Safe
        if (!isSafeApp && walletClient?.chain?.id !== chainId) {
          await switchChainAsync({ chainId });
        }

        const poolScope = await getScope(publicClient, selectedPoolInfo.address);

        // CRITICAL DEBUG: Log commitment at start of withdrawal execution
        console.log('🔍 [COMMITMENT_DEBUG] Starting withdrawal execution with commitment:', {
          hash: commitment.hash,
          label: commitment.label,
          value: commitment.value,
          timestamp: new Date().toISOString(),
        });

        try {
          setIsClosable(false);
          setIsLoading(true);

          // Reset the quote timer when transaction starts
          resetQuote();

          // CRITICAL DEBUG: Log commitment before relayer call
          console.log('🔍 [COMMITMENT_DEBUG] Before relayer call:', {
            hash: commitment.hash,
            label: commitment.label,
            value: commitment.value,
            timestamp: new Date().toISOString(),
          });

          const res = await relayerData.relay({
            withdrawal: currentWithdrawal as WithdrawalRelayerPayload,
            proof: (currentProof as { proof: unknown }).proof as ProofRelayerPayload,
            publicSignals: (currentProof as { publicSignals: unknown }).publicSignals as string[],
            scope: poolScope.toString(),
            chainId,
            feeCommitment,
          });

          // CRITICAL DEBUG: Log commitment after relayer call
          console.log('🔍 [COMMITMENT_DEBUG] After relayer call:', {
            hash: commitment.hash,
            label: commitment.label,
            value: commitment.value,
            relayerSuccess: res.success,
            timestamp: new Date().toISOString(),
          });

          if (!res.success) {
            // Check if the error is a known privacy pool error
            const privacyPoolError = getPrivacyPoolErrorMessage(res.error || '');
            const errorMessage = privacyPoolError || res.error || 'Relay failed';

            // Log relayer error to Sentry
            logErrorToSentry(new Error(errorMessage), {
              operation_step: 'relayer_execution',
              relayer_error: res.error,
              relayer_success: res.success,
              scope: poolScope.toString(),
            });

            throw new Error(errorMessage);
          }

          if (!res.txHash) throw new Error('Relay response does not have tx hash');

          setTransactionHash(res.txHash as Hex);
          setModalOpen(ModalType.PROCESSING);

          const receipt = await publicClient?.waitForTransactionReceipt({
            hash: res.txHash as Hex,
            timeout: 300_000, // 5 minutes timeout for withdrawal transactions
          });

          if (!receipt) throw new Error('Receipt not found');

          const events = decodeEventsFromReceipt(receipt, withdrawEventAbi);
          const withdrawnEvents = events.filter((event) => event.eventName === 'Withdrawn');

          // More robust event handling - try to find any event that looks like a withdrawal
          if (!withdrawnEvents.length) {
            // Try to find any event that might be the withdrawal event
            const possibleWithdrawEvents = events.filter(
              (event) =>
                event.eventName &&
                (event.eventName.toLowerCase().includes('withdraw') ||
                  event.eventName.toLowerCase().includes('withdrawn')),
            );

            if (possibleWithdrawEvents.length > 0) {
              // Use the first possible event
              withdrawnEvents.push(possibleWithdrawEvents[0]);
            } else {
              // If still no events found, log more details and throw error
              console.error('🔍 No withdrawal events found. All events:', events);
              throw new Error('Withdraw event not found');
            }
          }

          const { _value } = withdrawnEvents[0].args as {
            _newCommitment: bigint;
            _spentNullifier: bigint;
            _value: bigint;
          };

          addWithdrawal(accountService, {
            parentCommitment: commitment,
            value: poolAccount?.balance - _value,
            nullifier: (currentNewSecretKeys as { nullifier?: unknown })?.nullifier as Secret,
            secret: (currentNewSecretKeys as { secret?: unknown })?.secret as Secret,
            blockNumber: receipt.blockNumber,
            txHash: res.txHash as Hex,
          });

          // Log successful withdrawal to Sentry for analytics
          addBreadcrumb({
            message: 'Withdrawal successful',
            category: 'transaction',
            data: {
              transactionHash: res.txHash,
              blockNumber: receipt.blockNumber.toString(),
              value: _value.toString(),
            },
            level: 'info',
          });

          setModalOpen(ModalType.SUCCESS);
        } catch (err) {
          const error = err as TransactionExecutionError;

          // Log withdrawal error to Sentry with full context
          logErrorToSentry(error, {
            operation_step: 'withdrawal_execution',
            error_type: error?.name || 'unknown',
            short_message: error?.shortMessage,
            has_proof: !!currentProof,
            has_withdrawal: !!currentWithdrawal,
            has_new_secret_keys: !!currentNewSecretKeys,
            pool_scope: poolScope?.toString(),
          });

          // Try to get a user-friendly error message
          const privacyPoolError = getPrivacyPoolErrorMessage(error?.shortMessage || error?.message || '');
          const errorMessage = privacyPoolError || getDefaultErrorMessage(error?.shortMessage || error?.message);

          addNotification('error', errorMessage);
          console.error('Error withdrawing', error);
        }
        // TEST MODE
      } else {
        if (!commitment) throw new Error('Missing required data to withdraw');

        setTransactionHash(generatePrivateKey());
        setModalOpen(ModalType.PROCESSING);
        await new Promise((resolve) => setTimeout(resolve, 2000));

        setModalOpen(ModalType.SUCCESS);
      }
      setIsLoading(false);
      setIsClosable(true);
    },
    [
      relayersData,
      selectedRelayer?.url,
      proof,
      withdrawal,
      commitment,
      target,
      feeCommitment,
      newSecretKeys,
      accountService,
      switchChainAsync,
      chainId,
      publicClient,
      selectedPoolInfo,
      setIsClosable,
      setIsLoading,
      setTransactionHash,
      setModalOpen,
      addWithdrawal,
      poolAccount,
      getPrivacyPoolErrorMessage,
      logErrorToSentry,
      addNotification,
      getDefaultErrorMessage,
      relayerData,
      resetQuote,
      isSafeApp,
      walletClient?.chain?.id,
    ],
  );

  const generateProofAndWithdraw = useCallback(
    async (
      onProgress?: (progress: {
        phase: 'loading_circuits' | 'generating_proof' | 'verifying_proof';
        progress: number;
      }) => void,
    ) => {
      // CRITICAL DEBUG: Log commitment at the very start of generateProofAndWithdraw
      console.log('🔍 [COMMITMENT_DEBUG] generateProofAndWithdraw START:', {
        hash: commitment?.hash,
        label: commitment?.label,
        value: commitment?.value,
        hasCommitment: !!commitment,
        poolAccountId: poolAccount?.name,
        timestamp: new Date().toISOString(),
      });

      try {
        // Generate proof and call withdraw when complete
        await generateProof(onProgress, (proof, withdrawal, newSecretKeys) => {
          // CRITICAL DEBUG: Log commitment at callback execution
          console.log('🔍 [COMMITMENT_DEBUG] generateProofAndWithdraw callback execution:', {
            hash: commitment?.hash,
            label: commitment?.label,
            value: commitment?.value,
            timestamp: new Date().toISOString(),
          });
          withdraw(proof, withdrawal, newSecretKeys);
        });
      } catch (error) {
        console.error('❌ generateProofAndWithdraw failed:', error);
        throw error;
      }
    },
    [generateProof, withdraw, commitment, poolAccount?.id],
  );

  return { withdraw, generateProof, generateProofAndWithdraw, isLoading };
};
