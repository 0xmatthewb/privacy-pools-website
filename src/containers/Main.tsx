'use client';

import { styled } from '@mui/material';
import { SafeAppWrapper } from '~/components';
import { ActivityPreview, GlobalPool, AllPoolAccountsPreview } from '~/containers';

export const Main = () => {
  return (
    <SafeAppWrapper>
      <MainContainer>
        <AllPoolAccountsPreview />

        <GlobalPool />

        <ActivityPreview />
      </MainContainer>
    </SafeAppWrapper>
  );
};

export const MainContainer = styled('div')(() => {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    height: '100%',
    gap: '2.4rem',
    marginTop: '2rem',
  };
});
