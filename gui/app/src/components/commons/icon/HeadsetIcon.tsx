// Drawn on whole units of a 24 grid, so the pixel themes (PixelIcon) map it one cell per unit.
export function HeadsetIcon({
  width = 24,
  disabled = false,
}: {
  width?: number;
  disabled?: boolean;
}) {
  return (
    <svg
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      viewBox="0 2 24 20"
    >
      {/* Head strap over the top */}
      <path d="M3 10A9 6 0 0 1 21 10H18.7A6.7 4.5 0 0 0 5.3 10Z" />
      {/* Visor, with two tracking cameras and the nose gap */}
      <path
        fillRule="evenodd"
        d="M3.5 9H20.5A2.5 2.5 0 0 1 23 11.5V16A2.5 2.5 0 0 1 20.5 18.5H15.5Q15 15.5 12 15.5Q9 15.5 8.5 18.5H3.5A2.5 2.5 0 0 1 1 16V11.5A2.5 2.5 0 0 1 3.5 9ZM4 11H6V13H4ZM18 11H20V13H18Z"
      />
      {/* Side straps */}
      <path d="M0 12H1.5V15.5H0ZM22.5 12H24V15.5H22.5Z" />
      {disabled && (
        <line x1="1" y1="3" x2="23" y2="21" stroke="red" strokeWidth="1.2" />
      )}
    </svg>
  );
}
