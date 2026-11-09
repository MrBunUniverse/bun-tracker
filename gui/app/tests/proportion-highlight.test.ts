import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BodyPart, SkeletonBone } from 'solarxr-protocol';
import {
  BONE_MAPPING,
  BRIGHT_MIX,
  DIM_FACTOR,
  SKELETON_BONE_PARTS,
  partsForRow,
  rowForPart,
  segmentState,
  tintColor,
} from '../src/utils/proportion-highlight.ts';

const controls = Object.values(SkeletonBone).filter(
  (v): v is SkeletonBone => typeof v === 'number' && v !== SkeletonBone.NONE
);
const names = (parts: Iterable<BodyPart>) => [...parts].map((p) => BodyPart[p]);

test('every manual control id maps to real, distinct body parts', () => {
  assert.equal(controls.length, 21);
  for (const bone of controls) {
    const parts = partsForRow({ type: 'bone', bone });
    assert.ok(parts && parts.size > 0, `${SkeletonBone[bone]} unmapped`);
    assert.equal(parts.size, SKELETON_BONE_PARTS[bone as keyof typeof SKELETON_BONE_PARTS].length);
    for (const p of parts) assert.ok(BodyPart[p] !== undefined && p !== BodyPart.NONE);
  }
  assert.equal(partsForRow({ type: 'bone', bone: SkeletonBone.NONE }), null);
});

test('sided bones always highlight both sides', () => {
  for (const bone of controls) {
    const n = names(partsForRow({ type: 'bone', bone })!);
    for (const name of n) {
      if (name.startsWith('LEFT_')) assert.ok(n.includes('RIGHT_' + name.slice(5)), name);
      if (name.startsWith('RIGHT_')) assert.ok(n.includes('LEFT_' + name.slice(6)), name);
    }
  }
});

test('single bones highlight exactly their anatomy', () => {
  const get = (bone: SkeletonBone) => names(partsForRow({ type: 'bone', bone })!).sort();
  assert.deepEqual(get(SkeletonBone.HEAD), ['HEAD']);
  assert.deepEqual(get(SkeletonBone.NECK), ['NECK']);
  assert.deepEqual(get(SkeletonBone.UPPER_LEG), ['LEFT_UPPER_LEG', 'RIGHT_UPPER_LEG']);
  assert.deepEqual(get(SkeletonBone.HIPS_WIDTH), ['LEFT_HIP', 'RIGHT_HIP']);
  assert.deepEqual(get(SkeletonBone.SHOULDERS_WIDTH), get(SkeletonBone.SHOULDERS_DISTANCE));
  assert.deepEqual(get(SkeletonBone.CHEST_OFFSET), ['CHEST', 'UPPER_CHEST']);
  assert.deepEqual(get(SkeletonBone.HAND_Z), ['LEFT_HAND', 'RIGHT_HAND']);
  assert.equal(get(SkeletonBone.HAND_Y).length, 2 + 30);
  assert.equal(get(SkeletonBone.ELBOW_OFFSET).length, 4);
});

test('skeleton offset highlights the whole body', () => {
  const all = partsForRow({ type: 'bone', bone: SkeletonBone.SKELETON_OFFSET })!;
  const everyPart = Object.values(BodyPart).filter(
    (v) => typeof v === 'number' && v !== BodyPart.NONE
  );
  assert.equal(all.size, everyPart.length);
});

test('group rows are the union of their children, from the real group table', () => {
  assert.equal(BONE_MAPPING.size, 3);
  for (const [label, bones] of BONE_MAPPING) {
    const group = partsForRow({ type: 'group', label })!;
    const union = new Set(
      bones.flatMap((bone) => [...partsForRow({ type: 'group-part', bone })!])
    );
    assert.deepEqual(names(group).sort(), names(union).sort(), label);
  }
  assert.deepEqual(
    names(partsForRow({ type: 'group', label: 'skeleton_bone-arm_group' })!).sort(),
    ['LEFT_LOWER_ARM', 'LEFT_UPPER_ARM', 'RIGHT_LOWER_ARM', 'RIGHT_UPPER_ARM']
  );
  assert.deepEqual(
    names(partsForRow({ type: 'group', label: 'skeleton_bone-torso_group' })!).sort(),
    ['CHEST', 'HIP', 'UPPER_CHEST', 'WAIST']
  );
  // Grouped bones never overlap another group.
  const seen = new Set<SkeletonBone>();
  for (const bones of BONE_MAPPING.values())
    for (const b of bones) {
      assert.ok(!seen.has(b));
      seen.add(b);
    }
  assert.equal(partsForRow({ type: 'group', label: 'skeleton_bone-nope' }), null);
});

