export function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000;
    return `€ ${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `€ ${Math.round(amount / 1_000)}K`;
  }
  return `€ ${amount.toLocaleString('pt-BR')}`;
}

export function formatWage(weekly: number): string {
  if (weekly >= 1_000) {
    return `€ ${Math.round(weekly / 1_000)}K/sem`;
  }
  return `€ ${weekly}/sem`;
}
