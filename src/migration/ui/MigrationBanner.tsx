'use client';

import Link from 'next/link';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import { styled, Typography } from '@mui/material';
import { useMigration } from '../hooks/useMigration';

const ANNOUNCEMENT_URL = 'https://0xbow.io';

export const MigrationBanner = () => {
  const { isActive } = useMigration();

  if (!isActive) return null;

  return (
    <BannerRoot>
      <ShieldOutlinedIcon fontSize='small' />
      <BannerText variant='body2'>
        We strengthened our key generation entropy.
        <AnnouncementLink href={ANNOUNCEMENT_URL} target='_blank' rel='noopener noreferrer'>
          Read the announcement
        </AnnouncementLink>
      </BannerText>
    </BannerRoot>
  );
};

const BannerRoot = styled('div')(({ theme }) => ({
  width: '100%',
  backgroundColor: theme.palette.background.paper,
  borderBottom: `1px solid ${theme.palette.divider}`,
  padding: '1.2rem 2rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '1.6rem',
  color: theme.palette.success.main,
}));

const BannerText = styled(Typography)(({ theme }) => ({
  margin: 0,
  fontSize: '1.4rem',
  color: theme.palette.text.primary,
}));

const AnnouncementLink = styled(Link)(({ theme }) => ({
  marginLeft: '0.6rem',
  color: theme.palette.text.secondary,
  textDecoration: 'underline',
  textUnderlineOffset: '0.3rem',
}));
