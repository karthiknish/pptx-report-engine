/** Money for slide text: "£4.20", "£12.3k", "<£0.01". Swap the symbol here to change currency. */
const SYMBOL = '£'

export const usd = (n: number): string => {
  const raw = Number.isFinite(n) ? n : 0
  const x = Math.round(raw * 100) / 100
  if (raw > 0 && x === 0) return `<${SYMBOL}0.01`
  const sign = x < 0 ? '-' : ''
  const abs = Math.abs(x)
  if (abs >= 1e12) return `${sign}${SYMBOL}${(abs / 1e12).toFixed(1)}T`
  if (abs >= 1e9) return `${sign}${SYMBOL}${(abs / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${sign}${SYMBOL}${(abs / 1e6).toFixed(1)}M`
  if (abs >= 1000) return `${sign}${SYMBOL}${(abs / 1000).toFixed(1)}k`
  return `${sign}${SYMBOL}${abs.toFixed(2)}`
}
