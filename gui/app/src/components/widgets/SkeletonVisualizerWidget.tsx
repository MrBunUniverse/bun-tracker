import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import {
  BoneKind,
  createChildren,
  BasedSkeletonHelper,
} from '@/utils/skeletonHelper';
import {
  Bone,
  Box3,
  GridHelper,
  Group,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Scene,
  Spherical,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import {
  BodyPart,
  BoneT,
  ResetResponseT,
  ResetStatus,
  RpcMessage,
} from 'solarxr-protocol';
import { QuaternionFromQuatT, isIdentity } from '@/maths/quaternion';
import classNames from 'classnames';
import { useLocalization } from '@fluent/react';
import { ErrorBoundary } from 'react-error-boundary';
import { Typography } from '@/components/commons/Typography';
import { useStore } from 'jotai';
import { bonesAtom, bonesFeedCountAtom } from '@/store/app-store';
import { useFeedDemand } from '@/hooks/feed-demand';
import { useConfig } from '@/hooks/config';
import { useWebsocketAPI } from '@/hooks/websocket-api';
import { Tween } from '@tweenjs/tween.js';
import { createCanvasResizer } from '@/utils/canvas-resize';
import { wheelZoomFactor } from '@/utils/wheel-zoom';
import { BoneHighlight } from '@/utils/proportion-highlight';
import { EyeIcon } from '@/components/commons/icon/EyeIcon';

const GROUND_COLOR = '#2F5F86';
const GROUND_CENTER_COLOR = '#477CA2';
const MAX_RENDER_PIXEL_RATIO = 1.25;

// Just need to know the length of the total body, so don't need right legs
const Y_PARTS = [
  BodyPart.NECK,
  BodyPart.UPPER_CHEST,
  BodyPart.CHEST,
  BodyPart.WAIST,
  BodyPart.HIP,
  BodyPart.LEFT_UPPER_LEG,
  BodyPart.LEFT_LOWER_LEG,
];

export type SkeletonPreviewView = {
  left: number;
  bottom: number;
  width: number;
  height: number;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  hidden: boolean;
  tween: Tween<Vector3>;
  onHeightChange: (view: SkeletonPreviewView, newHeight: number) => void;
};

function initializePreview(
  canvas: HTMLCanvasElement,
  skeleton: (BoneKind | Bone)[]
) {
  let lastRenderTimeRef = 0;
  let frameInterval = 0;

  const views: SkeletonPreviewView[] = [];

  const resolution = new Vector2(canvas.clientWidth, canvas.clientHeight);
  const scene = new Scene();
  let renderer: WebGLRenderer | null = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
    powerPreference: 'low-power',
    stencil: false,
    depth: true,
  });
  renderer.setPixelRatio(
    Math.min(
      typeof window !== 'undefined' ? window.devicePixelRatio : 1,
      MAX_RENDER_PIXEL_RATIO
    )
  );
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);

  let dirtyFrames = 20;
  let animationFrameId: number | null = null;
  let waitTimer: number | null = null;

  const scheduleAnimationFrame = () => {
    if (animationFrameId === null) {
      animationFrameId = requestAnimationFrame(animate);
    }
  };

  const markDirty = (frames = 3) => {
    dirtyFrames = Math.max(dirtyFrames, frames);
    scheduleAnimationFrame();
  };

  const grid = new GridHelper(10, 20, GROUND_CENTER_COLOR, GROUND_COLOR);
  grid.position.set(0, 0, 0);
  if (!Array.isArray(grid.material)) {
    grid.material.transparent = true;
    grid.material.opacity = 0.5;
  }
  scene.add(grid);

  const skeletonGroup = new Group();
  let skeletonHelper = new BasedSkeletonHelper(skeleton[0]);
  skeletonHelper.resolution.copy(resolution);
  skeletonGroup.add(skeletonHelper);

  scene.add(skeletonGroup);
  scene.add(skeleton[0]);

  // Bones to keep bright while the rest dim; null leaves the usual rainbow. Re-applied to every rebuilt helper.
  let highlight: BoneHighlight | null = null;
  const setHighlight = (next: BoneHighlight | null) => {
    if (!renderer || next === highlight) return;
    highlight = next;
    skeletonHelper.setHighlight(highlight);
    markDirty(3);
  };

  let heightOffset = 0;
  let skeletonOffset = 0;
  const updateSkeletonHeading = (bones: Map<BodyPart, BoneT>) => {
    const hmd = bones.get(BodyPart.HEAD);
    const chest =
      bones.get(BodyPart.UPPER_CHEST) ??
      bones.get(BodyPart.CHEST) ??
      bones.get(BodyPart.HIP);
    // Keep the preview's model-space heading in sync with reset/calibration
    // updates. Without this, the bones use the new heading while the group
    // keeps the heading captured when the skeleton was first created.
    const sourceRotation =
      hmd?.rotationG && !isIdentity(hmd.rotationG)
        ? hmd.rotationG
        : chest?.rotationG;
    if (!sourceRotation) return;

    const quat = QuaternionFromQuatT(sourceRotation).normalize();
    // Looking up or down (lying on the floor), the heading is undefined and the twist below swings wildly, which
    // spun the whole preview. Keep the last heading until the forward axis is level enough to read again.
    const forward = new Vector3(0, 0, 1).applyQuaternion(quat);
    if (Math.hypot(forward.x, forward.z) < 0.5) return;
    quat.invert();

    // Project the inverse rotation onto the world Y axis, matching the
    // original face-forward transform while avoiding pitch/roll in the group.
    const VEC_Y = new Vector3(0, 1, 0);
    const vec = VEC_Y.multiplyScalar(
      new Vector3(quat.x, quat.y, quat.z).dot(VEC_Y) / VEC_Y.lengthSq()
    );
    const yawReset = new Quaternion(vec.x, vec.y, vec.z, quat.w).normalize();

    skeletonGroup.rotation.setFromQuaternion(yawReset);
  };

  const rebuildSkeleton = (
    newSkeleton: (BoneKind | Bone)[],
    bones: Map<BodyPart, BoneT>
  ) => {
    markDirty(10);
    skeletonGroup.remove(skeletonHelper);
    skeletonHelper.dispose();
    scene.remove(skeleton[0]);

    skeleton = newSkeleton;

    skeletonHelper = new BasedSkeletonHelper(newSkeleton[0]);
    skeletonHelper.resolution.copy(resolution);
    skeletonHelper.setHighlight(highlight);
    skeletonGroup.add(skeletonHelper);
    scene.add(newSkeleton[0]);
    updateSkeletonHeading(bones);
  };

  const computeUserHeight = (bones: Map<BodyPart, BoneT>) => {
    const hmd = bones.get(BodyPart.HEAD);
    if (hmd?.headPositionG?.y && hmd.headPositionG.y > 0) {
      return hmd.headPositionG.y / 0.936;
    }
    const yLength = Y_PARTS.map((x) => bones.get(x));
    if (yLength.some((x) => x === undefined)) return 0;
    return (
      (yLength as BoneT[]).reduce((prev, cur) => prev + cur.boneLength, 0) /
      0.936
    );
  };

  const computeSkeletonOffset = (bones: Map<BodyPart, BoneT>) => {
    const hmd = bones.get(BodyPart.HEAD);
    // If I know the head position, don't use an offset
    if (hmd?.headPositionG?.y !== undefined && hmd.headPositionG?.y > 0) {
      return 0;
    }
    const yLength = Y_PARTS.map((x) => bones.get(x));
    if (yLength.some((x) => x === undefined)) return 0;
    return (yLength as BoneT[]).reduce((prev, cur) => prev + cur.boneLength, 0);
  };

  let autoOrbit = false;

  const setAutoOrbit = (enable?: boolean) => {
    autoOrbit = typeof enable === 'boolean' ? enable : !autoOrbit;
    views.forEach((v) => {
      v.controls.autoRotate = autoOrbit;
      // 1.0 gives a calm, smooth ~60-second 360-degree rotation
      v.controls.autoRotateSpeed = 1.0;
    });
    markDirty(10);
    return autoOrbit;
  };

  const isAutoOrbiting = () => autoOrbit;

  // Auto-frame: keep the whole skeleton in view while dancing, crouching or lying down.
  // The orbit target eases to the body's centre (the camera moves with it, so the user's
  // viewing angle stays) and the zoom eases so the body fits with a margin. While it's on,
  // it owns the zoom; the overlay's Auto-frame button turns it off.
  let autoFrame = true;
  const frameBox = new Box3();
  const frameSize = new Vector3();
  const frameTarget = new Vector3();
  const framePoint = new Vector3();
  const frameShift = new Vector3();
  // Close-up, with only a thin margin around the body.
  const FRAME_MARGIN = 1.1;
  const FRAME_PADDING = 0.08; // metres, so a swinging hand never touches the edge
  const MIN_FRAME_RADIUS = 0.5;
  // Standing: aim this share of the half-height above the body's centre (the hips), so the view
  // centres on the upper body, above the waist.
  const FRAME_LIFT = 0.25;
  // The narrowest panel shape the framing fits (width over height).
  const FRAME_MIN_ASPECT = 0.5;
  // Lying down: the body is long and flat, so the view turns to look straight down on it. It switches with
  // hysteresis on the raw size, so an arm moving near the line cannot flip the view back and forth.
  const LYING_ON = 0.5;
  const LYING_OFF = 0.8;
  let lying = false;
  // Spring times in seconds. The zoom opens fast so nothing is cut off and closes slowly, so
  // swinging limbs don't make it breathe in and out. The position glides slower still.
  const FRAME_MOVE_TIME = 1.2;
  const FRAME_OPEN_TIME = 0.6;
  const FRAME_CLOSE_TIME = 2.5;

  // Smoothed framing state: the camera follows these, never the raw (noisy) bounds.
  const frameCenter = new Vector3();
  const frameVelocity = new Vector3();
  let frameRadius = 1;
  let frameRadiusVelocity = 0;
  let frameReady = false;
  // Camera distance when framing began; the zoom is fitted at this distance.
  let frameBaseDistance = 1;
  // The wheel's zoom on top of the fit. The wheel changes the lens zoom, not the distance, so zooming in keeps the
  // mild perspective of the far camera instead of the fisheye look of moving it close.
  let frameUserZoom = 1;
  // Turning auto-frame back on glides from the user's current view instead of jumping.
  let frameGlide = false;
  // True while the framing is still moving; the loop then renders at display rate.
  let frameMoving = false;
  // Eye level: the camera sits level with the aim point, looking straight at the body, not
  // down on it like a drone. The turn left or right stays whatever the user chose.
  const FRAME_EYE_LEVEL_PHI = Math.PI / 2 - 0.04;
  // Looking straight down (the polar angle runs from the top, so near 0 is a top view).
  const FRAME_TOP_PHI = 0.06;
  const FRAME_PITCH_TIME = 0.8;
  const frameSpherical = new Spherical();
  const frameOffset = new Vector3();
  let framePitchVelocity = 0;
  // While the user turns the camera, auto-frame leaves the tilt to them: easing it back to eye level under their drag
  // made the camera jitter. Once they let go it waits this long, then eases back.
  const PITCH_RESUME_DELAY = 1200; // ms
  let userTurning = false;
  let userTurnEnd = 0;
  // The raw bounds jump with every bone packet and every swinging hand. They're low-passed over this many seconds
  // before the springs follow them, so the camera glides instead of twitching.
  const FRAME_FILTER_TIME = 0.8;
  const frameGoal = new Vector3();
  let radiusGoal = 1;

  // Critically damped spring: velocity stays continuous, so there is no stutter when the
  // target jumps. Returns the new value and updates `vel.v`.
  const smoothDamp = (
    current: number,
    target: number,
    vel: { v: number },
    smoothTime: number,
    dt: number
  ) => {
    const omega = 2 / Math.max(0.0001, smoothTime);
    const x = omega * dt;
    const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = current - target;
    const temp = (vel.v + omega * change) * dt;
    vel.v = (vel.v - omega * temp) * decay;
    let out = target + (change + temp) * decay;
    if (target - current > 0 === out > target) {
      out = target;
      vel.v = 0;
    }
    return out;
  };
  const springVel = { v: 0 };

  const frameView = (v: SkeletonPreviewView, aspect: number, rawDt: number) => {
    frameBox.makeEmpty();
    skeletonGroup.updateMatrixWorld();
    // The width the camera actually sees: spread along its horizontal right axis. The world box's
    // x/z extent also counts arms reaching toward the camera, which zoomed the view out in play.
    const rightX = v.camera.position.z - v.controls.target.z;
    const rightZ = v.controls.target.x - v.camera.position.x;
    const rightLength = Math.hypot(rightX, rightZ) || 1;
    let viewMin = Infinity;
    let viewMax = -Infinity;
    skeleton.forEach((bone) => {
      bone.getWorldPosition(framePoint);
      // The helper draws bones through the group's heading, so measure them the same way.
      framePoint.applyMatrix4(skeletonGroup.matrixWorld);
      frameBox.expandByPoint(framePoint);
      const across =
        (framePoint.x * rightX + framePoint.z * rightZ) / rightLength;
      viewMin = Math.min(viewMin, across);
      viewMax = Math.max(viewMax, across);
    });
    if (frameBox.isEmpty()) {
      frameMoving = false;
      return;
    }
    // Up to the render loop's own 0.1 s cap, so the springs keep real time at the 30 fps used while a game has focus.
    const dt = Math.min(Math.max(rawDt, 0.001), 0.1);
    frameBox.getCenter(frameTarget);
    frameBox.getSize(frameSize);
    // Half-extents of the body: tall and narrow when standing, long and flat when lying.
    const halfHeight = Math.max(frameSize.y / 2, MIN_FRAME_RADIUS);
    const halfWide =
      Math.max(frameSize.x, frameSize.z, 2 * MIN_FRAME_RADIUS) / 2;
    const flatness = frameSize.y / Math.max(frameSize.x, frameSize.z, 1e-3);
    lying = flatness < (lying ? LYING_OFF : LYING_ON);
    // Fit the body's height when standing, and its length when lying. The width is the other
    // constraint: a narrow panel shows less of it, so that can push the zoom out.
    const major = lying ? halfWide : halfHeight;
    const needHeight = major * FRAME_MARGIN + FRAME_PADDING;
    // Lying uses the top view, where the world box is what shows; standing uses the camera's own width.
    const seenWide = lying
      ? halfWide
      : Math.max(viewMax - viewMin, 2 * MIN_FRAME_RADIUS) / 2;
    const needWidth = seenWide * FRAME_MARGIN + FRAME_PADDING;
    // A panel that is still opening is nearly zero wide, which would zoom the camera far out. Clamp the
    // shape the width can ask for; standing bodies are height-limited, so normal panels don't change.
    // Raising the aim leaves less room below it, so the zoom grows by the same amount and the feet stay in view.
    const lift = lying ? 0 : halfHeight * FRAME_LIFT;
    const wantRadius = Math.max(
      needHeight + lift,
      needWidth / Math.max(aspect, FRAME_MIN_ASPECT)
    );
    frameTarget.y += lift;

    const tanHalf = Math.tan((v.camera.fov * Math.PI) / 360);
    // The first framing of a view jumps straight to the framed pose. Gliding in from the default view
    // took seconds to settle, so the skeleton looked unframed on open. Re-enabling glides from where the user left it.
    const firstFrame = !frameReady && !frameGlide;
    if (!frameReady) {
      frameBaseDistance = v.camera.position.distanceTo(v.controls.target);
      frameGoal.copy(frameTarget);
      radiusGoal = wantRadius;
      frameVelocity.set(0, 0, 0);
      frameRadiusVelocity = 0;
      framePitchVelocity = 0;
      if (frameGlide) {
        // Start the springs at the current view: same aim, same visible half-height.
        frameCenter.copy(v.controls.target);
        frameRadius = (frameBaseDistance * tanHalf) / v.camera.zoom;
      } else {
        frameCenter.copy(frameTarget);
        frameRadius = wantRadius;
      }
      frameGlide = false;
      frameUserZoom = 1;
      frameReady = true;
    }
    const filter = 1 - Math.exp(-dt / FRAME_FILTER_TIME);
    frameGoal.lerp(frameTarget, filter);
    radiusGoal += (wantRadius - radiusGoal) * filter;

    springVel.v = frameVelocity.x;
    frameCenter.x = smoothDamp(
      frameCenter.x,
      frameGoal.x,
      springVel,
      FRAME_MOVE_TIME,
      dt
    );
    frameVelocity.x = springVel.v;
    springVel.v = frameVelocity.y;
    frameCenter.y = smoothDamp(
      frameCenter.y,
      frameGoal.y,
      springVel,
      FRAME_MOVE_TIME,
      dt
    );
    frameVelocity.y = springVel.v;
    springVel.v = frameVelocity.z;
    frameCenter.z = smoothDamp(
      frameCenter.z,
      frameGoal.z,
      springVel,
      FRAME_MOVE_TIME,
      dt
    );
    frameVelocity.z = springVel.v;

    springVel.v = frameRadiusVelocity;
    frameRadius = smoothDamp(
      frameRadius,
      radiusGoal,
      springVel,
      radiusGoal > frameRadius ? FRAME_OPEN_TIME : FRAME_CLOSE_TIME,
      dt
    );
    frameRadiusVelocity = springVel.v;

    // Move the orbit target to the smoothed centre; the camera keeps its angle and distance.
    frameShift.subVectors(frameCenter, v.controls.target);
    v.controls.target.add(frameShift);
    v.camera.position.add(frameShift);

    // Ease the camera to eye level (or straight down when lying), keeping its distance and heading.
    frameOffset.subVectors(v.camera.position, v.controls.target);
    frameSpherical.setFromVector3(frameOffset);
    const goalPhi = lying ? FRAME_TOP_PHI : FRAME_EYE_LEVEL_PHI;
    const holdPitch =
      !firstFrame &&
      (userTurning || performance.now() - userTurnEnd < PITCH_RESUME_DELAY);
    if (holdPitch) framePitchVelocity = 0;
    springVel.v = framePitchVelocity;
    const phi = firstFrame
      ? goalPhi
      : holdPitch
        ? frameSpherical.phi
        : smoothDamp(
            frameSpherical.phi,
            goalPhi,
            springVel,
            FRAME_PITCH_TIME,
            dt
          );
    framePitchVelocity = springVel.v;
    // After the user lets go, keep drawing through the wait so the tilt can ease back.
    const pitchMoving =
      (holdPitch && !userTurning) || Math.abs(phi - frameSpherical.phi) > 1e-5;
    frameSpherical.phi = phi;
    frameOffset.setFromSpherical(frameSpherical);
    v.camera.position.copy(v.controls.target).add(frameOffset);

    // frameRadius is the half-height in view at the base distance.
    v.camera.zoom =
      ((frameBaseDistance * tanHalf) / frameRadius) * frameUserZoom;

    // Keep drawing until the camera settles.
    frameMoving =
      pitchMoving ||
      frameVelocity.lengthSq() > 1e-6 ||
      Math.abs(frameRadiusVelocity) > 1e-3 ||
      Math.abs(wantRadius - frameRadius) > 1e-3 ||
      frameCenter.distanceToSquared(frameTarget) > 1e-6;
    if (frameMoving) markDirty(2);
  };

  const setAutoFrame = (enable?: boolean) => {
    autoFrame = typeof enable === 'boolean' ? enable : !autoFrame;
    // A view that was framed before glides back; the very first framing still jumps into place.
    if (autoFrame) {
      frameGlide = frameReady;
      frameReady = false;
    }
    markDirty(10);
    return autoFrame;
  };

  // `advance: false` only redraws the current pose (controls, framing springs and tweens stay put); used right after
  // a resize cleared the buffer.
  const render = (deltaSeconds?: number, advance = true) => {
    views.forEach((v) => {
      if (v.hidden || !renderer) return;
      // Pass delta in seconds if available so OrbitControls updates smoothly and predictably
      if (advance) {
        if (typeof deltaSeconds === 'number' && deltaSeconds > 0) {
          v.controls.update(deltaSeconds);
        } else {
          v.controls.update();
        }
      }

      const left = Math.floor(resolution.x * v.left);
      const bottom = Math.floor(resolution.y * v.bottom);
      const width = Math.floor(resolution.x * v.width);
      const height = Math.floor(resolution.y * v.height);
      if (width <= 0 || height <= 0) return;

      if (advance && autoFrame) {
        frameView(
          v,
          width / height,
          typeof deltaSeconds === 'number' && deltaSeconds > 0
            ? deltaSeconds
            : 0.016
        );
      }

      renderer.setViewport(left, bottom, width, height);
      renderer.setScissor(left, bottom, width, height);
      renderer.setScissorTest(true);

      if (advance) v.tween.update();

      v.camera.aspect = width / height;
      v.camera.updateProjectionMatrix();

      renderer.render(scene, v.camera);
    });
  };

  let previousFrameTime = 0;

  // Bones glide to each new pose instead of snapping to it, which reads as jitter between 40 Hz bone packets.
  // Frame-rate independent, so it eases the same at 60 fps and at the 30 fps used while the window is in the background.
  let bonesMoving = false;
  const easeBones = (deltaSeconds: number) => {
    const alpha = 1 - Math.exp(-deltaSeconds / BONE_SMOOTH_TIME);
    let moving = false;
    skeleton.forEach((bone) => {
      if (bone instanceof BoneKind && bone.ease(alpha)) moving = true;
    });
    bonesMoving = moving;
    if (moving) markDirty(2);
  };

  // setSize clears the canvas, so the new size is redrawn in the same task (before paint) rather than waiting for a
  // throttled frame; the extra dirty frames then let auto-frame settle on the new aspect.
  const resizeCanvas = createCanvasResizer(
    (width, height) => {
      resolution.set(width, height);
      skeletonHelper.resolution.copy(resolution);
      renderer?.setSize(width, height);
    },
    () => {
      render(0, false);
      markDirty(8);
    },
    { width: resolution.x, height: resolution.y }
  );
  const syncCanvasSize = () => {
    if (renderer) resizeCanvas(canvas.clientWidth, canvas.clientHeight);
  };

  function animate() {
    animationFrameId = null;

    if (autoOrbit) {
      markDirty(2);
    }

    const isHidden = typeof document !== 'undefined' && document.hidden;
    const isFocused =
      typeof document !== 'undefined' &&
      document.hasFocus &&
      document.hasFocus();

    // Throttle by attention: unfocused (e.g. while gaming) is the common background case, so it runs
    // at 30 fps there. 10 fps read as stutter on a second monitor during play.
    const adaptiveBaseInterval = isHidden
      ? 1000
      : !isFocused
        ? 33.3
        : autoOrbit
          ? 33.3
          : 16.6;
    // While bones or auto-frame are gliding, draw every display frame: the 30 fps cap made them stutter.
    // Still scenes, unfocused windows and hidden tabs keep the lighter rates.
    const smoothFrame =
      ((autoFrame && frameMoving) || bonesMoving) && isFocused && !isHidden;
    const effectiveInterval = smoothFrame
      ? SMOOTH_FRAME_INTERVAL
      : Math.max(adaptiveBaseInterval, autoOrbit ? 0 : frameInterval);

    const now = performance.now();
    const elapsed = now - lastRenderTimeRef;
    // A display frame lands a hair early about half the time; without slack that frame is skipped, so "60 fps" became
    // an uneven mix of 16 and 33 ms frames that read as jitter while moving.
    if (elapsed < effectiveInterval - FRAME_SLACK_MS) {
      // Wait out the frame interval with one timer instead of a rAF on every display frame.
      if (waitTimer === null) {
        waitTimer = window.setTimeout(() => {
          waitTimer = null;
          scheduleAnimationFrame();
        }, effectiveInterval - elapsed);
      }
      return;
    }
    if (dirtyFrames <= 0) {
      previousFrameTime = now;
      return;
    }
    dirtyFrames--;

    const deltaSeconds =
      previousFrameTime > 0
        ? Math.min((now - previousFrameTime) / 1000, 0.1)
        : 0.016;
    previousFrameTime = now;

    easeBones(deltaSeconds);
    render(deltaSeconds);
    lastRenderTimeRef = now - (elapsed % effectiveInterval);
    if (dirtyFrames > 0 || autoOrbit) scheduleAnimationFrame();
  }

  scheduleAnimationFrame();

  // Make sure orbit controls works only on the current view
  const handlePointerMove = (event: PointerEvent) => {
    const x = event.offsetX / resolution.x;
    const y = 1 - event.offsetY / resolution.y;
    views.forEach((v) => {
      if (
        x >= v.left &&
        x <= v.left + v.width &&
        y >= v.bottom &&
        y <= v.bottom + v.height
      ) {
        v.controls.enabled = true;
      } else {
        v.controls.enabled = false;
      }
    });
  };
  canvas.addEventListener('pointermove', handlePointerMove);
  // Wheel and trackpad pinch zoom the lens of the view under the pointer (see frameUserZoom).
  const handleWheel = (event: WheelEvent) => {
    const view = views.find((v) => v.controls.enabled && !v.hidden);
    if (!view) return;
    event.preventDefault();
    const factor = wheelZoomFactor(
      event.deltaY,
      event.deltaMode,
      (event as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY,
      event.ctrlKey
    );
    if (autoFrame) {
      frameUserZoom = Math.min(Math.max(frameUserZoom * factor, 0.3), 8);
    } else {
      view.camera.zoom = Math.min(
        Math.max(view.camera.zoom * factor, 0.05),
        20
      );
    }
    markDirty(4);
  };
  canvas.addEventListener('wheel', handleWheel, { passive: false });

  // Bone picking, on only for previews that set a handler (Manual Proportions). A click is a press and release
  // that barely moved, so turning the camera never picks.
  let onBonePick: ((part: BodyPart) => void) | null = null;
  const raycaster = new Raycaster();
  // Pixels of slack around the 4 px lines, so thin bones are easy to hit.
  (raycaster.params as { Line2?: { threshold: number } }).Line2 = {
    threshold: 8,
  };
  const pickNdc = new Vector2();
  const partAt = (event: PointerEvent): BodyPart | null => {
    const x = event.offsetX / resolution.x;
    const y = 1 - event.offsetY / resolution.y;
    const view = views.find(
      (v) =>
        !v.hidden &&
        x >= v.left &&
        x <= v.left + v.width &&
        y >= v.bottom &&
        y <= v.bottom + v.height
    );
    if (!view) return null;
    pickNdc.set(
      ((x - view.left) / view.width) * 2 - 1,
      ((y - view.bottom) / view.height) * 2 - 1
    );
    raycaster.setFromCamera(pickNdc, view.camera);
    for (const hit of raycaster.intersectObject(skeletonHelper, false)) {
      const part = skeletonHelper.ownerAt(hit.faceIndex ?? -1);
      if (part !== null) return part;
    }
    return null;
  };
  let pressX = 0;
  let pressY = 0;
  const handlePickDown = (event: PointerEvent) => {
    pressX = event.clientX;
    pressY = event.clientY;
  };
  const handlePickUp = (event: PointerEvent) => {
    if (!onBonePick || event.button !== 0) return;
    if (Math.hypot(event.clientX - pressX, event.clientY - pressY) > 4) return;
    const part = partAt(event);
    if (part !== null) onBonePick(part);
  };
  const handlePickHover = (event: PointerEvent) => {
    if (!onBonePick || event.buttons !== 0) return;
    canvas.style.cursor = partAt(event) !== null ? 'pointer' : '';
  };
  canvas.addEventListener('pointerdown', handlePickDown);
  canvas.addEventListener('pointerup', handlePickUp);
  canvas.addEventListener('pointermove', handlePickHover);
  const setBonePick = (handler: ((part: BodyPart) => void) | null) => {
    onBonePick = handler;
    if (!handler) canvas.style.cursor = '';
  };
  // ResizeObserver can miss the final frame of the drawer width transition, so check the size once it
  // ends; reopening a zero-width preview then always restores rendering.
  document.addEventListener('transitionend', syncCanvasSize);

  return {
    resize: (width: number, height: number) => {
      if (renderer) resizeCanvas(width, height);
    },
    setFrameInterval: (interval: number) => {
      frameInterval = interval;
      markDirty(5);
    },
    rebuildSkeleton,
    setHighlight,
    setBonePick,
    // Re-centering on every update would cancel the user's own turning, so
    // the heading is only re-synced on rebuild and after a reset.
    syncHeading: updateSkeletonHeading,
    updatesBones: (bones: Map<BodyPart, BoneT>) => {
      markDirty(3);
      skeleton.forEach(
        (bone) => bone instanceof BoneKind && bone.updateData(bones)
      );
      const newHeight = computeUserHeight(bones);
      if (newHeight !== heightOffset) {
        heightOffset = newHeight;
        views.forEach((v) => {
          v.onHeightChange(v, heightOffset);
        });
      }

      const newSkeletinOffset = computeSkeletonOffset(bones);
      if (newSkeletinOffset != skeletonOffset) {
        skeletonOffset = newSkeletinOffset;
        skeletonGroup.position.set(0, skeletonOffset, 0);
      }
    },
    destroy: () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      if (waitTimer !== null) {
        window.clearTimeout(waitTimer);
        waitTimer = null;
      }
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('pointerdown', handlePickDown);
      canvas.removeEventListener('pointerup', handlePickUp);
      canvas.removeEventListener('pointermove', handlePickHover);
      document.removeEventListener('transitionend', syncCanvasSize);
      views.forEach((view) => view.controls.dispose());
      views.length = 0;
      skeletonHelper.dispose();
      grid.geometry.dispose();
      (grid.material as any)?.dispose?.();
      if (!renderer) return;
      renderer.dispose();
      renderer = null;
    },
    addView: ({
      left,
      bottom,
      width,
      height,
      position,
      hidden = false,
      onHeightChange,
    }: {
      left: number;
      bottom: number;
      width: number;
      height: number;
      position: Vector3;
      hidden?: boolean;
      onHeightChange: (view: SkeletonPreviewView, newHeight: number) => void;
    }) => {
      if (!renderer) return;

      const camera = new PerspectiveCamera(
        20,
        resolution.width / resolution.height,
        0.1,
        1000
      );

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.maxDistance = 20;
      // Zoom is the lens (handleWheel), not a dolly.
      controls.enableZoom = false;
      controls.dampingFactor = 0.2;
      controls.enableDamping = true;
      controls.addEventListener('change', () => markDirty(4));
      controls.addEventListener('start', () => {
        userTurning = true;
      });
      controls.addEventListener('end', () => {
        userTurning = false;
        userTurnEnd = performance.now();
        markDirty(4);
      });

      const tween = new Tween(position)
        .onUpdate(() => {
          camera.position.copy(position);
          markDirty(3);
        })
        .onStart(() => {
          frameInterval = 0;
          markDirty(10);
        })
        .onComplete(() => (frameInterval = 1000 / LOW_FRAMERATE));

      camera.position.copy(position);

      const view: SkeletonPreviewView = {
        camera,
        left,
        bottom,
        width,
        height,
        controls,
        tween,
        hidden,
        onHeightChange,
      };

      views.push(view);

      return view;
    },
    toggleAutoOrbit: (enable?: boolean) => setAutoOrbit(enable),
    toggleAutoFrame: (enable?: boolean) => setAutoFrame(enable),
    isAutoOrbiting,
    getViews: () => views,
  };
}

