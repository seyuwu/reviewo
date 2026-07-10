export function moveDraftItemToIndex<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex < 0 ||
    fromIndex >= items.length ||
    toIndex < 0 ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);

  if (!moved) {
    return items;
  }

  next.splice(toIndex, 0, moved);

  return next;
}

export function moveDraftItemToPosition<T>(
  items: T[],
  fromIndex: number,
  position: number
): T[] {
  if (items.length === 0) {
    return items;
  }

  const toIndex = Math.min(Math.max(Math.round(position), 1), items.length) - 1;

  return moveDraftItemToIndex(items, fromIndex, toIndex);
}
