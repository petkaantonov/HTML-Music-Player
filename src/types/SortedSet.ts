type Comparator<T> = (a: T | undefined, b: T | undefined) => number;
const BLACK = true;
const RED = false;

function defaultComparer<T>(a: T, b: T) {
    //primitive or obj with .valueOf() returning primitive
    if (a < b) {
        return -1;
    }
    if (a > b) {
        return 1;
    }
    return 0;
}

interface NullNode {
    left: undefined;
    right: undefined;
    parent: undefined;
    key: undefined;
    value: undefined;
    color: typeof BLACK;
    subtreeCount: 0;
}
const NIL: NullNode = {
    left: undefined,
    right: undefined,
    parent: undefined,
    key: undefined,
    value: undefined,
    color: BLACK,
    subtreeCount: 0,
};

type AnyNode<K, V> = RedBlackNode<K, V> | NullNode;
type MaybeNode<K, V> = AnyNode<K, V> | undefined;
type MaybeRedBlackNode<K, V> = RedBlackNode<K, V> | undefined;

class RedBlackNode<K, V> {
    left: AnyNode<K, V> | undefined;
    right: AnyNode<K, V> | undefined;
    parent: RedBlackNode<K, V> | undefined;
    key: K;
    value: V;
    color: boolean;
    subtreeCount: number;

    constructor(key: K, value: V, parent?: RedBlackNode<K, V>) {
        this.left = NIL;
        this.right = NIL;
        this.parent = parent;
        this.key = key;
        this.value = value;
        this.color = RED;
        this.subtreeCount = 1;
    }

    getUncle() {
        const gp = this.getGrandparent();

        if (!gp) {
            return NIL;
        }

        if (gp.left === this.parent) {
            return gp.right;
        } else if (gp.right === this.parent) {
            return gp.left;
        } else {
            return NIL;
        }
    }

    getGrandparent() {
        if (this.parent && this.parent.parent) {
            return this.parent.parent;
        }
        return undefined;
    }

    isRightChild() {
        return !!(this.parent && this.parent.right === this);
    }

    isLeftChild() {
        return !!(this.parent && this.parent.left === this);
    }

    setLeftChild(node?: AnyNode<K, V>) {
        this.left = node;
        if (node && node !== NIL) {
            node.parent = this;
        }
    }
    setRightChild(node?: AnyNode<K, V>) {
        this.right = node;
        if (node && node !== NIL) {
            node.parent = this;
        }
    }
    getSuccessor(this: RedBlackNode<K, V>) {
        if (this.right !== NIL) {
            let node: AnyNode<K, V> | undefined = this.right;
            while (node!.left !== NIL) {
                node = node!.left;
            }
            return node;
        } else {
            let parent = this.parent;
            // eslint-disable-next-line @typescript-eslint/no-this-alias
            let firstLeft: AnyNode<K, V> | undefined = this;

            while (firstLeft!.isRightChild()) {
                firstLeft = parent;
                parent = parent!.parent;
            }

            return parent || undefined;
        }
    }

    getPrecedessor(this: RedBlackNode<K, V>) {
        if (this.left !== NIL) {
            let node: AnyNode<K, V> | undefined = this.left;
            while (node!.right !== NIL) {
                node = node!.right;
            }
            return node;
        } else {
            let parent = this.parent;
            // eslint-disable-next-line @typescript-eslint/no-this-alias
            let firstRight: AnyNode<K, V> | undefined = this;

            while (firstRight!.isLeftChild()) {
                firstRight = parent;
                parent = parent!.parent;
            }

            return parent || null;
        }
    }

    rotateLeft() {
        const right = this.right as RedBlackNode<K, V>,
            parent = this.parent!;

        this.setRightChild(right!.left);

        if (this.isRightChild()) {
            parent.setRightChild(right);
        } else if (this.isLeftChild()) {
            parent.setLeftChild(right);
        } else {
            right.parent = undefined;
        }

        right.setLeftChild(this);

        this.subtreeCount = 1 + this.left!.subtreeCount + this.right!.subtreeCount;
        right.subtreeCount = 1 + right.left!.subtreeCount + right.right!.subtreeCount;
    }

