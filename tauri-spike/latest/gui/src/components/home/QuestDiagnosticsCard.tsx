import classNames from 'classnames';
import { useAtomValue } from 'jotai';
import { assignedTrackersAtom } from '@/store/app-store';
import { useSidebarPushAnimation } from '@/hooks/sidebar-animation';
import { useCollapsibleHeight } from '@/hooks/collapsible-height';
import { useOperatingMode } from '@/hooks/operating-mode';
import { useTrackerPresets } from '@/hooks/presets';
import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useLocalization } from '@fluent/react';
import { SegmentedControl } from '@/components/commons/SegmentedControl';
import { SettingGroup, SettingRow } from '@/components/commons/SettingRow';
import { Slider } from '@/components/commons/Slider';
import { Toggle } from '@/components/commons/Toggle';

const buttonBase =
  'inline-flex h-8 items-center justify-center rounded-[8px] px-3 text-ui-xs font-medium transition-colors cursor-pointer select-none active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-background-20/70';
const ghostButton = `${buttonBase} text-background-20 hover:bg-background-10/[0.08] hover:text-background-10`;
const solidButton = `${buttonBase} bg-background-10/[0.1] text-background-10 hover:bg-background-10/[0.16]`;
const sentButton = `${buttonBase} bg-status-success/15 text-status-success`;
const stepButton = `${buttonBase} !h-7 !w-7 shrink-0 !px-0 bg-background-10/[0.08] text-background-20 hover:bg-background-10/[0.14] hover:text-background-10`;

