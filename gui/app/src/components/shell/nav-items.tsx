import { ReactNode } from 'react';
import { GearIcon } from '@/components/commons/icon/GearIcon';
import { HomeIcon } from '@/components/commons/icon/HomeIcon';
import { HumanIcon } from '@/components/commons/icon/HumanIcon';
import { RemoteIcon } from '@/components/commons/icon/RemoteIcon';
import { RulerIcon } from '@/components/commons/icon/RulerIcon';
import { NAV_ROUTES, NavRoute } from './nav-routes';

export interface NavItem extends NavRoute {
  icon: ReactNode;
}

const ICONS: Record<string, ReactNode> = {
  'navbar-onboarding': <HumanIcon />,
  'navbar-home': <HomeIcon />,
  'navbar-remote': <RemoteIcon />,
  'navbar-body_proportions': <RulerIcon />,
  'navbar-settings': <GearIcon />,
};

export const NAV_ITEMS: NavItem[] = NAV_ROUTES.map((route) => ({
  ...route,
  icon: ICONS[route.labelId],
}));