    rotateRight() {
        const left = this.left as RedBlackNode<K, V>,
            parent = this.parent!;

        this.setLeftChild(left.right);

        if (this.isRightChild()) {
            parent.setRightChild(left);
        } else if (this.isLeftChild()) {
            parent.setLeftChild(left);
        } else {
            left.parent = undefined;
        }

        left.setRightChild(this);

        this.subtreeCount = 1 + this.left!.subtreeCount + this.right!.subtreeCount;
        left.subtreeCount = 1 + left.left!.subtreeCount + left.right!.subtreeCount;
    }
}

class RedBlackTree<K, V> {
    root?: RedBlackNode<K, V>;
    length: number;
    modCount: number;
    readonly comparator: Comparator<K>;
    constructor(comparator?: Comparator<K>) {
        this.root = undefined;
        this.length = 0;
        this.comparator = comparator || defaultComparer;
        this.modCount = 0;
    }

    size() {
        return this.length;
    }

    updateRootReference() {
        let cur = this.root;
        if (cur && cur.parent) {
            while ((cur = cur.parent)) {
                if (!cur.parent) {
                    this.root = cur;
                    break;
                }
            }
        }
    }

    modified() {
        this.modCount++;
    }

    clear() {
        this.modified();
        this.root = undefined;
        this.length = 0;
    }

    set(key: K | RedBlackNode<K, V>, value: V) {
        this.modified();

        const node = key instanceof RedBlackNode ? key : this.nodeByKey(key);
        let ret: V | undefined = void 0;

        if (node) {
            ret = node.value;
            node.value = value;
        } else {
            this.insert(key as K, value);
        }
        return ret;
    }

    setAt(index: number, value: V) {
        const node = this.nodeByIndex(index);

        if (node) {
            return this.set(node, value);
        }
        return undefined;
    }

    unsetAt(index: number) {
        const node = this.nodeByIndex(index);

        if (node) {
            return this.unset(node);
        }
        return undefined;
    }

    unset(key: K | RedBlackNode<K, V>) {
        this.modified();
        const node = key instanceof RedBlackNode ? key : this.nodeByKey(key);

        if (node) {
            const newRoot = treeRemove(this.root, node);
            this.length--;
            if (newRoot !== void 0) {
                this.root = newRoot;
            } else {
                this.updateRootReference();
            }
            return node;
        }
        return undefined;
    }

    nodeByKetAtLeast(key: K) {
        return this.greaterKeys(key, true);
    }

    nodeByGreaterKey(key: K) {
        return this.greaterKeys(key, false);
    }

    nodeByKetAtMost(key: K) {
        return this.lesserKeys(key, true);
    }

    nodeByLesserKey(key: K) {
        return this.lesserKeys(key, false);
    }

    greaterKeys(key: K, inclusive: boolean) {
        let node: MaybeNode<K, V> = this.root;

        while (node && node !== undefined) {
            const comp = this.comparator(node.key, key);

            if (inclusive && comp === 0) {
                return node;
            } //node's key is greater than input key
            else if (comp > 0) {
                //there is also no lesser keys

                if (node.left === undefined) {
                    return node;
                } else {
                    node = node.left;
                }
            } else {
                //node's key is less, try to find a greater key
                if (node.right !== undefined) {
                    node = node.right;
                } else {
                    //second greatest node in the tree
                    //return greatest or undefined
                    return (node as RedBlackNode<K, V>).getSuccessor() || void 0;
                }
            }
        }
        return void 0;
    }

    lesserKeys(key: K, inclusive: boolean) {
        let node: MaybeNode<K, V> = this.root;

        while (node && node !== undefined) {
            const comp = this.comparator(node.key, key);

            if (inclusive && comp === 0) {
                return node;
            } //node's key is less than input key
            else if (comp < 0) {
                //there is also no greater keys
                if (node.right === undefined) {
                    return node;
                } else {
                    node = node.right;
                }
            } else {
                //node's key is equal or greater, go for backingNode
                if (node.left !== undefined) {
                    node = node.left;
                } else {
                    //second least node in the tree
                    //return least or undefined
                    return (node as RedBlackNode<K, V>).getPrecedessor() || void 0;
                }
            }
        }
        return void 0;
    }

