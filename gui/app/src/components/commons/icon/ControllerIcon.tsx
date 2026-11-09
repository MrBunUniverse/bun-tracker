// A left VR controller: tracking ring, face with thumbstick and button, trigger, grip. `flipped` mirrors
// it into the right one. Drawn on whole units of a 24 grid, so PixelIcon maps it one cell per unit.
export function ControllerIcon({
  width = 24,
  flipped = false,
}: {
  width?: number;
  flipped?: boolean;
}) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={width} viewBox="0 0 24 24">
      <g transform={flipped ? 'scale(-1,1) translate(-24,0)' : undefined}>
        {/* Tracking ring, ending under the face */}
        <path d="M9.52 15.64A7.3 7.3 0 1 1 15.14 10.02L13.28 9.62A5.4 5.4 0 1 0 9.12 13.78Z" />
        {/* Face and grip, with the thumbstick (ring and cap) and a button cut out */}
        <path
          fillRule="evenodd"
          d="M11 9.5H18.5A2.5 2.5 0 0 1 21 12V13.5A2.5 2.5 0 0 1 18.5 16H18L17 22A1.5 1.5 0 0 1 15.5 23.3H12A1.5 1.5 0 0 1 10.5 21.6L11.5 16H11A2.5 2.5 0 0 1 8.5 13.5V12A2.5 2.5 0 0 1 11 9.5ZM11.3 12.5a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0 -4.4 0ZM12.75 12.5a0.75 0.75 0 1 0 1.5 0a0.75 0.75 0 1 0 -1.5 0ZM17.7 12.5a0.8 0.8 0 1 0 1.6 0a0.8 0.8 0 1 0 -1.6 0Z"
        />
        {/* Trigger */}
        <path d="M10.4 16.5H9.6A1.6 1.6 0 0 0 9.2 19.6L10.3 19.7Z" />
      </g>
    </svg>
  );
}
