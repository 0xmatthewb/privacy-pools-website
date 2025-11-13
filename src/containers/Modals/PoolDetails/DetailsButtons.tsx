import { Exit, PiggyBank, WatsonHealthRotate_360 } from '@carbon/icons-react';
import { Button, Stack, styled } from '@mui/material';
import { formatUnits } from 'viem';
import { useAccount } from 'wagmi';
import { useModal, usePoolAccountsContext, useChainContext, useAccountContext } from '~/hooks';
import { EventType, ModalType, ReviewStatus } from '~/types';

export const DetailButtons = () => {
  const { address } = useAccount();
  const { setModalOpen } = useModal();
  const { poolAccount, setTarget, setAmount, setActionType } = usePoolAccountsContext();
  const { poolAccounts } = useAccountContext();
  const {
    balanceBN: { decimals },
  } = useChainContext();

  // Check if there are any approved accounts with balance in the current pool
  const hasApprovedBalance = poolAccounts.some((pa) => pa.balance > 0n && pa.reviewStatus === ReviewStatus.APPROVED);
  const hasAnyBalance = poolAccounts.some((pa) => pa.balance > 0n);

  // If a specific poolAccount is selected, use that. Otherwise check if any account has balance
  const isWithdrawDisabled = poolAccount
    ? poolAccount.balance === 0n || poolAccount.reviewStatus !== ReviewStatus.APPROVED
    : !hasApprovedBalance;
  const isExitDisabled = poolAccount ? poolAccount.balance === 0n : !hasAnyBalance;

  const handleWithdraw = () => {
    if (isWithdrawDisabled) return;

    setActionType(EventType.WITHDRAWAL);
    setModalOpen(ModalType.WITHDRAW);
  };

  const handleExit = () => {
    if (isExitDisabled) return;
    if (!poolAccount) throw new Error('Pool account not found');

    setTarget(address!);
    setAmount(formatUnits(poolAccount.balance, decimals));
    setActionType(EventType.EXIT);
    setModalOpen(ModalType.GENERATE_ZK_PROOF);
  };

  return (
    <Stack direction='row' justifyContent='space-between' alignItems='center' width='100%' gap='1.2rem'>
      {poolAccount?.reviewStatus !== ReviewStatus.DECLINED && (
        <Button disabled={isWithdrawDisabled} fullWidth onClick={handleWithdraw} startIcon={<PiggyBank size={16} />}>
          Withdraw
        </Button>
      )}

      <Button disabled={isExitDisabled} fullWidth onClick={handleExit} startIcon={<ExitIcon size={16} />}>
        Exit
      </Button>

      {poolAccount?.reviewStatus === ReviewStatus.DECLINED && (
        <Button disabled fullWidth startIcon={<WatsonHealthRotate_360 size={16} />}>
          Re-Evaluate
        </Button>
      )}
    </Stack>
  );
};

const ExitIcon = styled(Exit)(() => ({
  transform: 'rotate(180deg)',
}));
