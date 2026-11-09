import { BodyPart, SkeletonBone } from 'solarxr-protocol';

// Manual proportion groups: the grouped rows adjust these bones together.
export const BONE_MAPPING: Map<string, SkeletonBone[]> = new Map([
  [
    'skeleton_bone-torso_group',
    [
      SkeletonBone.UPPER_CHEST,
      SkeletonBone.CHEST,
      SkeletonBone.HIP,
      SkeletonBone.WAIST,
    ],
  ],
  ['skeleton_bone-leg_group', [SkeletonBone.UPPER_LEG, SkeletonBone.LOWER_LEG]],
  ['skeleton_bone-arm_group', [SkeletonBone.UPPER_ARM, SkeletonBone.LOWER_ARM]],
]);

export type BoneHighlight = ReadonlySet<BodyPart>;

const lr = (left: BodyPart, right: BodyPart) => [left, right];

const ALL_PARTS = Object.values(BodyPart).filter(
  (v): v is BodyPart => typeof v === 'number' && v !== BodyPart.NONE
);

// A hand bone drives its fingers' lengths too (the server splits HAND_Y across the phalanges).
const FINGER_PARTS = (['LEFT', 'RIGHT'] as const).flatMap((side) =>
  [
    'THUMB_METACARPAL',
    'THUMB_PROXIMAL',
    'THUMB_DISTAL',
    ...(['INDEX', 'MIDDLE', 'RING', 'LITTLE'] as const).flatMap((finger) =>
      (['PROXIMAL', 'INTERMEDIATE', 'DISTAL'] as const).map((seg) => `${finger}_${seg}`)
    ),
  ].map((name) => BodyPart[`${side}_${name}` as keyof typeof BodyPart])
);

const HANDS = lr(BodyPart.LEFT_HAND, BodyPart.RIGHT_HAND);

// Drawn bones each config value moves. Mirrors SkeletonConfigOffsets.affectedOffsets in the server (the drawn
// bone types only), plus the bones the tracker-only offsets visibly sit on. Each segment is owned by the bone
// that starts it, so its length is that bone's own config value.
export const SKELETON_BONE_PARTS: Record<
  Exclude<SkeletonBone, SkeletonBone.NONE>,
  BodyPart[]
> = {
  [SkeletonBone.HEAD]: [BodyPart.HEAD],
  [SkeletonBone.NECK]: [BodyPart.NECK],
  [SkeletonBone.UPPER_CHEST]: [BodyPart.UPPER_CHEST],
  [SkeletonBone.CHEST]: [BodyPart.CHEST],
  // Positions the chest tracker, which sits on the upper chest and chest bones.
  [SkeletonBone.CHEST_OFFSET]: [BodyPart.UPPER_CHEST, BodyPart.CHEST],
  [SkeletonBone.WAIST]: [BodyPart.WAIST],
  [SkeletonBone.HIP]: [BodyPart.HIP],
  [SkeletonBone.HIP_OFFSET]: [BodyPart.HIP],
  [SkeletonBone.HIPS_WIDTH]: lr(BodyPart.LEFT_HIP, BodyPart.RIGHT_HIP),
  [SkeletonBone.UPPER_LEG]: lr(BodyPart.LEFT_UPPER_LEG, BodyPart.RIGHT_UPPER_LEG),
  [SkeletonBone.LOWER_LEG]: lr(BodyPart.LEFT_LOWER_LEG, BodyPart.RIGHT_LOWER_LEG),
  [SkeletonBone.FOOT_LENGTH]: lr(BodyPart.LEFT_FOOT, BodyPart.RIGHT_FOOT),
  [SkeletonBone.FOOT_SHIFT]: lr(BodyPart.LEFT_LOWER_LEG, BodyPart.RIGHT_LOWER_LEG),
  // Shifts every tracker mount, so the whole body is what changes.
  [SkeletonBone.SKELETON_OFFSET]: ALL_PARTS,
  [SkeletonBone.SHOULDERS_DISTANCE]: lr(
    BodyPart.LEFT_SHOULDER,
    BodyPart.RIGHT_SHOULDER
  ),
  [SkeletonBone.SHOULDERS_WIDTH]: lr(BodyPart.LEFT_SHOULDER, BodyPart.RIGHT_SHOULDER),
  [SkeletonBone.UPPER_ARM]: lr(BodyPart.LEFT_UPPER_ARM, BodyPart.RIGHT_UPPER_ARM),
  [SkeletonBone.LOWER_ARM]: lr(BodyPart.LEFT_LOWER_ARM, BodyPart.RIGHT_LOWER_ARM),
  [SkeletonBone.HAND_Y]: [...HANDS, ...FINGER_PARTS],
  [SkeletonBone.HAND_Z]: HANDS,
  // Positions the elbow tracker, i.e. the joint between the two arm bones.
  [SkeletonBone.ELBOW_OFFSET]: [
    ...lr(BodyPart.LEFT_UPPER_ARM, BodyPart.RIGHT_UPPER_ARM),
    ...lr(BodyPart.LEFT_LOWER_ARM, BodyPart.RIGHT_LOWER_ARM),
  ],
};

