import { ReactNode } from 'react';
import classNames from 'classnames';
import { StatusTone, toneClass } from '@/components/commons/StatusDot';

/** VR tile content: a 20px icon with an optional status badge on its corner, and one short label. */
export function StatusBarTile({
  icon,
  label,
  tone,
}: {
  icon: ReactNode;
  label: string;
  tone?: StatusTone;
}) {
  return (
    <>
      <span
        aria-hidden="true"
        className="relative flex h-5 w-5 shrink-0 items-center justify-center fill-current [&>svg]:h-5 [&>svg]:w-5"
      >
        {icon}
        {tone && (
          <span
            className={classNames(
              'absolute -right-1 -top-1 h-2 w-2 ring-2 ring-background-70',
              toneClass[tone],
              tone === 'critical' ? 'rounded-[2px] rotate-45' : 'rounded-full'
            )}
          />
        )}
      </span>
      <span className="max-w-full truncate">{label}</span>
    </>
  );
}
