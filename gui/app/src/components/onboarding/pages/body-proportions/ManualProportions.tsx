import { Control, Controller, useForm } from 'react-hook-form';
import {
  ChangeSkeletonConfigRequestT,
  ResetType,
  RpcMessage,
  SkeletonBone,
  SkeletonConfigRequestT,
  SkeletonConfigResponseT,
  SkeletonResetAllRequestT,
} from 'solarxr-protocol';
import { useOnboarding } from '@/hooks/onboarding';
import { useWebsocketAPI } from '@/hooks/websocket-api';
import { BodyProportions, BonePick, OnHighlight } from './BodyProportions';
import { Localized, useLocalization } from '@fluent/react';
import {
  KeyboardEvent,
  PointerEvent,
  ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  PreviewContext,
  SkeletonVisualizerWidget,
} from '@/components/widgets/SkeletonVisualizerWidget';
import { ProportionsResetModal } from './ProportionsResetModal';
import { fileOpen, fileSave } from 'browser-fs-access';
import { CURRENT_EXPORT_VERSION, MIN_HEIGHT } from '@/hooks/manual-proportions';
import { error } from '@/utils/logging';
import classNames from 'classnames';
import { Tooltip } from '@/components/commons/Tooltip';
import { useAtomValue } from 'jotai';
import { computedTrackersAtom } from '@/store/app-store';
import { RulerIcon } from '@/components/commons/icon/RulerIcon';
import { PercentIcon } from '@/components/commons/icon/PercentIcon';
import { UploadFileIcon } from '@/components/commons/icon/UploadFileIcon';
import { FullResetIcon } from '@/components/commons/icon/ResetIcon';
import { ImportIcon } from '@/components/commons/icon/ImportIcon';
import { HumanIcon } from '@/components/commons/icon/HumanIcon';
import { AutoFrameIcon } from '@/components/commons/icon/AutoFrameIcon';
import { Rotate360Icon } from '@/components/commons/icon/Rotate360Icon';
import { Typography } from '@/components/commons/Typography';
import { useLocaleConfig } from '@/i18n/config';
import { useNavigate } from 'react-router-dom';
import { ResetButton } from '@/components/home/ResetButton';
import { Vector3 } from 'three';
import { ArrowLink } from '@/components/commons/ArrowLink';
import {
  clampPreview,
  defaultPreview,
  keyboardPreview,
  parseStoredPreview,
  splitBounds,
} from '@/utils/pane-split';

const PREVIEW_HEIGHT_KEY = 'slimevr-manual-preview-height';

function readPreviewPref() {
  try {
    return parseStoredPreview(localStorage.getItem(PREVIEW_HEIGHT_KEY));
  } catch {
    return null;
  }
}

function writePreviewPref(height: number | null) {
  try {
    if (height === null) localStorage.removeItem(PREVIEW_HEIGHT_KEY);
    else localStorage.setItem(PREVIEW_HEIGHT_KEY, String(height));
  } catch {
    // storage unavailable: the split just won't be remembered
  }
}

// Compact icon + short label. The full Fluent label (`label`) is the tooltip and accessible name, so the short text
// can stay visible without losing the long wording.
function IconButton({
  onClick,
  className,
  disabled,
  label,
  shortLabel,
  tooltip,
  icon,
}: {
  onClick: () => void;
  className?: string;
  disabled?: boolean;
  label: string;
  shortLabel: string;
  tooltip?: ReactNode;
  icon: ReactNode;
}) {
  const { l10n } = useLocalization();

  return (
    <Tooltip
      preferedDirection="bottom"
      content={
        tooltip ?? (
          <Localized id={label}>
            <Typography variant="standard" />
          </Localized>
        )
      }
    >
      <button
        onClick={onClick}
        disabled={disabled}
        aria-label={l10n.getString(label)}
        className={classNames(
          'flex items-center gap-1.5 h-8 px-2.5 rounded-mac-tile text-standard fill-background-10 transition-colors',
          disabled
            ? 'cursor-not-allowed opacity-30'
            : 'hover:bg-background-50 cursor-pointer',
          className
        )}
      >
        <span className="flex justify-center items-center min-w-[18px] h-[18px] shrink-0">
          {icon}
        </span>
        <Localized id={shortLabel}>
          <Typography variant="standard" whitespace="whitespace-nowrap" />
        </Localized>
      </button>
    </Tooltip>
  );
}