    nodeByKey(key: K): MaybeRedBlackNode<K, V> {
        let node: AnyNode<K, V> | undefined = this.root;

        if (!node) {
            return void 0;
        }

        while (node !== undefined) {
            const comp = this.comparator(node.key, key);
            if (comp === 0) {
                return node as RedBlackNode<K, V>;
            } else {
                node = comp > 0 ? node.left : node.right;
            }
        }
        return void 0;
    }

    indexOfNode(node?: RedBlackNode<K, V>) {
        if (!node) {
            return -1;
        }

        const ret = rank(this.root, node);
        if (ret) {
            return ret - 1;
        }
        return -1;
    }

    indexOfKey(key: K) {
        return this.indexOfNode(this.nodeByKey(key));
    }

    nodeByIndex(index: number) {
        if (index < 0) {
            index = index + this.length;
        }
        if (index < 0) {
            return this.firstNode();
        }
        if (index >= this.length) {
            return this.lastNode();
        }

        //OS-Select indexing is 1-based
        return nthNode(this.root, index + 1);
    }

    firstNode(): MaybeRedBlackNode<K, V> {
        let cur: MaybeNode<K, V> = this.root,
            prev;

        if (!cur) {
            return void 0;
        }

        while (cur !== undefined) {
            prev = cur;
            cur = cur.left;
        }
        return prev as MaybeRedBlackNode<K, V>;
    }

    lastNode(): MaybeRedBlackNode<K, V> {
        let cur: MaybeNode<K, V> = this.root,
            prev;

        if (!cur) {
            return void 0;
        }

        while (cur !== undefined) {
            prev = cur;
            cur = cur.right;
        }
        return prev as MaybeRedBlackNode<K, V>;
    }

    insert(key: K, value: V) {
        let node = new RedBlackNode(key, value);
        if (!this.root) {
            this.root = node;
            this.length = 1;
            node.color = BLACK;
        } else if (treeInsert(this.comparator, this.root, node)) {
            this.length++;
            while (node.parent && node.parent.color === RED) {
                const uncle = node.getUncle()!;
                const parent = node.parent;
                let grandparent = node.getGrandparent();

                if (uncle.color === RED) {
                    parent.color = BLACK;
                    uncle.color = BLACK;
                    grandparent!.color = RED;
                    node = grandparent!;
                    continue;
                }

                if (parent.isLeftChild()) {
                    if (node.isRightChild()) {
                        node = node.parent;
                        node.rotateLeft();
                    }

                    node.parent!.color = BLACK;
                    grandparent = node.getGrandparent()!;
                    grandparent.color = RED;
                    grandparent.rotateRight();
                } else if (parent.isRightChild()) {
                    if (node.isLeftChild()) {
                        node = node.parent;
                        node.rotateRight();
                    }
                    node.parent!.color = BLACK;
                    grandparent = node.getGrandparent()!;
                    grandparent.color = RED;
                    grandparent.rotateLeft();
                }
            }
            this.updateRootReference();
            this.root.color = BLACK;
        }
    }

    *[Symbol.iterator](): IterableIterator<[K, V]> {
        const modCount = this.modCount;
        let node: MaybeNode<K, V> = this.firstNode();
        while (node !== undefined) {
            yield [node.key as K, node.value as V];
            if (this.modCount !== modCount) {
                throw new Error("cannot modify while iterating");
            }
            node = (node as RedBlackNode<K, V>).getSuccessor();
            if (node === NIL) {
                return;
            }
        }
    }
}
const rotateWords = {
    left: "rotateLeft" as const,
    right: "rotateRight" as const,
};

const LEFT = "left",
    RIGHT = "right";

