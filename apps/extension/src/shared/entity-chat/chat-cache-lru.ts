export interface LruMapEntry<T> {
  key: string;
  value: T;
}

export class LruMap<T> {
  private readonly entries = new Map<string, T>();

  constructor(private readonly maxEntries: number) {}

  get size(): number {
    return this.entries.size;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  get(key: string): T | undefined {
    const value = this.entries.get(key);

    if (value === undefined) {
      return undefined;
    }

    this.touch(key, value);
    return value;
  }

  set(key: string, value: T, onEvict?: (key: string, value: T) => void): void {
    if (this.entries.has(key)) {
      this.entries.delete(key);
    }

    this.entries.set(key, value);
    this.evictOverflow(onEvict);
    this.touch(key, value);
  }

  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  clear(onEvict?: (key: string, value: T) => void): void {
    if (onEvict) {
      for (const [key, value] of this.entries.entries()) {
        onEvict(key, value);
      }
    }

    this.entries.clear();
  }

  values(): IterableIterator<T> {
    return this.entries.values();
  }

  private touch(key: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, value);
  }

  private evictOverflow(onEvict?: (key: string, value: T) => void): void {
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;

      if (typeof oldestKey !== "string") {
        return;
      }

      const oldestValue = this.entries.get(oldestKey);

      if (oldestValue === undefined) {
        this.entries.delete(oldestKey);
        continue;
      }

      this.entries.delete(oldestKey);
      onEvict?.(oldestKey, oldestValue);
    }
  }
}