test('mapping covers every drawn bone the server says a config value moves', () => {
  const java = readFileSync(
    new URL(
      '../../../server/core/src/main/java/dev/slimevr/tracking/processor/config/SkeletonConfigOffsets.java',
      import.meta.url
    ),
    'utf8'
  );
  const entries = [...java.matchAll(/\b([A-Z_]+)\(\s*(\d+),[\s\S]*?new BoneType\[\] \{([^}]*)\}/g)];
  assert.equal(entries.length, controls.length);
  for (const [, , id, types] of entries) {
    const mine = SKELETON_BONE_PARTS[Number(id) as keyof typeof SKELETON_BONE_PARTS];
    for (const t of types.match(/[A-Z_]+/g) ?? []) {
      const name = t.replace(/^BoneType$/, '');
      const part = BodyPart[name as keyof typeof BodyPart];
      // Tracker-only bone types (CHEST_TRACKER...) have no drawn bone.
      if (typeof part === 'number') assert.ok(mine.includes(part), `${SkeletonBone[Number(id)]} misses ${name}`);
    }
  }
});

test('segment state and tint', () => {
  const hl = new Set([BodyPart.NECK]);
  assert.equal(segmentState(BodyPart.HEAD, null), 'normal');
  assert.equal(segmentState(null, null), 'normal');
  assert.equal(segmentState(BodyPart.NECK, hl), 'active');
  assert.equal(segmentState(BodyPart.HEAD, hl), 'dim');
  assert.equal(segmentState(null, hl), 'dim');

  assert.deepEqual(tintColor([0.2, 0.4, 0.6], 'normal'), [0.2, 0.4, 0.6]);
  const [r, g, b] = tintColor([0.2, 0.4, 0.6], 'active');
  assert.ok(Math.abs(r - (0.2 + 0.8 * BRIGHT_MIX)) < 1e-9 && g > 0.4 && b > 0.6 && b <= 1);
  assert.deepEqual(tintColor([1, 0.5, 0], 'dim'), [DIM_FACTOR, 0.5 * DIM_FACTOR, 0]);
  // Black stays visible-as-dimmer rather than inverting: active is never darker than dim.
  assert.ok(tintColor([0.5, 0.5, 0.5], 'active')[0] > tintColor([0.5, 0.5, 0.5], 'dim')[0]);
});

test('a clicked bone picks the most specific row, inside its group when grouped', () => {
  const linear = controls.map((bone) => ({ type: 'bone' as const, bone, label: SkeletonBone[bone] }));
  assert.deepEqual(rowForPart(linear, BodyPart.LEFT_LOWER_LEG), { label: 'LOWER_LEG', parent: null });
  assert.deepEqual(rowForPart(linear, BodyPart.HEAD), { label: 'HEAD', parent: null });

  const grouped = [
    {
      type: 'group' as const,
      label: 'skeleton_bone-leg_group',
      bones: [SkeletonBone.UPPER_LEG, SkeletonBone.LOWER_LEG].map((bone) => ({
        type: 'group-part' as const,
        bone,
        label: SkeletonBone[bone],
      })),
    },
    { type: 'bone' as const, bone: SkeletonBone.SKELETON_OFFSET, label: 'SKELETON_OFFSET' },
  ];
  assert.deepEqual(rowForPart(grouped, BodyPart.RIGHT_UPPER_LEG), {
    label: 'UPPER_LEG',
    parent: 'skeleton_bone-leg_group',
  });
  // Only the whole-body offset covers the neck here.
  assert.deepEqual(rowForPart(grouped, BodyPart.NECK), { label: 'SKELETON_OFFSET', parent: null });
  assert.equal(rowForPart([], BodyPart.NECK), null);
});
