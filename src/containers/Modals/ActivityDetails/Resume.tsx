import { useMemo } from 'react';
import { Stack, Typography, styled } from '@mui/material';
import { formatUnits } from 'viem';
import { ExtendedTooltip as Tooltip, StatusChip } from '~/components';
import { chainData } from '~/config';
import { getConstants } from '~/config/constants';
import { useAccountContext, usePoolAccountsContext, useChainContext } from '~/hooks';
import { ReviewStatus } from '~/types';
import { getUsdBalance, getStatus } from '~/utils';

export const Resume = () => {
  const { PENDING_STATUS_MESSAGE } = getConstants();
  const { poolAccounts } = useAccountContext();
  const { selectedHistoryData } = usePoolAccountsContext();
  const { price } = useChainContext();

  // Look up the correct pool info based on the history data's chain and scope
  const historyPoolInfo = useMemo(() => {
    if (!selectedHistoryData?.chainId || !selectedHistoryData?.scope) return null;
    const chain = chainData[selectedHistoryData.chainId];
    if (!chain) return null;
    return chain.poolInfo.find((p) => p.scope === selectedHistoryData.scope) ?? null;
  }, [selectedHistoryData?.chainId, selectedHistoryData?.scope]);

  const decimals = historyPoolInfo?.assetDecimals ?? 18;
  const asset = historyPoolInfo?.asset ?? 'ETH';

  const amount = formatUnits(selectedHistoryData?.amount ?? 0n, decimals);
  const usdBalance = getUsdBalance(price, formatUnits(selectedHistoryData?.amount ?? 0n, decimals), decimals);
  const poolAccountName = useMemo(() => {
    // Convert both to strings to handle bigint vs string comparison
    const name = poolAccounts.find(
      (pool) => pool.deposit.label.toString() === selectedHistoryData?.label?.toString(),
    )?.name;
    return name ? `PA-${name}` : 'Unknown Pool Account';
  }, [poolAccounts, selectedHistoryData]);

  const status = getStatus(selectedHistoryData || {});
  const tooltipTitle = status === ReviewStatus.PENDING ? PENDING_STATUS_MESSAGE : '';

  return (
    <Stack direction='row' justifyContent='space-between' alignItems='start' width='100%'>
      <Stack direction='column' alignItems='start' gap='0.8rem'>
        <EthText variant='h6'>
          {amount}
          <span>{asset}</span>
        </EthText>
        <BalanceUsd variant='body2'>{`~ ${usdBalance}`}</BalanceUsd>
      </Stack>

      <Stack direction='column' alignItems='end' gap='1.4rem'>
        <Typography variant='body2'>{poolAccountName}</Typography>
        <Tooltip title={tooltipTitle} placement='top' disableInteractive>
          <StatusChip status={status} />
        </Tooltip>
      </Stack>
    </Stack>
  );
};

const EthText = styled(Typography)({
  fontWeight: 300,
  fontSize: '4rem',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  lineHeight: '0.8',
  span: {
    fontSize: '2rem',
    marginLeft: '0.4rem',
  },
});

const BalanceUsd = styled(Typography)({
  fontWeight: 300,
  fontSize: '1.2rem',
});
