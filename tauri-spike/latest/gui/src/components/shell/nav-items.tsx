import { ReactNode } from 'react';
import { GearIcon } from '@/components/commons/icon/GearIcon';
import { HomeIcon } from '@/components/commons/icon/HomeIcon';
import { HumanIcon } from '@/components/commons/icon/HumanIcon';
import { RemoteIcon } from '@/components/commons/icon/RemoteIcon';

export interface NavItem {
  to: string;
  /** Route pattern used to decide the active item (defaults to `to`). */
  match?: string;
  labelId: string;
  fallback: string;
  icon: ReactNode;
  /** Cmd/Ctrl + this digit opens the page. */
  shortcut: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    to: '/',
    labelId: 'navbar-home',
    fallback: 'Home',
    icon: <HomeIcon />,
    shortcut: '1',
  },
  {
    to: '/remote',
    labelId: 'navbar-remote',
    fallback: 'Remote',
    icon: <RemoteIcon />,
    shortcut: '2',
  },
  {
    to: '/onboarding/home',
    match: '/onboarding/*',
    labelId: 'navbar-onboarding',
    fallback: 'Setup Wizard',
    icon: <HumanIcon />,
    shortcut: '3',
  },
  {
    to: '/settings/trackers',
    match: '/settings/*',
    labelId: 'navbar-settings',
    fallback: 'Settings',
    icon: <GearIcon />,
    shortcut: '4',
  },
];
