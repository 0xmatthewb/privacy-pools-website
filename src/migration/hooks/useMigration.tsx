'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAccountContext, useAuthContext, useGoTo, useModal, useNotifications } from '~/hooks';
import { ModalType } from '~/types';
import { ROUTER } from '~/utils';
import { getMigrationRuntimeConfig } from '../config/runtime';
import { buildMigrationReadinessSnapshot } from '../state/buildMigrationReadinessSnapshot';
import { MigrationContextState } from '../types/migration';
import { MIGRATION_MESSAGES } from '../utils/constants';
import { executeMigrationFlow } from '../utils/executeMigrationFlow';
import { useMigrationRelayer } from './useMigrationRelayer';

interface MigrationContextValue extends MigrationContextState {
  startMigration: () => Promise<void>;
  completeMigration: () => void;
}

const MigrationContext = createContext<MigrationContextValue | undefined>(undefined);

export const MigrationProvider = ({ children }: { children: React.ReactNode }) => {
  const runtime = getMigrationRuntimeConfig();
  const { isConnected, isLogged, logout } = useAuthContext();
  const { addNotification } = useNotifications();
  const { setModalOpen, modalOpen, setIsClosable } = useModal();
  const {
    accountService,
    legacyAccountService,
    hasProcessedInitialDeposits: hasProcessedInitialDepositsFromAccount,
    isLoading: isAccountLoading,
  } = useAccountContext();
  const { submitMigration } = useMigrationRelayer();
  const goTo = useGoTo();

  const [flowState, setFlowState] = useState<MigrationContextState['flowState']>('intro');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [migrationReadiness, setMigrationReadiness] = useState<MigrationContextState['migrationReadiness']>(null);
  const isMigrationInFlightRef = useRef(false);

  const canBuildMigrationReadiness =
    runtime.isMigrationActive &&
    isConnected &&
    isLogged &&
    !!accountService &&
    !!legacyAccountService &&
    hasProcessedInitialDepositsFromAccount &&
    !isAccountLoading;

  useEffect(() => {
    if (!runtime.isMigrationActive) {
      setMigrationReadiness(null);
      setFlowState('intro');
      setErrorMessage(null);
      setRetryCount(0);
      return;
    }

    if (!canBuildMigrationReadiness || !accountService || !legacyAccountService) {
      setMigrationReadiness(null);
      setFlowState('intro');
      setErrorMessage(null);
      setRetryCount(0);
      return;
    }

    const readiness = buildMigrationReadinessSnapshot({
      accountService,
      legacyAccountService,
    });
    console.log('[migration] readiness', { readiness });
    setMigrationReadiness(readiness);
  }, [accountService, canBuildMigrationReadiness, legacyAccountService, runtime.isMigrationActive]);

  const requiresRealMigration = !!migrationReadiness?.requiresMigration && !migrationReadiness?.isFullyMigrated;

  const isBlocking =
    runtime.isMigrationActive &&
    isConnected &&
    isLogged &&
    hasProcessedInitialDepositsFromAccount &&
    !isAccountLoading &&
    requiresRealMigration;

  useEffect(() => {
    if (!runtime.isMigrationActive) return;

    if (isBlocking) {
      if (modalOpen !== ModalType.MIGRATION) {
        setModalOpen(ModalType.MIGRATION);
      }
      setIsClosable(false);
      return;
    }

    if (modalOpen === ModalType.MIGRATION) {
      setModalOpen(ModalType.NONE);
    }
    setIsClosable(true);
  }, [isBlocking, modalOpen, runtime.isMigrationActive, setIsClosable, setModalOpen]);

  const finalizeSuccessfulMigration = useCallback(() => {
    setFlowState('success');
    setErrorMessage(null);
    setRetryCount(0);
  }, []);

  const completeMigration = useCallback(() => {
    setModalOpen(ModalType.NONE);
    setIsClosable(true);
    addNotification('success', MIGRATION_MESSAGES.success);
    logout();
    goTo(ROUTER.account.base);
  }, [addNotification, goTo, logout, setIsClosable, setModalOpen]);

  const startMigration = useCallback(async () => {
    if (!runtime.isMigrationActive) return;
    if (!isBlocking) return;
    if (isMigrationInFlightRef.current) return;
    isMigrationInFlightRef.current = true;

    try {
      if (!accountService || !legacyAccountService || !migrationReadiness) {
        setFlowState('failed');
        setErrorMessage(MIGRATION_MESSAGES.missingRequiredAccountData);
        return;
      }

      setFlowState('migrating');
      setErrorMessage(null);
      setRetryCount(0);

      await executeMigrationFlow({
        accountService,
        legacyAccountService,
        retryConfig: {
          maxRetries: runtime.maxRetries,
          initialBackoffMs: runtime.initialBackoffMs,
          maxBackoffMs: runtime.maxBackoffMs,
        },
        submitMigration,
        onRetry: setRetryCount,
      });

      finalizeSuccessfulMigration();
    } catch (error) {
      setFlowState('failed');
      setErrorMessage(error instanceof Error ? error.message : MIGRATION_MESSAGES.unexpectedFailure);
    } finally {
      isMigrationInFlightRef.current = false;
    }
  }, [
    accountService,
    finalizeSuccessfulMigration,
    isBlocking,
    runtime.initialBackoffMs,
    runtime.isMigrationActive,
    runtime.maxBackoffMs,
    runtime.maxRetries,
    legacyAccountService,
    migrationReadiness,
    submitMigration,
  ]);

  const contextValue = useMemo<MigrationContextValue>(() => {
    return {
      isActive: runtime.isMigrationActive,
      isBlocking,
      flowState,
      errorMessage,
      migrationReadiness,
      retryCount,
      maxRetries: runtime.maxRetries,
      startMigration,
      completeMigration,
    };
  }, [
    completeMigration,
    errorMessage,
    flowState,
    isBlocking,
    migrationReadiness,
    retryCount,
    runtime.isMigrationActive,
    runtime.maxRetries,
    startMigration,
  ]);

  return <MigrationContext.Provider value={contextValue}>{children}</MigrationContext.Provider>;
};

export const useMigration = (): MigrationContextValue => {
  const context = useContext(MigrationContext);
  if (!context) {
    throw new Error('useMigration must be used within MigrationProvider');
  }
  return context;
};