const boneMap = (bones: BoneT[]) =>
  new Map(bones.map((bone) => [bone.bodyPart, bone]));

const BASE_FRAMERATE = 60;
const LOW_FRAMERATE = 30;
// Seconds for a bone to cover most of the way to a new pose. Higher is smoother and more cinematic, and lags more.
const BONE_SMOOTH_TIME = 0.12;
// Auto-frame's camera glide draws at the base rate, not the low one.
const SMOOTH_FRAME_INTERVAL = 1000 / BASE_FRAMERATE;
const FRAME_SLACK_MS = 4;

export type PreviewContext = ReturnType<typeof initializePreview>;

function SkeletonVisualizer({
  onInit,
  disabled = false,
}: {
  onInit: (context: PreviewContext) => void;
  disabled?: boolean;
}) {
  const { config } = useConfig();

  const previewContext = useRef<PreviewContext | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [resizeObserver] = useState(
    () => new ResizeObserver(([e]) => onResize(e))
  );
  // Bones go straight from the store into the scene (see the init effect), without a React render.
  const store = useStore();

  // Ask the server for bones while this view is live.
  useFeedDemand(bonesFeedCountAtom, !disabled);

  // A reset changes the reference heading; pick it up from the bones that
  // arrive once the reset has finished.
  const headingStale = useRef(false);
  const { useRPCPacket } = useWebsocketAPI();
  useRPCPacket(RpcMessage.ResetResponse, ({ status }: ResetResponseT) => {
    if (status === ResetStatus.FINISHED) headingStale.current = true;
  });

  const onResize = (e: ResizeObserverEntry) => {
    const context = previewContext.current;
    if (!context || !containerRef.current || !canvasRef.current) return;
    context.resize(e.contentRect.width, e.contentRect.height);
  };

  const onEnter = () => {
    if (config?.devSettings.fastDataFeed) return;
    const context = previewContext.current;
    if (!context) return;
    context.setFrameInterval(1000 / BASE_FRAMERATE);
  };

  const onLeave = () => {
    if (config?.devSettings.fastDataFeed) return;
    const context = previewContext.current;
    if (!context) return;
    context.setFrameInterval(1000 / LOW_FRAMERATE);
  };

  useLayoutEffect(() => {
    if (disabled) return;
    if (!canvasRef.current || !containerRef.current)
      throw 'invalid state - no canvas or container';
    resizeObserver.observe(containerRef.current);

    const initialBones = boneMap(store.get(bonesAtom));
    previewContext.current = initializePreview(
      canvasRef.current,
      createChildren(initialBones, BoneKind.root)
    );
    if (!config?.devSettings.fastDataFeed)
      previewContext.current.setFrameInterval(1000 / LOW_FRAMERATE);

    const rect = containerRef.current.getBoundingClientRect();
    previewContext.current.resize(rect.width, rect.height);

    containerRef.current.addEventListener('mouseenter', onEnter);
    containerRef.current.addEventListener('mouseleave', onLeave);

    onInit(previewContext.current);

    // Rebuild on the first bones (which also syncs the heading) and whenever the set of bones changes;
    // otherwise just move them.
    let boneCount = -1;
    const applyBones = () => {
      const context = previewContext.current;
      const bones = boneMap(store.get(bonesAtom));
      if (!context || bones.size === 0) return;
      if (bones.size !== boneCount) {
        boneCount = bones.size;
        context.rebuildSkeleton(createChildren(bones, BoneKind.root), bones);
      }
      if (headingStale.current) {
        headingStale.current = false;
        context.syncHeading(bones);
      }
      context.updatesBones(bones);
    };
    applyBones();
    const unsubscribeBones = store.sub(bonesAtom, applyBones);

    return () => {
      unsubscribeBones();
      if (!previewContext.current || !containerRef.current) return;
      resizeObserver.unobserve(containerRef.current);
      previewContext.current.destroy();
      previewContext.current = null;

      containerRef.current.removeEventListener('mouseenter', onEnter);
      containerRef.current.removeEventListener('mouseleave', onLeave);
    };
  }, [disabled]);

  return (
    <div ref={containerRef} className={classNames('w-full h-full')}>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}

export function SkeletonVisualizerWidget({
  onInit = (context) => {
    context.addView({
      left: 0,
      bottom: 0,
      width: 1,
      height: 1,
      position: new Vector3(3, 2.5, -3),
      onHeightChange(v, newHeight) {
        v.controls.target.set(0, newHeight / 2, 0);
        const scale = Math.max(1, newHeight) / 1.5;
        v.camera.zoom = 1 / scale;
      },
    });
  },
  disabled = false,
  toggleDisabled,
}: {
  onInit?: (context: PreviewContext) => void;
  disabled?: boolean;
  toggleDisabled?: () => void;
}) {
  const { l10n } = useLocalization();
  const [error, setError] = useState(false);
  // Starts in the hidden pose even when mounted enabled, so opening the view slides it in too. Two frames give the browser
  // time to paint the hidden pose before the visible one, which is what makes the transition run.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);
  const hidden = disabled || !entered;

  return (
    <div className={classNames('w-full h-full relative')}>
      <div
        // Enabling or opening slides the skeleton up into place and un-blurs it, on an ease-in-out curve, rather than snapping in.
        className={classNames(
          'skeleton-slide w-full h-full transition-[transform,opacity,filter] duration-500 ease-[cubic-bezier(0.65,0,0.35,1)]',
          hidden
            ? 'blur opacity-60 translate-y-4 scale-[0.98]'
            : 'opacity-100 translate-y-0 scale-100'
        )}
      >
        <ErrorBoundary onError={() => setError(true)} fallback={<></>}>
          <SkeletonVisualizer onInit={onInit} disabled={disabled} />
        </ErrorBoundary>
      </div>
      <div
        className={classNames(
          'absolute h-full w-full top-0 flex items-center justify-center transition-opacity duration-300',
          { 'opacity-0 pointer-events-none': !disabled || error }
        )}
      >
        <div
          className={classNames(
            'bg-background-90 rounded-lg p-2 px-3 flex gap-2 items-center',
            {
              'hover:bg-background-60 cursor-pointer': !!toggleDisabled,
              'cursor-not-allowed': !toggleDisabled,
            }
          )}
          onClick={() => toggleDisabled?.()}
        >
          <EyeIcon closed width={20} />
          <Typography id="preview-disabled_render" />
        </div>
      </div>
      <div
        className={classNames(
          'absolute h-full w-full top-0 flex items-center justify-center transition-opacity duration-300',
          { 'opacity-0 pointer-events-none': !error }
        )}
      >
        <div className="bg-background-90 rounded-lg p-2 px-3 flex gap-2 items-center">
          <Typography color="primary" textAlign="text-center">
            {l10n.getString('tips-failed_webgl')}
          </Typography>
        </div>
      </div>
    </div>
  );
}
