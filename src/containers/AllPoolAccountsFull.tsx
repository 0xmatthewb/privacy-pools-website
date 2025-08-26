'use client';

import { useMemo, useEffect } from 'react';
import { Typography, styled, Stack, Box } from '@mui/material';
import { formatUnits } from 'viem';
import { PoolAccountTable, SPagination, AdvancedNavigation } from '~/components';
import { chainData, PoolInfo } from '~/config';
import { useAuthContext, useAccountContext } from '~/hooks';
import { useASP } from '~/hooks/useASP';
import { PoolAccount, ReviewStatus } from '~/types';
import { ViewAllText, ViewAllButton } from './PoolAccountsPreview';

interface PoolSectionProps {
  chainId: number;
  poolInfo: PoolInfo;
  poolAccounts: PoolAccount[];
  aspUrl: string;
}

const PoolSection = ({ chainId, poolInfo, poolAccounts, aspUrl }: PoolSectionProps) => {
  const chain = chainData[chainId];
  const { isLoading, isError } = useASP(chainId, poolInfo.scope.toString(), aspUrl);

  // Calculate totals for this pool (poolAccounts are already filtered)
  const amountPoolAsset = useMemo(() => {
    return poolAccounts.reduce((acc, curr) => acc + BigInt(curr.balance), BigInt(0));
  }, [poolAccounts]);

  const pendingAmountPoolAsset = useMemo(() => {
    return poolAccounts.reduce((acc, curr) => {
      return curr.reviewStatus === ReviewStatus.PENDING ? acc + BigInt(curr.balance) : acc;
    }, BigInt(0));
  }, [poolAccounts]);

  if (poolAccounts.length === 0) return null;

  const poolId = `pool-${chainId}-${poolInfo.scope}`;

  return (
    <PAContainer id={poolId}>
      <Section sx={{ width: '100%' }}>
        <Stack width='100%' gap={2}>
          <Stack direction='row' alignItems='center' gap={2}>
            <Typography variant='h6' fontWeight='bold'>
              {chain.name} - {poolInfo.asset}
            </Typography>
            {isLoading && <Typography variant='caption'>(Loading...)</Typography>}
            {isError && (
              <Typography variant='caption' color='error'>
                (Error loading data)
              </Typography>
            )}
          </Stack>

          <Stack flexDirection='row' justifyContent='space-between' width='100%'>
            <Stack width='50%' gap={1}>
              <Subtitle variant='caption'>Available:</Subtitle>
              <EthText variant='subtitle1' fontWeight='bold'>
                {formatUnits(amountPoolAsset, poolInfo.assetDecimals || 18)}
                <span> {poolInfo.asset}</span>
              </EthText>
            </Stack>

            <Stack width='50%' gap={1}>
              <Subtitle variant='caption'>Being validated:</Subtitle>
              <EthText variant='subtitle1' fontWeight='bold'>
                {formatUnits(pendingAmountPoolAsset, poolInfo.assetDecimals || 18)}
                <span> {poolInfo.asset}</span>
              </EthText>
            </Stack>
          </Stack>
        </Stack>
      </Section>

      {/* Table */}
      <PoolAccountTable records={poolAccounts} />

      {poolAccounts.length > 10 && (
        <ActionMenuContainer>
          <SPagination numberOfItems={poolAccounts.length} perPage={10} />
        </ActionMenuContainer>
      )}
    </PAContainer>
  );
};

export const AllPoolAccountsFull = () => {
  const { isLogged } = useAuthContext();
  const { poolAccountsByChainScope, hideEmptyPools, toggleHideEmptyPools } = useAccountContext();

  // Get all unique chain-scope combinations that have pool accounts
  const poolsWithAccounts = useMemo(() => {
    const pools: { chainId: number; poolInfo: PoolInfo; accounts: PoolAccount[] }[] = [];

    Object.entries(poolAccountsByChainScope).forEach(([key, accounts]) => {
      if (accounts.length === 0) return;

      const [chainId, scope] = key.split('-');
      const chainIdNum = parseInt(chainId);
      const chain = chainData[chainIdNum];

      if (!chain) return;

      // Find the pool info for this scope
      const poolInfo = chain.poolInfo.find((p) => p.scope.toString() === scope);

      if (poolInfo) {
        // Filter accounts based on hideEmptyPools setting
        const filteredAccounts = hideEmptyPools ? accounts.filter((acc) => acc.balance !== BigInt(0)) : accounts;

        if (filteredAccounts.length > 0) {
          pools.push({
            chainId: chainIdNum,
            poolInfo,
            accounts: filteredAccounts,
          });
        }
      }
    });

    return pools;
  }, [poolAccountsByChainScope, hideEmptyPools]);

  const totalPools = useMemo(() => {
    return poolsWithAccounts.reduce((sum, pool) => sum + pool.accounts.length, 0);
  }, [poolsWithAccounts]);

  const handleShowEmptyPools = () => {
    toggleHideEmptyPools();
  };

  // Handle scroll to specific pool section based on URL hash
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && poolsWithAccounts.length > 0) {
      const element = document.getElementById(hash.substring(1));
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
            inline: 'nearest',
          });
        }, 500); // Wait for components to render
      }
    }
  }, [poolsWithAccounts]);
  console.log('poolsWithAccounts', poolsWithAccounts);
  return (
    <>
      <AdvancedNavigation title='All My Pools' isLogged={isLogged} count={totalPools} />

      <Stack gap={3} width='100%' maxWidth='82rem' alignItems='center'>
        <Stack direction='row' alignItems='end' justifyContent='end' width='100%' padding={2} gap={1}>
          <ViewAllButton onClick={handleShowEmptyPools} disabled={poolsWithAccounts.length === 0}>
            <ViewAllText>{hideEmptyPools ? 'Show' : 'Hide'} empty pools</ViewAllText>
          </ViewAllButton>
        </Stack>

        {isLogged &&
          poolsWithAccounts.map(({ chainId, poolInfo, accounts }) => {
            const chain = chainData[chainId];
            return (
              <PoolSection
                key={`${chainId}-${poolInfo.scope}`}
                chainId={chainId}
                poolInfo={poolInfo}
                poolAccounts={accounts}
                aspUrl={chain.aspUrl}
              />
            );
          })}

        {isLogged && poolsWithAccounts.length === 0 && (
          <PAContainer>
            <Section sx={{ width: '100%' }}>
              <Typography variant='body1'>No pool accounts found across any chains.</Typography>
            </Section>
          </PAContainer>
        )}
      </Stack>
    </>
  );
};

const Section = styled(Stack)(({ theme }) => ({
  padding: '1.6rem',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'start',
  gap: theme.spacing(1),
}));

const PAContainer = styled(Box)(({ theme }) => ({
  border: '1px solid',
  borderColor: theme.palette.grey[900],
  width: '100%',
  maxWidth: '82rem',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: theme.palette.background.default,
}));

const ActionMenuContainer = styled(Box)(({ theme }) => ({
  width: '100%',
  maxWidth: '82rem',
  borderTop: '1px solid',
  borderColor: theme.palette.grey[900],
  padding: '1.2rem 0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}));

const EthText = styled(Typography)(() => ({
  fontWeight: 500,
  lineHeight: '1',
  span: {
    fontSize: '1rem',
  },
}));

const Subtitle = styled(Typography)(() => ({
  fontSize: '1rem',
  lineHeight: '1',
}));