function treeRemoveFix<K, V>(root: MaybeRedBlackNode<K, V>, node: RedBlackNode<K, V>) {
    while (node.color === BLACK && node !== root) {
        const isLeft = node.isLeftChild(),
            dir = isLeft ? LEFT : RIGHT, //Avoid duplicating the symmetry
            rotateDir = rotateWords[dir],
            oppositeDir = isLeft ? RIGHT : LEFT,
            rotateOppositeDir = rotateWords[oppositeDir];

        const parent = node.parent!;
        let sibling = parent[oppositeDir]!;

        if (sibling.color === RED) {
            sibling.color = BLACK;
            parent.color = RED;
            parent[rotateDir]();
            sibling = parent[oppositeDir]!;
        }

        if (sibling[dir]!.color === BLACK && sibling[oppositeDir]!.color === BLACK) {
            sibling.color = RED;
            node = node.parent!;
        } else {
            if (sibling[oppositeDir]!.color === BLACK) {
                sibling[dir]!.color = BLACK;
                sibling.color = RED;
                (sibling as RedBlackNode<K, V>)[rotateOppositeDir]();
                sibling = node.parent![oppositeDir]!;
            }

            sibling.color = node.parent!.color;
            node.parent!.color = BLACK;
            sibling[oppositeDir]!.color = BLACK;
            (node.parent as RedBlackNode<K, V>)[rotateDir]();
            node = root!;
        }
    }
    node.color = BLACK;
}

//Return new value for root, undefined otherwise
function treeRemove<K, V>(root: MaybeRedBlackNode<K, V>, node: RedBlackNode<K, V>): MaybeRedBlackNode<K, V> {
    let current: MaybeNode<K, V>, successor: MaybeNode<K, V>;

    if (node.left !== undefined && node.right !== undefined) {
        successor = node.getSuccessor()!;
        node.key = successor.key!;
        node.value = successor.value!;
        node = successor as RedBlackNode<K, V>;
    }

    if (node.left !== undefined) {
        current = node.left;
    } else {
        current = node.right;
    }

    if (current !== undefined) {
        const parent = node.parent!;

        if (node.isLeftChild()) {
            parent.setLeftChild(current);
        } else if (node.isRightChild()) {
            parent.setRightChild(current);
        }

        node.left = node.right = undefined;

        let upd: MaybeNode<K, V> = current;
        while (upd) {
            upd.subtreeCount = upd.left!.subtreeCount + upd.right!.subtreeCount + 1;
            upd = upd.parent;
        }

        if (node.color === BLACK) {
            treeRemoveFix((parent ? root : current) as RedBlackNode<K, V>, current as RedBlackNode<K, V>);
        }

        if (!parent) {
            current.parent = undefined;
            return current as RedBlackNode<K, V>;
        }
    } else if (!node.parent) {
        return undefined;
    } else {
        if (node.color === BLACK) {
            treeRemoveFix(root, node);
        }

        if (node.isLeftChild()) {
            node.parent.setLeftChild(undefined);
        } else if (node.isRightChild()) {
            node.parent.setRightChild(undefined);
        }

        let upd: MaybeNode<K, V> = node;
        while (upd) {
            upd.subtreeCount = upd.left!.subtreeCount + upd.right!.subtreeCount + 1;
            upd = upd.parent;
        }
        return undefined;
    }
    return undefined;
}

//Return true if the node was inserted into the tree, false otherwise
function treeInsert<K, V>(fn: Comparator<K>, root: MaybeNode<K, V>, node: RedBlackNode<K, V>) {
    while (root && root !== undefined) {
        const comp = fn(root.key, node.key);

        if (comp === 0) {
            return false;
        }
        root.subtreeCount++;
        if (comp > 0) {
            if (root.left === undefined) {
                (root as RedBlackNode<K, V>).setLeftChild(node);
                return true;
            } else {
                root = root.left;
            }
        } else {
            if (root.right === undefined) {
                (root as RedBlackNode<K, V>).setRightChild(node);
                return true;
            } else {
                root = root.right;
            }
        }
    }
    return false;
}

//1-based indexing
function nthNode<K, V>(root: MaybeNode<K, V>, n: number): MaybeRedBlackNode<K, V> {
    while (root && root !== undefined) {
        const r = root.left!.subtreeCount + 1;
        if (n === r) {
            return root as MaybeRedBlackNode<K, V>;
        }

        if (n < r) {
            root = root.left;
        } else {
            n -= r;
            root = root.right;
        }
    }
    return void 0;
}

