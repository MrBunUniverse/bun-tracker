import { Localized, useLocalization } from '@fluent/react';
import { Typography } from '@/components/commons/Typography';
import {
  SettingsPageLayout,
  SettingsPagePaneLayout,
} from '@/components/settings/SettingsPageLayout';
import { A } from '@/components/commons/A';
import { FileIcon } from '@/components/commons/icon/FileIcon';

const DISCORD_PROFILE_URL = 'https://discord.com/users/390812634481688576';

const sections = ['about', 'credit', 'help', 'ai', 'warranty', 'agreement'];

export function UserAgreementSettings() {
  const { l10n } = useLocalization();

  return (
    <SettingsPageLayout>
      <SettingsPagePaneLayout icon={<FileIcon />} id="user-agreement">
        <>
          <Typography variant="main-title">
            {l10n.getString('settings-user_agreement')}
          </Typography>
          <div className="flex flex-col gap-4">
            {sections.map((key) => (
              <div key={key} className="flex flex-col gap-1">
                <Typography variant="section-title">
                  {l10n.getString(`settings-user_agreement-${key}-title`)}
                </Typography>
                <Localized
                  id={`settings-user_agreement-${key}`}
                  elems={{ discord: <A href={DISCORD_PROFILE_URL} /> }}
                >
                  <Typography
                    whitespace="whitespace-pre-line"
                    color="secondary"
                  >
                    {l10n.getString(`settings-user_agreement-${key}`)}
                  </Typography>
                </Localized>
              </div>
            ))}
          </div>
        </>
      </SettingsPagePaneLayout>
    </SettingsPageLayout>
  );
}
