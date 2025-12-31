'use client';

import { useState, useCallback } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { useNotifications } from '~/hooks';

interface SelfReportState {
  isLoading: boolean;
  isSuccess: boolean;
  error: string | null;
}

export function useSelfReport() {
  const { address, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { addNotification } = useNotifications();

  const [state, setState] = useState<SelfReportState>({
    isLoading: false,
    isSuccess: false,
    error: null,
  });

  const buildSiweMessage = useCallback(
    (nonce: string) => {
      if (!address || !chainId) return null;

      const domain = typeof window !== 'undefined' ? window.location.host : 'privacypools.com';
      const uri = typeof window !== 'undefined' ? window.location.origin : 'https://privacypools.com';
      const issuedAt = new Date().toISOString();

      // SIWE message format per EIP-4361
      const message = `${domain} wants you to sign in with your Ethereum account:
${address}

I am reporting that my deposit address private key has been compromised. All deposits from this address should be blocked from anonymous withdrawal.

URI: ${uri}
Version: 1
Chain ID: ${chainId}
Nonce: ${nonce}
Issued At: ${issuedAt}`;

      return message;
    },
    [address, chainId],
  );

  const generateNonce = useCallback(() => {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }, []);

  const reportCompromisedAddress = useCallback(async () => {
    if (!address) {
      setState({ isLoading: false, isSuccess: false, error: 'No wallet connected' });
      return false;
    }

    setState({ isLoading: true, isSuccess: false, error: null });

    try {
      const nonce = generateNonce();
      const message = buildSiweMessage(nonce);

      if (!message) {
        throw new Error('Failed to build SIWE message');
      }

      // Sign the message
      const signature = await signMessageAsync({ message });

      // Send to API endpoint
      const response = await fetch('/api/self-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          address,
          message,
          signature,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to report address');
      }

      setState({ isLoading: false, isSuccess: true, error: null });
      addNotification('success', 'Address successfully reported as compromised. All deposits will be blocked.');
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to report address';
      setState({ isLoading: false, isSuccess: false, error: errorMessage });

      // Don't show notification for user rejection
      if (!errorMessage.includes('rejected') && !errorMessage.includes('denied')) {
        addNotification('error', errorMessage);
      }
      return false;
    }
  }, [address, signMessageAsync, buildSiweMessage, generateNonce, addNotification]);

  const reset = useCallback(() => {
    setState({ isLoading: false, isSuccess: false, error: null });
  }, []);

  return {
    ...state,
    address,
    reportCompromisedAddress,
    reset,
  };
}