function rank<K, V>(root: MaybeRedBlackNode<K, V>, node: MaybeRedBlackNode<K, V>) {
    if (!root || root === undefined) {
        return void 0;
    }
    if (!node || node === undefined) {
        return void 0;
    }
    let i = node.left!.subtreeCount + 1;

    while (node !== root) {
        if (node!.isRightChild()) {
            i += node!.parent!.left!.subtreeCount + 1;
        }
        node = node!.parent;
    }
    return i;
}

export default class SortedSet<T> {
    private _tree: RedBlackTree<T, boolean>;

    constructor(comparator?: Comparator<T>);
    constructor(values: T[], comparator?: Comparator<T>);
    constructor(values: any, comparator?: any) {
        if (typeof values === "function") {
            const tmp = comparator;
            comparator = values;
            values = tmp;
        }

        if (typeof comparator !== "function") {
            comparator = defaultComparer;
        }

        this._tree = new RedBlackTree(comparator);

        if (Array.isArray(values)) {
            this.addAll(values);
        }
    }

    toArray() {
        const ret = new Array<T>(this._tree!.size());
        let i = 0;
        for (const [key] of this._tree!) {
            ret[i++] = key;
        }
        return ret;
    }

    values() {
        return this.toArray();
    }

    clear() {
        return this._tree.clear();
    }

    contains(value: T): boolean {
        return this._tree.nodeByKey(value) !== undefined;
    }

    first() {
        const node = this._tree.firstNode();
        return node !== undefined ? node.key : undefined;
    }

    last() {
        const node = this._tree.lastNode();
        return node !== undefined ? node.key : undefined;
    }

    size() {
        return this._tree.size();
    }

    get(i: number) {
        const node = this._tree.nodeByIndex(i);
        return node !== undefined ? node.key : undefined;
    }

    isEmpty() {
        return this.size() === 0;
    }

    add(value: T) {
        this._tree.insert(value, true);
    }

    addAll(values: T[]) {
        for (const v of values) {
            this.add(v);
        }
    }

    clone() {
        return new SortedSet(this.values());
    }

    remove(value: T) {
        const node = this._tree.unset(value);
        return node !== undefined ? node.key : undefined;
    }

    subsetOf(set: SortedSet<T>) {
        for (const [key] of this._tree) {
            if (!set.contains(key)) {
                return false;
            }
        }
        return this.size() < set.size();
    }

    supersetOf(set: SortedSet<T>) {
        return set.subsetOf(this);
    }

    allContainedIn(set: SortedSet<T>) {
        for (const [key] of this._tree) {
            if (!set.contains(key)) {
                return false;
            }
        }
        return true;
    }

    containsAll(set: SortedSet<T>) {
        return set.allContainedIn(this);
    }

    union(a: SortedSet<T>) {
        const ret = new SortedSet(this._tree.comparator);

        for (const [i] of a._tree) {
            ret.add(i);
        }

        for (const [i] of this._tree) {
            ret.add(i);
        }

        return ret;
    }

    intersection(a: SortedSet<T>) {
        const ret = new SortedSet(this._tree.comparator);
        const src = this.size() < a.size() ? this : a;
        const dst = src === a ? this : a;

        for (const [i] of src._tree) {
            if (dst.contains(i)) {
                ret.add(i);
            }
        }
        return ret;
    }

    complement(a: SortedSet<T>) {
        const ret = new SortedSet(this._tree.comparator);

        for (const [i] of this._tree) {
            if (!a.contains(i)) {
                ret.add(i);
            }
        }

        return ret;
    }

    difference(a: SortedSet<T>) {
        const ret = this.union(a);
        const tmp = this.intersection(a);

        for (const [i] of tmp._tree) {
            ret.remove(i);
        }

        return ret;
    }

    *[Symbol.iterator](): IterableIterator<T> {
        for (const [i] of this._tree) {
            yield i;
        }
    }
}