const cache = new Map<string, BoneHighlight>();

/** Bones a manual-proportion row affects, or null when the row has no mapping. */
export function partsForRow(
  row:
    | { type: 'group'; label: string }
    | { type: 'bone' | 'group-part'; bone: SkeletonBone }
): BoneHighlight | null {
  const bones = row.type === 'group' ? BONE_MAPPING.get(row.label) : [row.bone];
  if (!bones?.length) return null;
  const key = bones.join(',');
  let parts = cache.get(key);
  if (!parts) {
    const ids = bones.flatMap(
      (b) => SKELETON_BONE_PARTS[b as keyof typeof SKELETON_BONE_PARTS] ?? []
    );
    if (!ids.length) return null;
    parts = new Set(ids);
    cache.set(key, parts);
  }
  return parts;
}

export type SegmentState = 'normal' | 'active' | 'dim';

/** A line segment's state: `owner` is the bone that starts it (null when it is not a body bone). */
export function segmentState(
  owner: BodyPart | null,
  highlight: BoneHighlight | null
): SegmentState {
  if (!highlight) return 'normal';
  return owner !== null && highlight.has(owner) ? 'active' : 'dim';
}

export const DIM_FACTOR = 0.3;
export const BRIGHT_MIX = 0.45;

/** Rainbow colour -> highlighted (towards white) or dimmed (towards black). Normal is untouched. */
export function tintColor(
  [r, g, b]: [number, number, number],
  state: SegmentState
): [number, number, number] {
  if (state === 'active') {
    return [
      r + (1 - r) * BRIGHT_MIX,
      g + (1 - g) * BRIGHT_MIX,
      b + (1 - b) * BRIGHT_MIX,
    ];
  }
  if (state === 'dim') return [r * DIM_FACTOR, g * DIM_FACTOR, b * DIM_FACTOR];
  return [r, g, b];
}

type PickRow = Parameters<typeof partsForRow>[0] & { label: string; bones?: PickRow[] };

/**
 * The row a clicked bone opens: the most specific row (fewest affected bones) whose highlight includes it, so a
 * click on the shin picks Lower leg over Leg group or Skeleton offset. `parent` is the group to expand first.
 */
export function rowForPart(
  rows: readonly PickRow[],
  part: BodyPart
): { label: string; parent: string | null } | null {
  let best: { label: string; parent: string | null; size: number } | null = null;
  const visit = (row: PickRow, parent: string | null) => {
    const parts = partsForRow(row);
    if (parts?.has(part) && (!best || parts.size < best.size)) {
      best = { label: row.label, parent, size: parts.size };
    }
    row.bones?.forEach((child) => visit(child, row.label));
  };
  rows.forEach((row) => visit(row, null));
  if (!best) return null;
  const { label, parent } = best;
  return { label, parent };
}
