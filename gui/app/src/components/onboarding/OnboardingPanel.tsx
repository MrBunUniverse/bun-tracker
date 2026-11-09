import classNames from 'classnames';
import { ReactNode } from 'react';

// One page frame and one floating panel for every wizard step, so width, side padding,
// vertical alignment, radius, border, surface and shadow stay identical.
export function OnboardingPage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={classNames(
        'relative z-10 flex flex-col items-center justify-center min-h-full w-full px-6 smol:px-12 py-6 sm:py-8',
        className
      )}
    >
      {children}
    </div>
  );
}

export function OnboardingPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={classNames(
        'relative z-10 flex flex-col max-w-[680px] w-full mx-auto p-6 sm:p-8 rounded-[28px] bg-background-70/70 dark:bg-background-10/[0.02] border border-background-50/50 dark:border-background-10/[0.08] shadow-xl',
        className
      )}
    >
      {children}
    </div>
  );
}

// Back left, primary action right; same buttons everywhere.
export function OnboardingActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-row gap-3 justify-between items-center w-full">
      {children}
    </div>
  );
}
