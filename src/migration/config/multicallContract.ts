import { whitelistedChains } from '~/config';

const MULTICALL_CONTRACTS_BY_CHAIN: Record<number, `0x${string}`> = whitelistedChains.reduce(
  (acc, chain) => {
    const multicallAddress = chain.contracts?.multicall3?.address;
    if (multicallAddress) {
      acc[chain.id] = multicallAddress;
    }

    return acc;
  },
  {} as Record<number, `0x${string}`>,
);

export const getMulticallContract = (chainId: number): `0x${string}` => {
  const multicallAddress = MULTICALL_CONTRACTS_BY_CHAIN[chainId];
  if (!multicallAddress) {
    throw new Error(`[migration] Missing multicall3 contract for chainId=${chainId}`);
  }

  return multicallAddress;
};
