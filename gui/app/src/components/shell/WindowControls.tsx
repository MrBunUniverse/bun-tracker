import { useState } from 'react';
import { useLocalization } from '@fluent/react';
import { useAtomValue } from 'jotai';
import { useConfig } from '@/hooks/config';
import { useElectron } from '@/hooks/electron';
import { useIsMac } from '@/hooks/platform';
import { connectedIMUCountAtom } from '@/store/app-store';
import { CloseIcon } from '@/components/commons/icon/CloseIcon';
import { MaximiseIcon } from '@/components/commons/icon/MaximiseIcon';
import { MinimiseIcon } from '@/components/commons/icon/MinimiseIcon';
import { IconButton } from '@/components/commons/IconButton';
import { TrackersStillOnModal } from '@/components/TrackersStillOnModal';
import { TrayOrExitModal } from '@/components/TrayOrExitModal';

/**
 * Minimise, maximise and close for the undecorated (non-macOS) window, with the
 * tray and trackers-still-on prompts that closing can raise. Renders nothing on
 * macOS, which has native window controls.
 */
export function WindowControls() {
  const { l10n } = useLocalization();
  const electron = useElectron();
  const isMac = useIsMac();
  const connectedIMUCount = useAtomValue(connectedIMUCountAtom);
  const { config, setConfig, saveConfig } = useConfig();
  const [showTrayOrExitModal, setShowTrayOrExitModal] = useState(false);
  const [showConnectedTrackersWarning, setConnectedTrackerWarning] =
    useState(false);

  const closeApp = async () => {
    if (!electron.isElectron) return;
    await saveConfig();
    electron.api.close();
  };

  const tryCloseApp = async (dontTray = false) => {
    if (!electron.isElectron) throw 'no electron';

    if (config?.useTray === null) {
      setShowTrayOrExitModal(true);
      return;
    }

    if (config?.useTray && !dontTray) {
      electron.api.hide();
    } else if (config?.connectedTrackersWarning && connectedIMUCount > 0) {
      setConnectedTrackerWarning(true);
    } else {
      await closeApp();
    }
  };

  return (
    <>
      {electron.isElectron && !isMac && (
        <div className="ml-1 flex items-center gap-1">
          <IconButton
            label={l10n.getString(
              'topbar-window-minimize',
              null,
              'Minimize window'
            )}
            onClick={() => electron.api.minimize()}
          >
            <MinimiseIcon />
          </IconButton>
          <IconButton
            label={l10n.getString(
              'topbar-window-maximize',
              null,
              'Maximize window'
            )}
            onClick={() => electron.api.toggleMaximize()}
          >
            <MaximiseIcon />
          </IconButton>
          <IconButton
            label={l10n.getString('topbar-window-close', null, 'Close window')}
            onClick={() => tryCloseApp()}
          >
            <CloseIcon />
          </IconButton>
        </div>
      )}
      {electron.isElectron && (
        <TrayOrExitModal
          isOpen={showTrayOrExitModal}
          accept={async (useTray) => {
            await setConfig({ useTray });
            setShowTrayOrExitModal(false);

            // Doing this in here just in case config doesn't get updated in time
            if (useTray) {
              electron.api.minimize();
              // await invoke('update_tray_text');
            } else if (
              config?.connectedTrackersWarning &&
              connectedIMUCount > 0
            ) {
              setConnectedTrackerWarning(true);
            } else {
              await closeApp();
            }
          }}
          cancel={() => setShowTrayOrExitModal(false)}
        />
      )}
      <TrackersStillOnModal
        isOpen={showConnectedTrackersWarning}
        accept={() => closeApp()}
        cancel={() => {
          setConnectedTrackerWarning(false);
        }}
      />
    </>
  );
}
