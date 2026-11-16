// Declarative only: no expressions, property paths or executable definitions.
export function visibleFormKeys(
  fields: readonly {
    key: string;
    condition?: { field: string; includes: string };
  }[],
  answers: Readonly<Record<string, unknown>>,
) {
  const visible = new Set<string>();
  for (const field of fields) {
    const condition = field.condition;
    if (!condition) {
      visible.add(field.key);
      continue;
    }
    if (!visible.has(condition.field)) continue;
    const value = Object.hasOwn(answers, condition.field)
      ? answers[condition.field]
      : undefined;
    if (
      Array.isArray(value)
        ? value.includes(condition.includes)
        : typeof value === 'string'
          ? value.includes(condition.includes)
          : typeof value === 'boolean' || typeof value === 'number'
            ? String(value) === condition.includes
            : false
    )
      visible.add(field.key);
  }
  return visible;
}
