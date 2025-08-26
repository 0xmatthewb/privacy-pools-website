'use client';

import { Button, Stack } from '@mui/material';
import { useAccount } from 'wagmi';
import { DepositAssetSelect } from '~/components';
import { useAccountContext, useModal, usePoolAccountsContext, useChainContext } from '~/hooks';
import { EventType, ModalType } from '~/types';

export const ActionMenu = () => {
  const { setModalOpen } = useModal();
  const { address } = useAccount();
  const { setActionType } = usePoolAccountsContext();
  const { hasApprovedDeposit, seed } = useAccountContext();
  const { hasSomeRelayerAvailable } = useChainContext();

  const isWithdrawDisabled = !address || !hasApprovedDeposit || !seed || !hasSomeRelayerAvailable;

  const goToWithdraw = () => {
    setModalOpen(ModalType.WITHDRAW);
    setActionType(EventType.WITHDRAWAL);
  };

  return (
    <Stack direction='row' spacing={2} data-testid='action-menu'>
      <DepositAssetSelect />
      <Button disabled={isWithdrawDisabled} onClick={goToWithdraw} data-testid='withdraw-button'>
        Withdraw
      </Button>
    </Stack>
  );
};
