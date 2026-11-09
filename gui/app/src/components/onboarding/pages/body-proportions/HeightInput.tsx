import { SegmentedControl } from '@/components/commons/SegmentedControl';
import { Typography } from '@/components/commons/Typography';
import { EYE_HEIGHT_TO_HEIGHT_RATIO } from '@/hooks/height';
import { useLocaleConfig } from '@/i18n/config';
import { useLocalization } from '@fluent/react';
import classNames from 'classnames';
import convert from 'convert';
import { useMemo, useState } from 'react';

function IncrementButton({
  value,
  unit,
  disabled = false,
  onClick,
}: {
  value: number;
  disabled?: boolean;
  unit: 'foot' | 'inch' | 'cm';
  onClick: () => void;
}) {
  const { currentLocales } = useLocaleConfig();

  const { format, label } = useMemo(() => {
    const sign = value > 0 ? '+' : '\u2212';
    const abs = Math.abs(value);
    if (unit == 'cm')
      return {
        format: `${sign}${abs}`,
        label: `${sign}${new Intl.NumberFormat(currentLocales, {
          style: 'unit',
          unit: 'centimeter',
          unitDisplay: 'long',
        }).format(abs)}`,
      };
    const formatter = (unitDisplay: 'narrow' | 'long') =>
      new Intl.NumberFormat(currentLocales, {
        style: 'unit',
        unit: unit,
        unitDisplay,
        maximumFractionDigits: 0,
      }).format(abs);
    return {
      format: `${sign}${formatter('narrow')}`,
      label: `${sign}${formatter('long')}`,
    };
  }, [currentLocales, value, unit]);

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={classNames(
        'no-user-drag flex h-11 min-w-11 items-center justify-center rounded-[12px] border px-3 font-sans text-ui-sm font-semibold tabular-nums select-none transition-colors duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-background-30/40',
        disabled
          ? 'cursor-not-allowed border-background-50/20 bg-background-60/20 text-background-40'
          : 'cursor-pointer border-background-50/40 bg-background-50/50 text-background-10 hover:bg-background-50/80 active:scale-[0.97] dark:border-background-10/[0.04]'
      )}
    >
      {format}
    </button>
  );
}

function formatInFoot(meters: number, locale: string[]) {
  const totalInches = Math.round(convert(meters, 'meter').to('inch'));
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;

  const feetFormatter = new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'foot',
    unitDisplay: 'narrow',
    maximumFractionDigits: 0,
  });

  const inchFormatter = new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'inch',
    unitDisplay: 'narrow',
    maximumFractionDigits: 0,
  });

  return `${feetFormatter.format(feet)} ${inchFormatter.format(inches)}`;
}

const round4Digit = (value: number) => Math.round(value * 10000) / 10000;

export function HeightSelectionInput({
  disabled = false,
  hmdHeight,
  setHmdHeight,
}: {
  disabled?: boolean;
  hmdHeight: number;
  setHmdHeight: (height: number) => void;
}) {
  if (!hmdHeight) disabled = true;

  const { l10n } = useLocalization();
  const [unit, setUnit] = useState<'meter' | 'foot'>('meter');
  const { currentLocales } = useLocaleConfig();

  const formattedHeight = useMemo(() => {
    if (!hmdHeight) return '--';

    const fullHeight = hmdHeight / EYE_HEIGHT_TO_HEIGHT_RATIO;
    const displayHeight = round4Digit(fullHeight);

    if (unit === 'meter') {
      return new Intl.NumberFormat(currentLocales, {
        style: 'unit',
        unit: 'meter',
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      }).format(displayHeight);
    }

    return formatInFoot(displayHeight, currentLocales);
  }, [hmdHeight, unit]);

  const incrementMath = (unit: 'inch' | 'cm' | 'foot', value: number) => {
    const incrementInMeters = convert(value, unit).to('meter');
    const oldFull = hmdHeight / EYE_HEIGHT_TO_HEIGHT_RATIO;
    const newFull = oldFull + incrementInMeters;
    const newEye = newFull * EYE_HEIGHT_TO_HEIGHT_RATIO;

    return round4Digit(newEye);
  };

  const increment = (unit: 'inch' | 'cm' | 'foot', value: number) => {
    const newEye = incrementMath(unit, value);
    setHmdHeight(newEye);
  };

  const canIcrement = (
    unit: 'inch' | 'cm' | 'foot',
    value: number,
    max: number
  ) => {
    const newEye = incrementMath(unit, value);
    return value < 0 ? newEye >= max : newEye < max;
  };

  const handleUnitChange = (newUnit: 'meter' | 'foot') => {
    if (!hmdHeight || newUnit === unit) return;

    const fullHeight = hmdHeight / EYE_HEIGHT_TO_HEIGHT_RATIO;
    let snappedHeight;

    if (newUnit === 'foot') {
      // Snap to nearest inch
      const totalInches = Math.round(convert(fullHeight, 'meter').to('inch'));
      snappedHeight = convert(totalInches, 'inch').to('meter');
    } else {
      // Snap to nearest centimeter
      const totalCm = Math.round(convert(fullHeight, 'meter').to('cm'));
      snappedHeight = convert(totalCm, 'cm').to('meter');
    }

    const newEyeHeight = round4Digit(
      snappedHeight * EYE_HEIGHT_TO_HEIGHT_RATIO
    );
    setHmdHeight(newEyeHeight);
    setUnit(newUnit);
  };

  const stepper = (
    unit: 'inch' | 'cm' | 'foot',
    value: number,
    max: number
  ) => (
    <IncrementButton
      value={value}
      unit={unit}
      onClick={() => increment(unit, value)}
      disabled={disabled || !canIcrement(unit, value, max)}
    />
  );

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <Typography variant="standard" bold id="onboarding-user_height-title" />
        <SegmentedControl
          ariaLabel={l10n.getString('onboarding-user_height-unit')}
          value={unit}
          onChange={handleUnitChange}
          options={[
            { value: 'meter', label: l10n.getString('unit-cm') },
            { value: 'foot', label: l10n.getString('unit-foot') },
          ]}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-3">
        <div className="flex gap-1.5">
          {unit === 'foot' && (
            <>
              {stepper('foot', -1, 0.9)}
              {stepper('inch', -1, 0.9)}
            </>
          )}
          {unit === 'meter' && (
            <>
              {stepper('cm', -10, 0.9)}
              {stepper('cm', -1, 0.9)}
            </>
          )}
        </div>
        {/* Full-width row on narrow windows, centred between the steppers from xs up. */}
        <div
          role="status"
          aria-live="polite"
          className="order-first flex min-w-[9rem] basis-full items-center justify-center px-1 xs:order-none xs:flex-1"
        >
          <span className="whitespace-nowrap font-sans text-ui-hero font-semibold leading-none tabular-nums text-background-10">
            {formattedHeight}
          </span>
        </div>
        <div className="flex gap-1.5">
          {unit === 'foot' && (
            <>
              {stepper('inch', 1, 2.4)}
              {stepper('foot', 1, 2.4)}
            </>
          )}
          {unit === 'meter' && (
            <>
              {stepper('cm', 1, 2.4)}
              {stepper('cm', 10, 2.4)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
