export function formatMetricChange(
  current: number | null,
  previous: number | null,
  unit: "min" | "pp" | "turns",
  lowerIsBetter = false,
) {
  if (current === null || previous === null) return null;
  const delta = Math.round((current - previous) * 10) / 10;
  const direction = delta > 0 ? "Higher" : delta < 0 ? "Lower" : "Unchanged";
  return {
    text: delta === 0 ? "Unchanged vs previous" : `${direction} by ${Math.abs(delta)} ${unit} vs previous`,
    tone: !lowerIsBetter || delta === 0 ? "neutral" : delta < 0 ? "positive" : "negative",
  } as const;
}
