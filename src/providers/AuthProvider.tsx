'use client';

import { createContext, useEffect, useState } from 'react';
import { useAccount, useDisconnect } from 'wagmi';
import { useAccountContext, useChainContext } from '~/hooks';
import { aspClient } from '~/utils/aspClient';

interface AuthContextType {
  isLogged: boolean;
  setIsLogged: (isLogged: boolean) => void;
  isConnected: boolean;
  login: (_seed?: string) => void;
  logout: () => void;
  isAuthorized: boolean;
}

export const AuthContext = createContext({} as AuthContextType);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { disconnect } = useDisconnect();
  const { resetGlobalState, seed } = useAccountContext();
  const { address } = useAccount();
  const [isLogged, setIsLogged] = useState<boolean>(false);
  const { chainId, chain } = useChainContext();

  const logout = () => {
    disconnect();
    resetGlobalState();
    setIsLogged(false);
  };

  const login = async (_seed?: string) => {
    if ((seed || _seed) && address) {
      setIsLogged(true);

      // Fetch pool stats when user logs in
      try {
        const poolStats = await aspClient.fetchPoolStats(chain.aspUrl, chainId);
        console.log('Pool Stats:', poolStats);
      } catch (error) {
        console.error('Failed to fetch pool stats:', error);
      }
    } else {
      throw new Error('Seed or address is missing');
    }
  };

  // Initialize authentication state
  useEffect(() => {
    // If user already has both wallet connected and seed loaded, they're logged in
    if (address && seed) {
      setIsLogged(true);
    } else {
      setIsLogged(false);
    }
  }, [address, seed]);

  return (
    <AuthContext.Provider
      value={{
        isLogged,
        setIsLogged,
        isConnected: !!address,
        login,
        logout,
        isAuthorized: isLogged && !!address,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
