export type KytePrice = {
  priceMinor: number;
  currency: { code: string; decimals: number };
};

export function formatKytePrice(offer: KytePrice): string {
  const decimals = offer.currency?.decimals;
  const code = offer.currency?.code;
  if (!Number.isFinite(offer.priceMinor) || !Number.isInteger(decimals) || decimals < 0 || decimals > 6 || !code) return "Çmimi i padisponueshëm";
  const value = offer.priceMinor / 10 ** decimals;
  try {
    return new Intl.NumberFormat("sq-AL", { style: "currency", currency: code, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
  } catch {
    return `${value.toFixed(decimals)} ${code}`;
  }
}