'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { getConfig } from '~/config';
import { chainData } from '~/config/chainData';
import { useChainContext } from '~/hooks';
import { AllEventsResponse, GlobalEventsResponse } from '~/types';
import { aspClient } from '~/utils';

const {
  constants: { ITEMS_PER_PAGE },
} = getConfig();

export type PoolFilter = {
  chainId: number;
  pool: string;
  scope: string;
  aspUrl: string;
} | null;

type EventsResponse = GlobalEventsResponse | AllEventsResponse;

export const useGlobalASP = (): {
  isError?: boolean;
  isLoading?: boolean;
  globalEventsData: EventsResponse | undefined;
  globalEventsByPage: EventsResponse | undefined;
  poolFilter: PoolFilter;
} => {
  const {
    chain: { aspUrl },
  } = useChainContext();

  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get('page') || 1);

  // Check for pool-specific filtering from query params (e.g., from "View All" on a pool page)
  const filterChainId = searchParams.get('chainId');
  const filterPool = searchParams.get('pool');

  const poolFilter: PoolFilter = useMemo(() => {
    if (!filterChainId || !filterPool) return null;
    const parsedChainId = parseInt(filterChainId, 10);
    const chain = chainData[parsedChainId];
    if (!chain) return null;
    const poolInfo = chain.poolInfo.find((p) => p.asset.toLowerCase() === filterPool.toLowerCase());
    if (!poolInfo) return null;
    return {
      chainId: parsedChainId,
      pool: filterPool,
      scope: poolInfo.scope.toString(),
      aspUrl: chain.aspUrl,
    };
  }, [filterChainId, filterPool]);

  // Fetch first page for preview (6 items)
  const globalEventsQuery = useQuery({
    queryKey: ['asp_global_events', poolFilter?.aspUrl ?? aspUrl, poolFilter?.chainId, poolFilter?.scope],
    queryFn: async () => {
      if (poolFilter) {
        return aspClient.fetchAllEvents(poolFilter.aspUrl, poolFilter.chainId, poolFilter.scope, 1, 6);
      }
      return aspClient.fetchGlobalEvents(aspUrl, 1, 6);
    },
    refetchInterval: 120000,
    staleTime: 60000,
    retryOnMount: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Fetch paginated events for full view
  const globalEventsByPageQuery = useQuery({
    queryKey: [
      'asp_global_events_by_page',
      currentPage,
      poolFilter?.aspUrl ?? aspUrl,
      poolFilter?.chainId,
      poolFilter?.scope,
    ],
    queryFn: async () => {
      if (poolFilter) {
        return aspClient.fetchAllEvents(
          poolFilter.aspUrl,
          poolFilter.chainId,
          poolFilter.scope,
          currentPage,
          ITEMS_PER_PAGE,
        );
      }
      return aspClient.fetchGlobalEvents(aspUrl, currentPage, ITEMS_PER_PAGE);
    },
    refetchInterval: 60000,
    retryOnMount: false,
  });

  const isError = globalEventsQuery.isError;
  const isLoading = globalEventsQuery.isLoading;

  return useMemo(
    () => ({
      isError,
      isLoading,
      globalEventsData: globalEventsQuery.data,
      globalEventsByPage: globalEventsByPageQuery.data,
      poolFilter,
    }),
    [isError, isLoading, globalEventsQuery.data, globalEventsByPageQuery.data, poolFilter],
  );
};
