import { useAtom, useStore } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { useMemo, useCallback, useRef } from 'react';
import { useWebsocketAPI } from './websocket-api';
import { bonesAtom } from '@/store/app-store';
import {
  RpcMessage,
  LegTweaksSettingsT,
  ChangeSettingsRequestT,
  ModelSettingsT,
  SettingsRequestT,
  SettingsResponseT,
  SkeletonHeightT,
  BodyPart,
  VRCOSCSettingsT,
  OSCSettingsT,
} from 'solarxr-protocol';

export type OperatingMode = 'quest_standalone' | 'pcvr';

export type TrackingProfileName = 'STANDING' | 'CROUCHING' | 'SITTING' | 'CUSTOM';

export type RecenterBehaviorMode =
  | 'KEEP_FLOOR'
  | 'REANCHOR_ON_RECENTER'
  | 'REANCHOR_ON_FULL_RESET';

export type AnchorStatus = 'CALIBRATED' | 'LOCKED' | 'FLOATING' | 'STALE';

export interface QuestStandaloneState {
  isAnchored: boolean;
  floorOffset: number; // in meters
  correctionStrength: number; // 0.0 to 1.0
  footPlantStrength: number;
  skatingCorrectionStrength: number;
  crouchCompensation: boolean;
  crouchStrength: number;
  hmdVerticalOffset: number; // in meters
  oscRate: number; // 30, 50, 60, 90 Hz
  chatboxEnabled: boolean;
  chatboxOnlyMode: boolean;
  chatboxCustomPinnedEnabled: boolean;
  chatboxCustomPinnedText: string;
  chatboxAppleMusicEnabled: boolean;
  recenterBehavior: RecenterBehaviorMode;
  activeProfile: TrackingProfileName;
  lastCalibrated: number | null;
  anchorStatus: AnchorStatus;
}

export const operatingModeAtom = atomWithStorage<OperatingMode>(
  'slimevr_operating_mode',
  'quest_standalone'
);

export const questStandaloneStateAtom = atomWithStorage<QuestStandaloneState>(
  'slimevr_quest_standalone_state_v2',
  {
    isAnchored: true,
    floorOffset: 0.0,
    correctionStrength: 0.5,
    footPlantStrength: 0.5,
    skatingCorrectionStrength: 0.5,
    crouchCompensation: true,
    crouchStrength: 0.5,
    hmdVerticalOffset: 0.0,
    oscRate: 60,
    chatboxEnabled: true,
    chatboxOnlyMode: false,
    chatboxCustomPinnedEnabled: false,
    chatboxCustomPinnedText: '',
    chatboxAppleMusicEnabled: false,
    recenterBehavior: 'REANCHOR_ON_FULL_RESET',
    activeProfile: 'STANDING',
    lastCalibrated: null,
    anchorStatus: 'LOCKED',
  }
);

type ToggleChanges = {
  floorClip?: boolean;
  footPlant?: boolean;
  skatingCorrection?: boolean;
};

