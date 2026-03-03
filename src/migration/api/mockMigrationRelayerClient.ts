import { createPublicClient, http, parseAbi, type PublicClient } from 'viem';
import { chainData } from '~/config/chainData';
import { MigrationRelayerRequest, MigrationRelayerResponse } from '../types/relayer';
import { MOCK_RELAYER_DELAY_MS } from '../utils/constants';
import { sleep } from '../utils/helpers';

const publicClientByChainId = new Map<number, PublicClient>();

const getChainRpcUrl = (chainId: number): string | null => {
  const rpcUrl = chainData[chainId]?.rpcUrl;
  if (!rpcUrl || typeof rpcUrl !== 'string') return null;
  return rpcUrl;
};

const getPublicClient = (chainId: number): PublicClient | null => {
  const cachedClient = publicClientByChainId.get(chainId);
  if (cachedClient) return cachedClient;

  const rpcUrl = getChainRpcUrl(chainId);
  if (!rpcUrl) return null;

  const client = createPublicClient({
    transport: http(rpcUrl),
  });
  publicClientByChainId.set(chainId, client);
  return client;
};

const simulateRelayerTransaction = async (payload: MigrationRelayerRequest[number]): Promise<boolean> => {
  const publicClient = getPublicClient(payload.chainId);
  if (!publicClient) return false;

  try {
    const multicall3Abi = parseAbi([
      'function aggregate3((address target,bool allowFailure,bytes callData)[] calls) payable returns ((bool success,bytes returnData)[] returnData)',
    ]);

    const simulation = await publicClient.simulateContract({
      address: payload.to,
      abi: multicall3Abi,
      functionName: 'aggregate3',
      args: [payload.calls],
    });
    console.log('[migration] simulateRelayerTransaction result', { results: simulation.result });

    return simulation.result.every(({ success }) => success);
  } catch (error) {
    console.error('[migration] simulateRelayerTransaction error', { error });
    return false;
  }
};

export const mockMigrationRelayerClient = async (
  payloads: MigrationRelayerRequest,
): Promise<MigrationRelayerResponse> => {
  await sleep(MOCK_RELAYER_DELAY_MS);

  const failed: string[] = [];
  const success: string[] = [];

  for (const payload of payloads) {
    const isSuccessful = await simulateRelayerTransaction(payload);
    if (isSuccessful) {
      success.push(String(payload.txId));
    } else {
      failed.push(String(payload.txId));
    }
  }

  return {
    failed,
    success,
  };
};