function parseConfigImport(
  config: SkeletonConfigExport
): ChangeSkeletonConfigRequestT[] {
  if (!config.version) config.version = 1;
  if (config.version < 1) {
    // Add config migration stuff here, this one is just an example.
  }

  return config.skeletonParts.map((part) => {
    const bone =
      typeof part.bone === 'string' ? SkeletonBone[part.bone] : part.bone;

    return new ChangeSkeletonConfigRequestT(bone, part.value);
  });
}

type SkeletonBoneKey = keyof typeof SkeletonBone;

interface SkeletonConfigExport {
  version?: number;
  skeletonParts: {
    bone: SkeletonBoneKey | SkeletonBone;
    value: number;
  }[];
}

enum ImportStatus {
  FAILED,
  SUCCESS,
  OK,
}

function ImportExportButtons() {
  const { useRPCPacket, sendRPCPacket } = useWebsocketAPI();
  const [importState, setImportState] = useState(ImportStatus.OK);
  const exporting = useRef(false);

  useRPCPacket(
    RpcMessage.SkeletonConfigResponse,
    (data: SkeletonConfigExport) => {
      if (!exporting.current) return;
      exporting.current = false;

      // make a copy of the config as mutating it directly would be an issue
      // bc if other useRPCPacket read the same packet,
      // data would use the mutated data
      const copy: SkeletonConfigExport = JSON.parse(JSON.stringify(data));

      // Convert the skeleton part enums into a string
      copy.skeletonParts.forEach((x) => {
        if (typeof x.bone === 'number')
          x.bone = SkeletonBone[x.bone] as SkeletonBoneKey;
      });
      copy.version = CURRENT_EXPORT_VERSION;

      const blob = new Blob([JSON.stringify(copy)], {
        type: 'application/json',
      });
      fileSave(blob, {
        fileName: 'body-proportions.json',
        extensions: ['.json'],
      });
    }
  );

  const onImport = async () => {
    const file = await fileOpen({
      mimeTypes: ['application/json'],
    }).catch((err) => {
      error(err);
      return null;
    });
    if (!file) return;

    const text = await file.text();
    const config = JSON.parse(text) as SkeletonConfigExport;
    if (
      !config?.skeletonParts?.length ||
      !Array.isArray(config.skeletonParts)
    ) {
      error(
        'failed to import body proportions because skeletonParts is not an array/empty'
      );
      return setImportState(ImportStatus.FAILED);
    }

    for (const bone of [...config.skeletonParts]) {
      if (
        (typeof bone.bone === 'string' && !(bone.bone in SkeletonBone)) ||
        (typeof bone.bone === 'number' &&
          typeof SkeletonBone[bone.bone] !== 'string')
      ) {
        error(
          `failed to import body proportions because ${bone.bone} is not a valid bone`
        );
        return setImportState(ImportStatus.FAILED);
      }
    }

    parseConfigImport(config).forEach((req) =>
      sendRPCPacket(RpcMessage.ChangeSkeletonConfigRequest, req)
    );
    sendRPCPacket(
      RpcMessage.SkeletonConfigRequest,
      new SkeletonConfigRequestT()
    );
    setImportState(ImportStatus.SUCCESS);
    setTimeout(() => {
      setImportState(ImportStatus.OK);
    }, 2000);
  };

  return (
    <>
      <div className="flex">
        <IconButton
          icon={<UploadFileIcon width={18} />}
          onClick={onImport}
          label="onboarding-manual_proportions-import"
          shortLabel="onboarding-manual_proportions-import-short"
          className={classNames(
            'transition-colors',
            importState === ImportStatus.FAILED && 'text-status-critical',
            importState === ImportStatus.SUCCESS && 'text-status-success'
          )}
        />
      </div>
      <div className="flex">
        <IconButton
          icon={<ImportIcon size={18} />}
          label="onboarding-manual_proportions-export"
          shortLabel="onboarding-manual_proportions-export-short"
          onClick={() => {
            exporting.current = true;

            sendRPCPacket(
              RpcMessage.SkeletonConfigRequest,
              new SkeletonConfigRequestT()
            );
          }}
        />
      </div>
    </>
  );
}

type ManualProportionControls = Control<{
  precise: boolean;
  ratio: boolean;
}>;

function LinearRatioToggle({ control }: { control: ManualProportionControls }) {
  return (
    <Controller
      name="ratio"
      control={control}
      render={({ field: { onChange, value } }) => (
        <>
          {value ? (
            <IconButton
              icon={<PercentIcon size={18} />}
              onClick={() => onChange(!value)}
              label="onboarding-manual_proportions-grouped_proportions"
              shortLabel="onboarding-manual_proportions-grouped_proportions-short"
            />
          ) : (
            <IconButton
              icon={<RulerIcon width={18} />}
              onClick={() => onChange(!value)}
              label="onboarding-manual_proportions-all_proportions"
              shortLabel="onboarding-manual_proportions-all_proportions-short"
            />
          )}
        </>
      )}
    />
  );
}

