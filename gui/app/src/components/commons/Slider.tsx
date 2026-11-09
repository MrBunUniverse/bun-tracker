import { CSSProperties } from 'react';

/** Native range input with a filled track (see `.apple-slider` in index.scss). */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  disabled = false,
  valueText,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  label: string;
  disabled?: boolean;
  valueText?: string;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={label}
      aria-valuetext={valueText}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className="apple-slider"
      style={{ '--slider-fill': `${fill}%` } as CSSProperties}
    />
  );
}