export function useOperatingMode() {
  const [mode, setMode] = useAtom(operatingModeAtom);
  const [state, setState] = useAtom(questStandaloneStateAtom);
  const { sendRPCPacket, useRPCPacket } = useWebsocketAPI();
  // Read bones on demand. Subscribing here would re-render every consumer of
  // this hook on each bone update (~30 Hz) although bones are only needed
  // when the floor is calibrated.
  const store = useStore();

  const isQuestStandalone = useMemo(() => mode === 'quest_standalone', [mode]);
  const isPCVR = useMemo(() => mode === 'pcvr', [mode]);

  const toggleMode = () => {
    const nextMode: OperatingMode =
      mode === 'quest_standalone' ? 'pcvr' : 'quest_standalone';
    setMode(nextMode);

    const settingsRequest = new ChangeSettingsRequestT();
    const vrcOsc = new VRCOSCSettingsT();
    const oscSettings = new OSCSettingsT();
    oscSettings.enabled = nextMode === 'quest_standalone';
    vrcOsc.oscSettings = oscSettings;
    vrcOsc.oscqueryEnabled = true;
    settingsRequest.vrcOsc = vrcOsc;
    sendRPCPacket(RpcMessage.ChangeSettingsRequest, settingsRequest);
  };

  // The server replaces every model toggle named in a request and treats the
  // ones left out as off. To change one toggle, read the server's current set
  // and send it back with only that toggle altered.
  const pendingToggles = useRef<ToggleChanges | null>(null);
  useRPCPacket(RpcMessage.SettingsResponse, (settings: SettingsResponseT) => {
    const changes = pendingToggles.current;
    if (!changes) return;
    pendingToggles.current = null;
    const toggles = settings.modelSettings?.toggles;
    if (!toggles) return;

    Object.assign(toggles, changes);
    const modelSettings = new ModelSettingsT();
    modelSettings.toggles = toggles;
    const settingsRequest = new ChangeSettingsRequestT();
    settingsRequest.modelSettings = modelSettings;
    sendRPCPacket(RpcMessage.ChangeSettingsRequest, settingsRequest);
  });

  /** Sends only the settings named in `updates`; everything else is left alone. */
  const syncToServer = (updates: Partial<QuestStandaloneState>) => {
    const toggleChanges: ToggleChanges = {};
    if (updates.isAnchored !== undefined) {
      toggleChanges.floorClip = updates.isAnchored;
    }
    if (updates.footPlantStrength !== undefined) {
      toggleChanges.footPlant = updates.footPlantStrength > 0.05;
    }
    if (updates.skatingCorrectionStrength !== undefined) {
      toggleChanges.skatingCorrection = updates.skatingCorrectionStrength > 0.05;
    }
    if (Object.keys(toggleChanges).length > 0) {
      pendingToggles.current = { ...pendingToggles.current, ...toggleChanges };
      sendRPCPacket(RpcMessage.SettingsRequest, new SettingsRequestT());
    }

    const modelSettings = new ModelSettingsT();
    let hasModelSettings = false;

    if (updates.correctionStrength !== undefined) {
      const legTweaks = new LegTweaksSettingsT();
      legTweaks.correctionStrength = updates.correctionStrength;
      modelSettings.legTweaks = legTweaks;
      hasModelSettings = true;
    }

    if (
      updates.floorOffset !== undefined ||
      updates.oscRate !== undefined ||
      updates.chatboxEnabled !== undefined ||
      updates.chatboxOnlyMode !== undefined
    ) {
      const skeletonHeight = new SkeletonHeightT();
      // The server applies the floor height from every such message, so it
      // always has to carry the current value.
      skeletonHeight.floorHeight = updates.floorOffset ?? state.floorOffset;
      if (updates.oscRate !== undefined) skeletonHeight.oscRate = updates.oscRate;
      if (updates.chatboxEnabled !== undefined) {
        skeletonHeight.chatboxEnabled = updates.chatboxEnabled;
      }
      if (updates.chatboxOnlyMode !== undefined) {
        skeletonHeight.chatboxOnly = updates.chatboxOnlyMode;
      }
      modelSettings.skeletonHeight = skeletonHeight;
      hasModelSettings = true;
    }

    if (!hasModelSettings) return;
    const settingsRequest = new ChangeSettingsRequestT();
    settingsRequest.modelSettings = modelSettings;
    sendRPCPacket(RpcMessage.ChangeSettingsRequest, settingsRequest);
  };

  const triggerChatboxStatus = useCallback(() => {
    const settingsRequest = new ChangeSettingsRequestT();
    const modelSettings = new ModelSettingsT();
    const skeletonHeight = new SkeletonHeightT();
    skeletonHeight.floorHeight = state.floorOffset;
    skeletonHeight.oscRate = state.oscRate;
    skeletonHeight.chatboxEnabled = state.chatboxEnabled;
    skeletonHeight.chatboxTrigger = true;
    modelSettings.skeletonHeight = skeletonHeight;
    settingsRequest.modelSettings = modelSettings;
    sendRPCPacket(RpcMessage.ChangeSettingsRequest, settingsRequest);
  }, [sendRPCPacket, state.floorOffset, state.oscRate, state.chatboxEnabled]);

  const sendChatboxCustomMessage = useCallback(
    (message: string) => {
      if (!message || !message.trim()) return;
      const settingsRequest = new ChangeSettingsRequestT();
      const modelSettings = new ModelSettingsT();
      const skeletonHeight = new SkeletonHeightT();
      skeletonHeight.floorHeight = state.floorOffset;
      skeletonHeight.oscRate = state.oscRate;
      skeletonHeight.chatboxEnabled = state.chatboxEnabled;
      skeletonHeight.chatboxMessage = message.trim();
      modelSettings.skeletonHeight = skeletonHeight;
      settingsRequest.modelSettings = modelSettings;
      sendRPCPacket(RpcMessage.ChangeSettingsRequest, settingsRequest);
    },
    [sendRPCPacket, state.floorOffset, state.oscRate, state.chatboxEnabled]
  );

  const toggleFloorAnchor = () => {
    const nextState = !state.isAnchored;
    const nextStatus: AnchorStatus = nextState ? 'LOCKED' : 'FLOATING';

    syncToServer({ isAnchored: nextState, anchorStatus: nextStatus });
    setState((prev) => ({
      ...prev,
      isAnchored: nextState,
      anchorStatus: nextStatus,
      lastCalibrated: Date.now(),
    }));
  };

  const setFloorHeight = (heightMeters: number) => {
    const clamped = Math.max(-3.0, Math.min(3.0, heightMeters));
    syncToServer({ floorOffset: clamped });
    setState((prev) => ({
      ...prev,
      floorOffset: clamped,
      anchorStatus: prev.isAnchored ? 'CALIBRATED' : 'FLOATING',
      lastCalibrated: Date.now(),
    }));
  };

  const adjustFloorHeight = (deltaCm: number) => {
    const newOffset = state.floorOffset + deltaCm / 100;
    setFloorHeight(newOffset);
  };

  const triggerFloorCalibration = () => {
    let calculatedOffset = 0;
    const bones = store.get(bonesAtom);
    const leftFoot = bones.find(
      (b) => b.bodyPart === BodyPart.LEFT_FOOT || b.bodyPart === BodyPart.LEFT_LOWER_LEG
    );
    const rightFoot = bones.find(
      (b) =>
        b.bodyPart === BodyPart.RIGHT_FOOT || b.bodyPart === BodyPart.RIGHT_LOWER_LEG
    );

    if (
      leftFoot?.headPositionG?.y !== undefined &&
      rightFoot?.headPositionG?.y !== undefined
    ) {
      calculatedOffset = Math.min(leftFoot.headPositionG.y, rightFoot.headPositionG.y);
    }

    syncToServer({
      isAnchored: true,
      floorOffset: Math.max(0, calculatedOffset),
      anchorStatus: 'CALIBRATED',
    });

    setState((prev) => ({
      ...prev,
      isAnchored: true,
      floorOffset: Math.max(0, calculatedOffset),
      anchorStatus: 'CALIBRATED',
      lastCalibrated: Date.now(),
    }));
  };

  const setCorrectionStrength = (val: number) => {
    const clamped = Math.max(0, Math.min(1, val));
    syncToServer({ correctionStrength: clamped });
    setState((prev) => ({ ...prev, correctionStrength: clamped }));
  };

  const setFootPlantStrength = (val: number) => {
    const clamped = Math.max(0, Math.min(1, val));
    syncToServer({ footPlantStrength: clamped });
    setState((prev) => ({ ...prev, footPlantStrength: clamped }));
  };

  const setSkatingCorrectionStrength = (val: number) => {
    const clamped = Math.max(0, Math.min(1, val));
    syncToServer({ skatingCorrectionStrength: clamped });
    setState((prev) => ({ ...prev, skatingCorrectionStrength: clamped }));
  };

  const setCrouchCompensation = (val: boolean) => {
    setState((prev) => ({ ...prev, crouchCompensation: val }));
  };

  const setHmdVerticalOffset = (valMeters: number) => {
    setState((prev) => ({ ...prev, hmdVerticalOffset: valMeters }));
  };

  const setOscRate = (rate: number) => {
    setState((prev) => ({ ...prev, oscRate: rate }));
    syncToServer({ oscRate: rate });
  };

  const setRecenterBehavior = (mode: RecenterBehaviorMode) => {
    setState((prev) => ({ ...prev, recenterBehavior: mode }));
  };

  const selectProfile = (profile: TrackingProfileName) => {
    let profileSettings: Partial<QuestStandaloneState> = {
      activeProfile: profile,
    };

    if (profile === 'STANDING') {
      profileSettings = {
        activeProfile: 'STANDING',
        isAnchored: true,
        correctionStrength: 0.5,
        footPlantStrength: 0.5,
        skatingCorrectionStrength: 0.5,
        crouchCompensation: true,
        anchorStatus: 'LOCKED',
      };
    } else if (profile === 'CROUCHING') {
      profileSettings = {
        activeProfile: 'CROUCHING',
        isAnchored: true,
        correctionStrength: 0.7,
        footPlantStrength: 0.7,
        skatingCorrectionStrength: 0.3,
        crouchCompensation: true,
        anchorStatus: 'LOCKED',
      };
    } else if (profile === 'SITTING') {
      profileSettings = {
        activeProfile: 'SITTING',
        isAnchored: false,
        correctionStrength: 0.2,
        footPlantStrength: 0.0,
        skatingCorrectionStrength: 0.0,
        crouchCompensation: false,
        anchorStatus: 'FLOATING',
      };
    }

    syncToServer(profileSettings);
    setState((prev) => ({ ...prev, ...profileSettings }));
  };

  const setChatboxEnabled = (val: boolean) => {
    setState((prev) => ({ ...prev, chatboxEnabled: val }));
    syncToServer({ chatboxEnabled: val });
  };

  const setChatboxOnlyMode = (val: boolean) => {
    setState((prev) => ({ ...prev, chatboxOnlyMode: val }));
    syncToServer({ chatboxOnlyMode: val });
  };

  const setChatboxCustomPinnedEnabled = (val: boolean) => {
    setState((prev) => ({ ...prev, chatboxCustomPinnedEnabled: val }));
  };

  const setChatboxCustomPinnedText = (text: string) => {
    setState((prev) => ({ ...prev, chatboxCustomPinnedText: text }));
  };

  const setChatboxAppleMusicEnabled = (val: boolean) => {
    setState((prev) => ({ ...prev, chatboxAppleMusicEnabled: val }));
  };

  const resetToDefaults = () => {
    selectProfile('STANDING');
  };

  return {
    mode,
    isQuestStandalone,
    isPCVR,
    toggleMode,
    floorAnchor: state,
    toggleFloorAnchor,
    triggerFloorCalibration,
    adjustFloorHeight,
    setFloorHeight,
    setCorrectionStrength,
    setFootPlantStrength,
    setSkatingCorrectionStrength,
    setCrouchCompensation,
    setHmdVerticalOffset,
    setOscRate,
    setChatboxEnabled,
    setChatboxOnlyMode,
    setChatboxCustomPinnedEnabled,
    setChatboxCustomPinnedText,
    setChatboxAppleMusicEnabled,
    triggerChatboxStatus,
    sendChatboxCustomMessage,
    setRecenterBehavior,
    selectProfile,
    resetToDefaults,
  };
}