function PreciseToggle({ control }: { control: ManualProportionControls }) {
  return (
    <Controller
      name="precise"
      control={control}
      render={({ field: { onChange, value } }) => (
        <>
          {!value ? (
            <IconButton
              icon={<div className="text-sm font-bold">+1</div>}
              onClick={() => onChange(!value)}
              label="onboarding-manual_proportions-normal_increment"
              shortLabel="onboarding-manual_proportions-increment_mode-short"
            />
          ) : (
            <IconButton
              icon={<div className="text-sm font-bold">+0.5</div>}
              onClick={() => onChange(!value)}
              label="onboarding-manual_proportions-precise_increment"
              shortLabel="onboarding-manual_proportions-increment_mode-short"
            />
          )}
        </>
      )}
    />
  );
}

function ButtonsControl({ control }: { control: ManualProportionControls }) {
  const { state } = useOnboarding();
  const nav = useNavigate();
  const computedTrackers = useAtomValue(computedTrackersAtom);
  const { sendRPCPacket } = useWebsocketAPI();

  const [showWarning, setShowWarning] = useState(false);
  const resetAll = () => {
    sendRPCPacket(
      RpcMessage.SkeletonResetAllRequest,
      new SkeletonResetAllRequestT()
    );
  };

  const beneathFloor = useMemo(() => {
    const hmd = computedTrackers.find(
      (tracker) =>
        tracker.tracker.trackerId?.trackerNum === 1 &&
        tracker.tracker.trackerId.deviceId?.id === undefined
    );
    return !(hmd?.tracker.position && hmd.tracker.position.y >= MIN_HEIGHT);
  }, [computedTrackers]);

  const canUseFineTuning = !beneathFloor || import.meta.env.DEV;

  return (
    <div className="bg-background-60 rounded-md flex flex-wrap items-center gap-1 p-1">
      <div className="flex">
        <LinearRatioToggle control={control} />
      </div>
      <div className="flex">
        <PreciseToggle control={control} />
      </div>
      <div className="flex">
        <IconButton
          icon={<FullResetIcon width={18} />}
          onClick={() => setShowWarning(true)}
          label="reset-reset_all"
          shortLabel="onboarding-manual_proportions-reset_all-short"
        />
      </div>
      <div className="flex">
        <IconButton
          tooltip={
            <Localized
              id={
                !canUseFineTuning
                  ? 'onboarding-manual_proportions-fine_tuning_button-disabled-tooltip'
                  : 'onboarding-manual_proportions-fine_tuning_button'
              }
            >
              <Typography variant="standard" />
            </Localized>
          }
          disabled={!canUseFineTuning}
          icon={<HumanIcon width={18} />}
          onClick={() =>
            nav('/onboarding/body-proportions/auto', {
              state: { alonePage: state.alonePage },
            })
          }
          label="onboarding-manual_proportions-fine_tuning_button"
          shortLabel="onboarding-manual_proportions-fine_tuning_button-short"
        />
      </div>
      <div className="flex flex-grow" />
      <ImportExportButtons />
      <ProportionsResetModal
        accept={() => {
          resetAll();
          setShowWarning(false);
        }}
        onClose={() => setShowWarning(false)}
        isOpen={showWarning}
      />
    </div>
  );
}

