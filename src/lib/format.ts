const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** £1,234.56, with a real minus sign for negatives. */
export function money(n: number): string {
  const v = r2(n);
  const s = gbp.format(Math.abs(v));
  return v < 0 ? `−${s}` : s;
}

/** Like money, but positives carry a plus sign (for cashflow lines). */
export function moneyS(n: number): string {
  const v = r2(n);
  return v > 0 ? `+${money(v)}` : money(v);
}

export function pct(x: number): string {
  return `${(Math.round(x * 1000) / 10).toFixed(1)}%`;
}
