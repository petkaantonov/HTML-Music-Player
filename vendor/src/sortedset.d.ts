type Sorter<T> = (a: T, B: T) => number;

interface SetIterator<T> {
    next: () => boolean;
    prev: () => boolean;
    moveToStart: () => void;
    moveToEnd: () => void;
    remove: () => T
    value: T;
    index: number;
}

export class SortedSet<T> {
    constructor(sorter: Sorter<T>);
    contains(value: T): boolean;
    iterator(): SetIterator<T>;
    clear(): void;
    add(value: T): void;
    isEmpty(): boolean;
    last(): T | undefined;
    first(): T | undefined;
    size(): number;
    get(i: number): T | undefined;
    remove(value: T): T | undefined;
    toArray(): T[];
}
export class SortedMap {
    constructor();
}
