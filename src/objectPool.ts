export type ObjectPoolOptions<T> = {
  /** Allocates a new item. Used to pre-warm and when the free list is empty. */
  create: () => T
  /** Restores an item to an idle reusable state. Called by `release`. */
  reset?: (item: T) => void
  /** How many items to allocate immediately. The pool grows past this if exhausted. */
  initialSize?: number
}

/**
 * Reusable free-list of `T`. Pre-warms `initialSize` items and grows by calling
 * `create` when `acquire` finds the list empty.
 *
 * Construct after the engine can allocate entities (typically inside a `setup*` function).
 */
export class ObjectPool<T> {
  private readonly free: T[] = []
  private readonly createItem: () => T
  private readonly resetItem: ((item: T) => void) | undefined

  constructor(options: ObjectPoolOptions<T>) {
    this.createItem = options.create
    this.resetItem = options.reset
    const initialSize = options.initialSize ?? 0
    for (let i = 0; i < initialSize; i++) {
      this.free.push(this.createItem())
    }
  }

  acquire(): T {
    return this.free.pop() ?? this.createItem()
  }

  release(item: T): void {
    try {
      this.resetItem?.(item)
    } finally {
      this.free.push(item)
    }
  }
}