export function ManualProportionsPage() {
  const { applyProgress, state } = useOnboarding();
  const { useRPCPacket } = useWebsocketAPI();
  const { currentLocales } = useLocaleConfig();

  const [userHeight, setUserHeight] = useState(0);

  applyProgress(0.9);

  const savedValue = useMemo(() => localStorage.getItem('ratioMode'), []);

  const defaultValues = { precise: false, ratio: savedValue !== 'false' };

  const { control, watch } = useForm<{ precise: boolean; ratio: boolean }>({
    defaultValues,
  });
  const { precise, ratio } = watch();

  const { cmFormat } = useMemo(() => {
    const cmFormat = Intl.NumberFormat(currentLocales, {
      style: 'unit',
      unit: 'centimeter',
      maximumFractionDigits: 1,
    });
    return { cmFormat };
  }, [currentLocales]);

  // The row under the pointer or focus lights its bones in this page's preview only. Kept in refs, not state, so a
  // hover never re-renders the page, and re-applied if the preview is created after the hover started.
  const previewRef = useRef<PreviewContext | null>(null);
  const [isFraming, setIsFraming] = useState(true);
  const [isOrbiting, setIsOrbiting] = useState(false);
  // A bone clicked in this page's preview jumps to its setting. Only this page turns picking on.
  const [pick, setPick] = useState<BonePick | null>(null);
  const highlightRef = useRef<Parameters<OnHighlight>[0]>(null);
  const onHighlight = useCallback<OnHighlight>((parts) => {
    highlightRef.current = parts;
    previewRef.current?.setHighlight(parts);
  }, []);
  useEffect(
    () => () => {
      previewRef.current = null;
    },
    []
  );

  useEffect(() => {
    localStorage.setItem('ratioMode', ratio?.toString() ?? 'true');
  }, [ratio]);

  useRPCPacket(
    RpcMessage.SkeletonConfigResponse,
    (data: SkeletonConfigResponseT) => {
      if (data.userHeight) setUserHeight(data.userHeight);
    }
  );

  // Stacked (narrow) layout only: a draggable divider between the preview and the controls. The preferred preview
  // height is kept as-is; the height actually used is re-clamped to the current stack height, so a small window never
  // overwrites the preference. During a drag the CSS variable is written directly (no page re-render per move) and
  // the preference is committed once on release.
  const { l10n } = useLocalization();
  const stackRef = useRef<HTMLDivElement>(null);
  const previewPaneRef = useRef<HTMLDivElement>(null);
  const [stackHeight, setStackHeight] = useState(0);
  const [previewPref, setPreviewPref] = useState(readPreviewPref);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    startY: number;
    startHeight: number;
    height: number;
  } | null>(null);

  useLayoutEffect(() => {
    const el = stackRef.current;
    if (!el) return;
    const measure = () => {
      const style = getComputedStyle(el);
      setStackHeight(
        el.clientHeight -
          parseFloat(style.paddingTop) -
          parseFloat(style.paddingBottom)
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const measured = stackHeight > 0;
  const previewHeight = measured
    ? clampPreview(previewPref ?? defaultPreview(stackHeight), stackHeight)
    : undefined;
  const bounds = splitBounds(stackHeight);

  const commitPreview = (height: number | null) => {
    setPreviewPref(height);
    writePreviewPref(height);
  };
  const endDrag = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setDragging(false);
    commitPreview(d.height);
  };
  const onHandlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (
      !measured ||
      previewHeight === undefined ||
      (e.pointerType === 'mouse' && e.button !== 0)
    )
      return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      startY: e.clientY,
      startHeight: previewHeight,
      height: previewHeight,
    };
    setDragging(true);
  };
  const onHandlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    d.height = clampPreview(d.startHeight + e.clientY - d.startY, stackHeight);
    previewPaneRef.current?.style.setProperty('--preview-h', `${d.height}px`);
  };
  const onHandleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (previewHeight === undefined) return;
    const next = keyboardPreview(e.key, e.shiftKey, previewHeight, stackHeight);
    if (next === null) return;
    e.preventDefault();
    if (next !== previewHeight) commitPreview(next);
  };

  return (
    <>
      {/* Narrow windows stack the live preview above the controls; sm and up put it beside them. The preview keeps
          a bounded share of the height and the controls scroll on their own, so the skeleton is never covered. */}
      <div
        ref={stackRef}
        className="flex flex-col sm:flex-row-reverse w-full h-full gap-0 sm:gap-2 bg-background-70 p-2"
      >
        <div
          ref={previewPaneRef}
          style={
            previewHeight !== undefined
              ? ({ '--preview-h': `${previewHeight}px` } as React.CSSProperties)
              : undefined
          }
          className="shrink-0 h-[var(--preview-h,35%)] sm:h-auto sm:min-h-0 sm:w-2/5 sm:max-w-xl rounded-md overflow-clip bg-background-60 relative"
        >
          <div className="absolute inset-0">
            <SkeletonVisualizerWidget
              onInit={(context) => {
                previewRef.current = context;
                context.setHighlight(highlightRef.current);
                context.setBonePick((part) =>
                  setPick((prev) => ({ part, n: (prev?.n ?? 0) + 1 }))
                );
                context.addView({
                  left: 0,
                  bottom: 0,
                  width: 1,
                  height: 1,
                  position: new Vector3(3, 2.5, -3),
                  onHeightChange(v, newHeight) {
                    // retouch the target and scale settings so the height element doesnt hide the head
                    v.controls.target.set(0, newHeight / 1.7, 0);
                    const scale = Math.max(1, newHeight) / 1.2;
                    v.camera.zoom = 1 / scale;
                  },
                });
                // After addView, so the new view picks up the saved toggles.
                context.toggleAutoFrame(isFraming);
                context.toggleAutoOrbit(isOrbiting);
              }}
            />
          </div>

          <div className="top-2 sm:top-4 w-full px-2 sm:px-4 absolute flex gap-2 flex-row flex-wrap">
            <div className="h-10 sm:h-14 flex items-center">
              <ResetButton
                type={ResetType.Full}
                className="h-full px-4 bg-background-50 hover:bg-background-40 text-background-10"
              />
            </div>
            <Tooltip
              preferedDirection="bottom"
              content={
                <Localized id="onboarding-manual_proportions-estimated_height">
                  <Typography />
                </Localized>
              }
            >
              <div className="h-10 sm:h-14 bg-background-50 px-4 sm:p-4 flex items-center rounded-lg min-w-36 justify-center">
                <Typography variant="main-title" whitespace="whitespace-nowrap">
                  {cmFormat.format((userHeight * 100) / 0.936)}
                </Typography>
              </div>
            </Tooltip>
          </div>

          <div className="absolute bottom-2 right-2 flex gap-2">
            <button
              type="button"
              aria-pressed={isOrbiting}
              title={l10n.getString(
                isOrbiting ? 'preview-auto_orbit_stop' : 'preview-auto_orbit'
              )}
              className={classNames(
                'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-ui-2xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-background-20',
                isOrbiting
                  ? 'bg-accent-background-20/20 text-accent-background-10'
                  : 'bg-background-50 hover:bg-background-40 text-background-10'
              )}
              onClick={() => {
                if (previewRef.current)
                  setIsOrbiting(previewRef.current.toggleAutoOrbit());
              }}
            >
              <div
                className={classNames('flex items-center justify-center', {
                  'animate-[spin_4s_linear_infinite]': isOrbiting,
                })}
              >
                <Rotate360Icon width={16} />
              </div>
              <span>
                {l10n.getString(
                  isOrbiting ? 'preview-auto_orbit_stop' : 'preview-auto_orbit'
                )}
              </span>
            </button>
            <button
              type="button"
              aria-pressed={isFraming}
              title={
                isFraming
                  ? 'Auto-frame is on: the camera follows the whole body. Scroll to zoom.'
                  : 'Auto-frame: keep the whole body in view'
              }
              className={classNames(
                'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-ui-2xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-background-20',
                isFraming
                  ? 'bg-accent-background-20/20 text-accent-background-10'
                  : 'bg-background-50 hover:bg-background-40 text-background-10'
              )}
              onClick={() => {
                if (previewRef.current)
                  setIsFraming(previewRef.current.toggleAutoFrame());
              }}
            >
              <AutoFrameIcon width={16} />
              <span>Auto-frame</span>
            </button>
          </div>
        </div>
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label={l10n.getString(
            'onboarding-manual_proportions-resize_preview'
          )}
          aria-valuemin={bounds.min}
          aria-valuemax={bounds.max}
          aria-valuenow={previewHeight}
          tabIndex={0}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
          onKeyDown={onHandleKeyDown}
          onDoubleClick={() => commitPreview(null)}
          className="sm:hidden group shrink-0 h-3 flex items-center justify-center cursor-row-resize touch-none outline-none"
        >
          <div
            className={classNames(
              'h-1 w-12 rounded-full transition-colors group-hover:bg-background-30 group-focus-visible:bg-accent-background-30',
              dragging ? 'bg-accent-background-30' : 'bg-background-40'
            )}
          />
        </div>
        <div className="flex flex-col flex-1 min-h-0 min-w-0 gap-2 overflow-y-auto">
          <div className="flex gap-2">
            <Localized id="onboarding-manual_proportions-back-scaled">
              <ArrowLink
                direction="left"
                to="/onboarding/body-proportions/scaled"
                state={{ alonePage: state.alonePage }}
              >
                LINK
              </ArrowLink>
            </Localized>
          </div>
          <ButtonsControl control={control} />
          <div className="bg-background-60 rounded-md shrink-0">
            <BodyProportions
              precise={precise ?? defaultValues.precise}
              type={ratio ? 'ratio' : 'linear'}
              variant={state.alonePage ? 'alone' : 'onboarding'}
              onHighlight={onHighlight}
              pick={pick}
            />
          </div>
        </div>
      </div>
    </>
  );
}
