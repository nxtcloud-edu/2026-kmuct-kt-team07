/**
 * Vector rebuild of the 딱품 logo: an isometric box whose right face carries a
 * puzzle socket, and modular lettering built from the same rounded blocks.
 * Colours come from the theme (--ink, --brand, --brand-2) so the mark and the
 * interface cannot drift apart.
 */
export default function Logo({ height = 38 }: { height?: number }) {
  return (
    <svg
      className="logo"
      viewBox="6 3 147 58"
      height={height}
      role="img"
      aria-label="딱품"
    >
      <g strokeWidth="2" strokeLinejoin="round">
        <polygon
          className="logo-top"
          points="32,5 53.08,17.17 32,29.34 10.92,17.17"
        />
        <polygon
          className="logo-ink"
          points="8.62,21.16 29.7,33.33 29.7,57.67 8.62,45.5"
        />
        <path
          className="logo-brand"
          d="M34.3 33.33V35.43A4.9 4.9 0 1 1 34.3 44.37V57.67L55.38 45.5V21.16Z"
        />
      </g>
      {/* 딱 */}
      <g className="logo-ink" transform="translate(65 10.5) scale(4.1)">
        <rect x="0.06" y="0.29" width="3.03" height="1.42" rx="0.2" />
        <rect x="0.06" y="0.29" width="1.8" height="5" rx="0.2" />
        <rect x="0.06" y="3.57" width="3.03" height="1.72" rx="0.2" />
        <rect x="3.43" y="0.29" width="3.06" height="1.42" rx="0.2" />
        <rect x="3.43" y="0.29" width="1.8" height="5" rx="0.2" />
        <rect x="3.43" y="3.57" width="3.06" height="1.72" rx="0.2" />
        <rect x="6.91" y="0" width="2" height="5.63" rx="0.2" />
        <rect x="8.5" y="2.09" width="1.5" height="1.77" rx="0.2" />
        <rect x="0.74" y="6.06" width="8.12" height="1.65" rx="0.2" />
        <rect x="6.77" y="6.06" width="2.09" height="3.94" rx="0.2" />
      </g>
      {/* 품 */}
      <g className="logo-brand" transform="translate(108.4 10.5) scale(4.1)">
        <rect x="0.8" y="0.29" width="8.11" height="1.51" rx="0.2" />
        <rect x="2" y="1.4" width="1.86" height="1.7" />
        <rect x="5.86" y="1.4" width="1.85" height="1.7" />
        <rect x="0.8" y="2.71" width="8.11" height="1.43" rx="0.2" />
        <rect x="0" y="4.57" width="9.71" height="1.49" rx="0.2" />
        <rect x="3.89" y="5.7" width="1.94" height="1.2" />
        <rect x="0.8" y="6.51" width="8.11" height="1.35" rx="0.2" />
        <rect x="0.8" y="6.51" width="1.91" height="3.49" rx="0.2" />
        <rect x="7" y="6.51" width="1.91" height="3.49" rx="0.2" />
        <rect x="0.8" y="8.49" width="8.11" height="1.51" rx="0.2" />
      </g>
    </svg>
  );
}
