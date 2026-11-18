import { formatEther } from 'ethers';

const currentLocale = () => typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en-US' : 'vi-VN';
export const shortAddress=(address?:string|null,left=6,right=4)=>!address?'—':`${address.slice(0,left)}…${address.slice(-right)}`;
export const formatNumber=(value:number|string|null|undefined,digits=0,locale?:string)=>new Intl.NumberFormat(locale||currentLocale(),{maximumFractionDigits:digits}).format(Number(value||0));
export const formatDate=(value?:string|number|Date|null,locale?:string)=>{if(!value)return'—';const date=new Date(value);if(Number.isNaN(date.getTime()))return'—';return new Intl.DateTimeFormat(locale||currentLocale(),{dateStyle:'medium',timeStyle:'short'}).format(date)};
export const salToKg=(amount:number,kgPerSAL=10)=>amount*kgPerSAL;

/** CO₂e for display: kilograms below one tonne (so 30 kg never reads "0 t"), tonnes above. */
export const formatCO2 = (kg: number | null | undefined, locale?: string) => {
  const value = Number(kg || 0);
  if (value < 1000) return `${formatNumber(value, 1, locale)} kg CO₂e`;
  return `${formatNumber(value / 1000, value < 10_000 ? 2 : 1, locale)} tCO₂e`;
};
// Tỷ giá tham chiếu phục vụ hiển thị ước tính cho doanh nghiệp SME
export const AVAX_USD_RATE = 25; // 1 AVAX ~ $25 USDC
export const USD_VND_RATE = 25400; // 1 USD ~ 25,400 VNĐ

export function formatAvaxFiatHint(weiValue: string | bigint | number | null | undefined): string {
  if (weiValue === null || weiValue === undefined || weiValue === "") return "";
  try {
    const avax = Number(formatEther(BigInt(weiValue)));
    if (!Number.isFinite(avax) || avax <= 0) return "";
    return formatAvaxAmountFiatHint(avax);
  } catch {
    return "";
  }
}

export function formatAvaxAmountFiatHint(avaxAmount: number): string {
  if (!Number.isFinite(avaxAmount) || avaxAmount <= 0) return "";
  const usd = avaxAmount * AVAX_USD_RATE;
  const vnd = usd * USD_VND_RATE;

  const usdStr =
    usd < 0.01
      ? "< $0.01 USDC"
      : `$${usd.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} USDC`;

  const vndStr =
    vnd < 100
      ? "< 100 ₫"
      : `${Math.round(vnd).toLocaleString("vi-VN")} ₫`;

  return `≈ ${usdStr} · ${vndStr}`;
}
