import classNames from 'classnames';
import { useLocalization } from '@fluent/react';
import { Typography } from '@/components/commons/Typography';
import { SquaresIcon } from '@/components/commons/icon/SquaresIcon';
import {
  SettingsPageLayout,
  SettingsPagePaneLayout,
} from '@/components/settings/SettingsPageLayout';
import { defaultConfig, useConfig } from '@/hooks/config';

// Each special theme is a `:root[data-theme='…']` block in index.scss.
// Bun is the first one, from PawPad's default bunny palette. Fox, dog, and the other PawPad looks come later.
export function SpecialThemesSettings() {
  const { l10n } = useLocalization();
  const { config, setConfig } = useConfig();
  const current = config?.theme;

  const cards = [
    {
      theme: 'bun',
      title: l10n.getString('settings-special-themes-bun-title'),
      description: l10n.getString('settings-special-themes-bun-description'),
    },
    {
      theme: defaultConfig.theme,
      title: l10n.getString('settings-special-themes-default-title'),
      description: l10n.getString(
        'settings-special-themes-default-description'
      ),
    },
  ];

  return (
    <SettingsPageLayout>
      <SettingsPagePaneLayout icon={<SquaresIcon />} id="special-themes">
        <Typography variant="main-title">
          {l10n.getString('settings-special-themes-title')}
        </Typography>
        <div className="flex flex-col gap-3 pt-4">
          {cards.map((card) => (
            <button
              key={card.theme}
              type="button"
              onClick={() => setConfig({ theme: card.theme })}
              className={classNames(
                'flex flex-col items-start gap-1 rounded-lg border p-4 text-left',
                current === card.theme
                  ? 'border-accent-background-30 bg-background-60'
                  : 'border-background-50 hover:bg-background-60'
              )}
            >
              <span className="text-ui-sm font-bold">{card.title}</span>
              <span className="text-ui-xs text-background-20">
                {card.description}
              </span>
            </button>
          ))}
        </div>
      </SettingsPagePaneLayout>
    </SettingsPageLayout>
  );
}
