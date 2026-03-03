'use client';

import CheckIcon from '@mui/icons-material/Check';
import { Box, Button, CircularProgress, styled, Typography } from '@mui/material';
import { BaseModal } from '~/components';
import { ModalType } from '~/types';
import { useMigration } from '../hooks/useMigration';

export const MigrationModal = () => {
  const { isActive, isBlocking, flowState, errorMessage, retryCount, maxRetries, startMigration, completeMigration } =
    useMigration();

  if (!isActive || !isBlocking) return null;

  return (
    <BaseModal type={ModalType.MIGRATION} isClosable={false}>
      <Content>
        {flowState === 'intro' && (
          <>
            <Title>Key Migration Needed</Title>
            <Description>
              Your security is our priority. We are upgrading to a stronger encryption method. Migrate your keys to
              continue using all features.
            </Description>
            <ActionButton onClick={startMigration}>Continue with Migration</ActionButton>
          </>
        )}

        {flowState === 'migrating' && (
          <>
            <CircularProgress size={48} />
            <Title>Migrating Keys...</Title>
            <Description>Please wait while we upgrade your encryption.</Description>
            {retryCount > 0 && (
              <RetryLabel>
                Retrying failed transactions ({retryCount}/{maxRetries})
              </RetryLabel>
            )}
          </>
        )}

        {flowState === 'success' && (
          <>
            <SuccessCircle>
              <CheckIcon />
            </SuccessCircle>
            <Title>Migration Successful</Title>
            <Description>To finalize the migration, you will have to log in again.</Description>
            <ActionButton onClick={completeMigration}>Continue</ActionButton>
          </>
        )}

        {flowState === 'failed' && (
          <>
            <Title>Migration Failed</Title>
            <Description>{errorMessage ?? 'We could not complete the migration.'}</Description>
            <ActionButton onClick={startMigration}>Retry Migration</ActionButton>
          </>
        )}
      </Content>
    </BaseModal>
  );
};

const Content = styled(Box)(() => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '2rem',
  width: '100%',
  padding: '3.6rem 2.4rem',
}));

const Title = styled(Typography)(() => ({
  margin: 0,
  fontSize: '2.4rem',
  fontWeight: 700,
  color: 'inherit',
  width: '100%',
  textAlign: 'center',
  lineHeight: 'normal',
}));

const Description = styled(Typography)(({ theme }) => ({
  margin: 0,
  fontSize: '1.4rem',
  lineHeight: 1.6,
  color: theme.palette.text.secondary,
  textAlign: 'center',
  maxWidth: '36rem',
}));

const RetryLabel = styled(Typography)(({ theme }) => ({
  margin: 0,
  fontSize: '1.2rem',
  lineHeight: 1.5,
  color: theme.palette.text.secondary,
  textAlign: 'center',
}));

const ActionButton = styled(Button)(() => ({
  width: '100%',
  textTransform: 'none',
}));

const SuccessCircle = styled(Box)(({ theme }) => ({
  width: '4.8rem',
  height: '4.8rem',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: theme.palette.common.white,
  backgroundColor: theme.palette.success.main,
}));