export function QuestDiagnosticsCard() {
  const { l10n } = useLocalization();
  const {
    floorAnchor,
    toggleFloorAnchor,
    triggerFloorCalibration,
    adjustFloorHeight,
    setFloorHeight,
    setCorrectionStrength,
    setFootPlant,
    setOscRate,
    setChatboxEnabled,
    setChatboxOnlyMode,
    triggerChatboxStatus,
  } = useOperatingMode();

  const [isEditingElevation, setIsEditingElevation] = useState(false);
  const [elevationInputVal, setElevationInputVal] = useState('');
  const elevationInputRef = useRef<HTMLInputElement>(null);

  const handleStartEditElevation = () => {
    const currentCm = Math.round(floorAnchor.floorOffset * 100);
    setElevationInputVal(currentCm.toString());
    setIsEditingElevation(true);
  };

  useEffect(() => {
    if (isEditingElevation && elevationInputRef.current) {
      elevationInputRef.current.focus();
      elevationInputRef.current.select();
    }
  }, [isEditingElevation]);

  const handleCommitElevation = () => {
    setIsEditingElevation(false);
    const cleaned = elevationInputVal.trim();
    if (!cleaned) return;
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed)) {
      const clamped = Math.max(-300, Math.min(300, parsed));
      setFloorHeight(clamped / 100);
    }
  };

  const handleElevationKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCommitElevation();
    } else if (e.key === 'Escape') {
      setIsEditingElevation(false);
    }
  };

  useEffect(() => {
    const onDelta = (e: CustomEvent<number>) => {
      adjustFloorHeight(e.detail);
    };
    const onReset = () => {
      setFloorHeight(0);
    };
    window.addEventListener('tray-elevation-delta', onDelta as EventListener);
    window.addEventListener('tray-elevation-reset-event', onReset);
    return () => {
      window.removeEventListener(
        'tray-elevation-delta',
        onDelta as EventListener
      );
      window.removeEventListener('tray-elevation-reset-event', onReset);
    };
  }, [adjustFloorHeight, setFloorHeight]);
  const assignedTrackers = useAtomValue(assignedTrackersAtom);
  const { activePreset } = useTrackerPresets();
  const [calibrating, setCalibrating] = useState(false);
  const [chatboxSent, setChatboxSent] = useState(false);

  const handleSendChatbox = () => {
    setChatboxSent(true);
    triggerChatboxStatus();
    setTimeout(() => setChatboxSent(false), 2000);
  };

  const activeAssigned = assignedTrackers.filter(
    ({ tracker }) => tracker.status === 1 || tracker.status === 2
  ).length;

  const handleCalibrate = () => {
    setCalibrating(true);
    triggerFloorCalibration();
    setTimeout(() => {
      setCalibrating(false);
    }, 1200);
  };

  const [showTuning, setShowTuning] = useState(false);
  const tuningPanel = useCollapsibleHeight(showTuning);
  const [advancedTab, setAdvancedTab] = useState<'motion' | 'vrchat'>('motion');

  useLayoutEffect(() => {
    if (tuningPanel.ref.current) {
      tuningPanel.ref.current.inert = !showTuning;
    }
  }, [showTuning, tuningPanel.ref]);

  const rates = [30, 50, 60, 90] as const;

  const sidebarTabAnim = useSidebarPushAnimation(1);

  return (
    <div
      style={sidebarTabAnim.style}
      className={classNames(
        'w-full flex flex-col select-none liquid-glass-tab-strip',
        sidebarTabAnim.className
      )}
    >
      {/* Flush Header Strip matching getting started collapsed tab */}
      <button
        type="button"
        aria-expanded={showTuning}
        aria-controls="quest-telemetry-controls"
        onClick={() => setShowTuning((prev) => !prev)}
        className="telemetry-strip__toggle w-full cursor-pointer px-4 py-2 flex items-center justify-between select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-background-20/70 sm:px-6"
        title={
          showTuning ? 'Hide telemetry controls' : 'Show telemetry controls'
        }
      >
        <div className="flex items-center gap-2 min-w-0 flex-nowrap overflow-hidden">
          <span className="text-ui-xs text-background-10 font-medium truncate whitespace-nowrap shrink-0">
            Quest controls
          </span>
          <div
            className={classNames(
              'flex items-center gap-1.5 text-ui-2xs tnum text-background-30 font-sans whitespace-nowrap shrink-0 overflow-hidden transition-all duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
              showTuning
                ? 'opacity-0 max-w-0 pointer-events-none -translate-x-2'
                : 'opacity-100 max-w-[400px] translate-x-0'
            )}
          >
            <span className="text-background-40/60">·</span>
            <span>
              {l10n.getString('home-quest-floor-offset')}:{' '}
              {floorAnchor.floorOffset >= 0 ? '+' : ''}
              {(floorAnchor.floorOffset * 100).toFixed(0)}cm
            </span>
            <span className="text-background-40/60">·</span>
            <span>
              {l10n.getString('home-quest-osc-rate')}: {floorAnchor.oscRate}Hz
            </span>
            <span className="text-background-40/60">·</span>
            <span
              className={
                floorAnchor.isAnchored
                  ? 'text-status-success'
                  : 'text-background-30'
              }
            >
              {l10n.getString(
                floorAnchor.isAnchored
                  ? 'home-quest-anchored'
                  : 'home-quest-unanchored'
              )}
            </span>
          </div>
        </div>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="none"
          className={classNames(
            'h-4 w-4 shrink-0 text-background-30 transition-transform duration-200 ease-out',
            showTuning && 'rotate-180'
          )}
        >
          <path
            d="m4 6 4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Expanded Controls Panel with Cinematic Liquid Glass Animation */}
      <div
        id="quest-telemetry-controls"
        ref={tuningPanel.ref}
        aria-hidden={!showTuning}
        style={tuningPanel.style}
        onTransitionEnd={tuningPanel.onTransitionEnd}
        className={classNames(
          'collapsible-tab-grid',
          showTuning
            ? 'collapsible-tab-grid-expanded'
            : 'collapsible-tab-grid-collapsed'
        )}
      >
        <div className="overflow-hidden min-h-0">
          <div
            className={classNames(
              'w-full px-4 pt-3 pb-1.5 flex flex-col gap-1.5 border-t border-background-10/[0.035] liquid-glass-tab-panel collapsible-tab-content sm:px-6'
            )}
          >
            <div className="grid grid-cols-1 gap-x-10 gap-y-4 pb-3 md:grid-cols-2">
              <SettingGroup title="Tracking">
                <SettingRow
                  label="Trackers assigned"
                  description={activePreset?.name || 'Custom Setup'}
                >
                  <span className="tnum text-ui-xs text-background-20">
                    {activeAssigned} active · {activePreset?.targetCount || 5}{' '}
                    target
                  </span>
                </SettingRow>

                <SettingRow
                  label="Floor clip"
                  description={floorAnchor.isAnchored ? 'On' : 'Off'}
                >
                  <button
                    type="button"
                    onClick={toggleFloorAnchor}
                    aria-pressed={floorAnchor.isAnchored}
                    className={ghostButton}
                  >
                    {floorAnchor.isAnchored ? 'Turn off' : 'Turn on'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCalibrate}
                    disabled={calibrating}
                    className={solidButton}
                  >
                    {calibrating ? 'Done' : 'Calibrate'}
                  </button>
                </SettingRow>

                <SettingRow
                  stacked
                  label="Elevation"
                  value={
                    isEditingElevation ? (
                      <span className="flex items-center gap-1">
                        <input
                          ref={elevationInputRef}
                          type="text"
                          value={elevationInputVal}
                          onChange={(e) => setElevationInputVal(e.target.value)}
                          onBlur={handleCommitElevation}
                          onKeyDown={handleElevationKeyDown}
                          className="w-14 rounded-[6px] border border-accent-background-20 bg-background-10/[0.08] px-1.5 py-0.5 text-center text-ui-xs tnum text-background-10 outline-none"
                          placeholder="0"
                          aria-label="Custom Elevation in centimeters"
                        />
                        <span className="text-background-30">cm</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleStartEditElevation}
                        className="cursor-text rounded-[6px] px-1.5 py-0.5 tnum text-background-10 transition-colors hover:bg-background-10/[0.08]"
                        title="Click to type custom elevation in cm"
                      >
                        {floorAnchor.floorOffset >= 0 ? '+' : ''}
                        {(floorAnchor.floorOffset * 100).toFixed(0)} cm
                      </button>
                    )
                  }
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => adjustFloorHeight(-1)}
                      className={stepButton}
                      title="Lower elevation by 1cm"
                      aria-label="Lower elevation by 1cm"
                    >
                      −
                    </button>
                    <Slider
                      min={-150}
                      max={200}
                      value={Math.round(floorAnchor.floorOffset * 100)}
                      onChange={(v) => setFloorHeight(v / 100)}
                      label="Floor Elevation Offset"
                    />
                    <button
                      type="button"
                      onClick={() => adjustFloorHeight(1)}
                      className={stepButton}
                      title="Raise elevation by 1cm"
                      aria-label="Raise elevation by 1cm"
                    >
                      +
                    </button>
                    {Math.round(floorAnchor.floorOffset * 100) !== 0 && (
                      <button
                        type="button"
                        onClick={() => setFloorHeight(0)}
                        className={ghostButton}
                        title="Snap floor back to exact 0cm"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </SettingRow>

                <SettingRow label="OSC target rate">
                  <SegmentedControl
                    ariaLabel="OSC output rate"
                    value={String(floorAnchor.oscRate)}
                    onChange={(v) =>
                      setOscRate(Number(v) as (typeof rates)[number])
                    }
                    options={rates.map((r) => ({
                      value: String(r),
                      label: `${r}Hz`,
                    }))}
                  />
                </SettingRow>
              </SettingGroup>

              <SettingGroup
                title="Advanced"
                hint={`${Math.round(floorAnchor.correctionStrength * 100)}% correction · foot plant ${floorAnchor.footPlant ? 'on' : 'off'}`}
              >
                <div className="pb-2.5 pt-1">
                  <SegmentedControl
                    ariaLabel="Advanced telemetry settings"
                    className="w-full [&>button]:flex-1"
                    value={advancedTab}
                    onChange={setAdvancedTab}
                    options={[
                      { value: 'motion', label: 'Motion' },
                      { value: 'vrchat', label: 'VRChat' },
                    ]}
                  />
                </div>

                {advancedTab === 'motion' ? (
                  <>
                    <SettingRow
                      stacked
                      label="Correction strength"
                      value={`${Math.round(floorAnchor.correctionStrength * 100)}%`}
                    >
                      <Slider
                        min={0}
                        max={100}
                        value={Math.round(floorAnchor.correctionStrength * 100)}
                        onChange={(v) => setCorrectionStrength(v / 100)}
                        label="Correction Strength"
                      />
                    </SettingRow>
                    <SettingRow
                      label="Foot plant lock"
                      description="Keeps planted feet from sliding"
                    >
                      <Toggle
                        checked={floorAnchor.footPlant}
                        onChange={setFootPlant}
                        label="Toggle Foot Plant Lock"
                      />
                    </SettingRow>
                  </>
                ) : (
                  <>
                    <SettingRow
                      label="Battery status in chatbox"
                      description="Share tracker battery levels in VRChat"
                    >
                      <button
                        type="button"
                        onClick={handleSendChatbox}
                        className={chatboxSent ? sentButton : ghostButton}
                        title="Broadcast current tracker battery levels into VRChat chatbox now"
                      >
                        {chatboxSent ? '✓ Sent' : 'Send now'}
                      </button>
                      <Toggle
                        checked={floorAnchor.chatboxEnabled}
                        onChange={setChatboxEnabled}
                        label="Toggle VRChat Chatbox Battery HUD"
                        title="Toggle automatic periodic chatbox battery updates"
                      />
                    </SettingRow>
                    <SettingRow
                      label="Chat-only mode"
                      description={
                        floorAnchor.chatboxOnlyMode
                          ? 'Tracker OSC muted; chat bubble stays active'
                          : 'Mutes tracker OSC; chat bubble stays active'
                      }
                    >
                      <Toggle
                        checked={floorAnchor.chatboxOnlyMode}
                        onChange={setChatboxOnlyMode}
                        label="Toggle Chat-Only Mode"
                        title="Toggle Chat-Only Mode (Mutes tracker OSC, keeps chatbox active)"
                      />
                    </SettingRow>
                  </>
                )}
              </SettingGroup>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
