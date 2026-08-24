// The locked wordmark. This is a fused wordmark mark only — there is no
// separate icon/symbol version. (An earlier "Two bodies, one cut" dual-body
// icon direction was tried and abandoned; don't resurrect that framing.)
// Path + viewBox pulled verbatim from 04am-wordmark-tight.svg (tighter-
// fusion cut, 2026-08); not recreated or re-traced. fill-rule="evenodd" is
// load-bearing — it's what punches the counters (letterform holes) — keep
// it on the path exactly as traced. currentColor so it inherits Bone/Ink/
// etc. from its container per the "one mark, everywhere" rule.
export function Wordmark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 2691 846"
      role="img"
      aria-label="04AM"
    >
      <path
        d="M 49.0 301.0 L 40.0 386.0 L 40.0 460.0 L 46.0 527.0 L 55.0 574.0 L 65.0 609.0 L 82.0 651.0 L 99.0 682.0 L 119.0 710.0 L 143.0 736.0 L 170.0 758.0 L 208.0 780.0 L 242.0 793.0 L 288.0 803.0 L 320.0 806.0 L 370.0 806.0 L 409.0 802.0 L 448.0 793.0 L 482.0 780.0 L 511.0 764.0 L 539.0 743.0 L 570.0 711.0 L 592.0 680.0 L 610.0 646.0 L 915.0 646.0 L 916.0 779.0 L 1104.0 779.0 L 1105.0 646.0 L 1154.0 647.0 L 1109.0 767.0 L 1109.0 779.0 L 1308.0 779.0 L 1355.0 646.0 L 1637.0 646.0 L 1684.0 779.0 L 2018.0 779.0 L 2018.0 274.0 L 2022.0 278.0 L 2175.0 638.0 L 2305.0 639.0 L 2462.0 273.0 L 2463.0 779.0 L 2651.0 779.0 L 2651.0 40.0 L 2402.0 40.0 L 2240.0 417.0 L 2079.0 40.0 L 1830.0 40.0 L 1829.0 622.0 L 1613.0 40.0 L 1378.0 41.0 L 1208.0 500.0 L 1104.0 499.0 L 1104.0 40.0 L 885.0 40.0 L 650.0 389.0 L 643.0 314.0 L 630.0 254.0 L 611.0 202.0 L 595.0 171.0 L 577.0 144.0 L 539.0 103.0 L 501.0 76.0 L 460.0 57.0 L 402.0 43.0 L 370.0 40.0 L 320.0 40.0 L 276.0 45.0 L 222.0 60.0 L 196.0 72.0 L 170.0 88.0 L 142.0 111.0 L 124.0 130.0 L 92.0 176.0 L 70.0 223.0 L 56.0 268.0 Z M 1496.0 237.0 L 1587.0 499.0 L 1586.0 501.0 L 1405.0 500.0 Z M 915.0 222.0 L 916.0 499.0 L 729.0 500.0 L 729.0 497.0 Z M 341.0 178.0 L 363.0 180.0 L 387.0 189.0 L 410.0 208.0 L 423.0 227.0 L 436.0 260.0 L 443.0 291.0 L 449.0 338.0 L 452.0 392.0 L 452.0 451.0 L 448.0 516.0 L 440.0 568.0 L 431.0 600.0 L 417.0 628.0 L 397.0 650.0 L 376.0 662.0 L 350.0 668.0 L 327.0 666.0 L 305.0 658.0 L 293.0 650.0 L 278.0 635.0 L 268.0 620.0 L 254.0 585.0 L 247.0 554.0 L 241.0 508.0 L 238.0 458.0 L 238.0 386.0 L 242.0 326.0 L 249.0 280.0 L 260.0 242.0 L 276.0 213.0 L 294.0 195.0 L 314.0 184.0 Z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  );
}
