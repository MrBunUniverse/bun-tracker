export function SlimeVRIcon({
  drag,
  width = 38,
  height = 22,
  className = 'text-accent-background-20',
}: {
  drag?: boolean;
  width?: number;
  height?: number;
  className?: string;
}) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="-2 -2 53 33"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      data-electron-drag-region={drag}
    >
      <path
        d="M2 26.996C10.44 25.59 29.16 23.1571 46.509 26.9091C46.509 26.9091 48.89 -0.199966 35.761 2.14503"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <path
        d="M7.52161 15.0107L12.3649 9.20459L17.5044 13.9572"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <path
        d="M27.9566 14.1435L33.7372 9.27062L37.9695 14.8458"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ClaudeSparkIcon({
  size = 18,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className || 'text-accent-background-10 shrink-0'}
    >
      <path d="M12 1.5a1.2 1.2 0 0 1 1.2 1.2v6.2l4.38-4.38a1.2 1.2 0 1 1 1.7 1.7L14.9 10.6h6.2a1.2 1.2 0 1 1 0 2.4h-6.2l4.38 4.38a1.2 1.2 0 1 1-1.7 1.7L13.2 14.7v6.2a1.2 1.2 0 1 1-2.4 0v-6.2l-4.38 4.38a1.2 1.2 0 1 1-1.7-1.7L9.1 13H2.9a1.2 1.2 0 0 1 0-2.4h6.2L4.72 6.22a1.2 1.2 0 1 1 1.7-1.7L10.8 8.9V2.7A1.2 1.2 0 0 1 12 1.5Z" />
    </svg>
  );
}
