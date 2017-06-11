

import {merge as mergeSorted,
         insert as insertSorted,
         remove as removeSorted} from "search/sortedArrays";

const RED = -1;
const BLACK = 1;

const compareStrings = function(a, b) {
    const aLen = a.length;
    const bLen = b.length;
    const length = Math.min(aLen, bLen);

    for (let i = 0; i < length; ++i) {
        const aChar = a.charCodeAt(i);
        const bChar = b.charCodeAt(i);

        if (aChar === bChar) {
            continue;
        } else if (aChar < bChar) {
            return -1;
        } else {
            return 1;
        }
    }

    if (aLen === bLen) {
        return 0;
    } else if (aLen < bLen) {
        return -1;
    } else {
        return 1;
    }
};

const compareStringsLcp = function(ref, a, b) {
    const aLen = a.length;
    const bLen = b.length;
    const length = Math.min(aLen, bLen);
    let lcp = 0;

    for (let i = 0; i < length; ++i) {
        const aChar = a.charCodeAt(i);
        const bChar = b.charCodeAt(i);

        if (aChar === bChar) {
            lcp++;
            continue;
        } else {
            ref.lcp = lcp;
            return aChar < bChar ? -1 : 1;
        }
    }
    ref.lcp = lcp;
    if (aLen === bLen) {
        return 0;
    } else if (aLen < bLen) {
        return -1;
    } else {
        return 1;
    }
};

function Node(word) {
    this.left = null;
    this.right = null;
    this.word = word;
    this.parent = null;
    this.color = RED;
    this.values = [];
}
const NULL = new Node(``);
NULL.color = BLACK;

Node.prototype.add = function(value, comparer) {
    insertSorted(comparer, this.values, value);
};

Node.prototype.remove = function(value, comparer) {
    removeSorted(comparer, this.values, value);
};

Node.prototype.length = function() {
    return this.values.length;
};

Node.prototype.uncle = function() {
    const gp = this.grandParent();
    if (gp === null) {
        return NULL;
    }

    if (gp.left === this.parent) {
        return gp.right;
    } else if (gp.right === this.parent) {
        return gp.left;
    }

    return NULL;
};

Node.prototype.grandParent = function() {
    const {parent} = this;
    if (parent === null) return null;
    return parent.parent;
};

Node.prototype.isRightChild = function() {
    const {parent} = this;
    return parent !== null && parent.right === this;
};

Node.prototype.isLeftChild = function() {
    const {parent} = this;
    return parent !== null && parent.left === this;
};

Node.prototype.setLeftChild = function(node) {
    if (node === null) node = NULL;
    this.left = node;
    if (node !== NULL) node.parent = this;
};

Node.prototype.setRightChild = function(node) {
    if (node === null) node = NULL;
    this.right = node;
    if (node !== NULL) node.parent = this;
};

Node.prototype.successor = function() {
    let node = this.right;
    if (node !== NULL) {
        while (node.left !== NULL) {
            node = node.left;
        }
        return node;
    } else {
        let {parent} = this;
        /* eslint-disable consistent-this */
        let firstLeft = this;
        /* eslint-enable consistent-this */

        while (firstLeft.isRightChild()) {
            firstLeft = parent;
            /* eslint-disable prefer-destructuring */
            parent = parent.parent;
            /* eslint-enable prefer-destructuring */
        }

        return parent;
    }
};

Node.prototype.precedessor = function() {
    let node = this.left;
    if (node !== NULL) {
        while (node.right !== NULL) {
            node = node.right;
        }
        return node;
    } else {
        let {parent} = this;
        /* eslint-disable consistent-this */
        let firstRight = this;
        /* eslint-enable consistent-this */

        while (firstRight.isLeftChild()) {
            firstRight = parent;
            /* eslint-disable prefer-destructuring */
            parent = parent.parent;
            /* eslint-enable prefer-destructuring */
        }

        return parent;
    }
};

Node.prototype.rotateLeft = function() {
    const {right, parent} = this;
    this.setRightChild(right.left);

    if (this.isRightChild()) {
        parent.setRightChild(right);
    } else if (this.isLeftChild()) {
        parent.setLeftChild(right);
    } else {
        right.parent = null;
    }

    right.setLeftChild(this);
};

Node.prototype.rotateRight = function() {
    const {left, parent} = this;

    this.setLeftChild(left.right);

    if (this.isRightChild()) {
        parent.setRightChild(left);
    } else if (this.isLeftChild()) {
        parent.setLeftChild(left);
    } else {
        left.parent = null;
    }

    left.setRightChild(this);
};

Node.prototype.putValues = function(sortedArray, comparer) {
    mergeSorted(comparer, sortedArray, this.values);
};

const mkNode = function(word, value, comparer) {
    const ret = new Node(word);
    ret.add(value, comparer);
    ret.left = ret.right = NULL;
    return ret;
};

export default function SearchTree(valueComparer) {
    this._length = 0;
    this._root = null;
    this._valueComparer = valueComparer;
    this.lcp = 0;
}

SearchTree.prototype.insert = function(word, value) {
    this._insertNode(word, value);
};

SearchTree.prototype._searchPrecedessors = function(node, word, results) {
    while (node !== null) {
        compareStringsLcp(this, node.word, word);
        const {lcp} = this;
        if (lcp > 0) {
            if (word.length === lcp) {
                node.putValues(results, this._valueComparer);
            }
            node = node.precedessor();
        } else {
            break;
        }
    }
};

SearchTree.prototype._searchSuccessors = function(node, word, results) {
    while (node !== null) {
        compareStringsLcp(this, node.word, word);
        const {lcp} = this;
        if (lcp > 0) {
            if (word.length === lcp) {
                node.putValues(results, this._valueComparer);
            }
            node = node.successor();
        } else {
            break;
        }
    }
};

SearchTree.prototype.search = function(word) {
    let node = this._root;
    if (node === null) return [];
    const results = [];
    while (node !== NULL) {
        const result = compareStringsLcp(this, node.word, word);
        const {lcp} = this;
        if (lcp > 0) {
            if (word.length === lcp) {
                node.putValues(results, this._valueComparer);
            }
            this._searchPrecedessors(node.precedessor(), word, results);
            this._searchSuccessors(node.successor(), word, results);
            return results;
        } else if (result < 0) {
            node = node.right;
        } else {
            node = node.left;
        }
    }

    return results;
};

SearchTree.prototype._refreshRoot = function() {
    let prev = this._root;
    if (prev !== null) {
        let next = prev.parent;
        while (true) {
            if (next === null) {
                this._root = prev;
                return;
            }
            prev = next;
            next = next.parent;
        }
    }
};

SearchTree.prototype.remove = function(word, value) {
    const node = this._nodeByExactWord(word);

    if (node) {
        node.remove(value, this._valueComparer);
        if (node.length() === 0) {
            this._removeNode(node);
        }
    }
};

SearchTree.prototype._nodeByExactWord = function(word) {
    let node = this._root;
    if (node === null) return null;

    while (node !== NULL) {
        const result = compareStrings(node.word, word);

        if (result === 0) {
            return node;
        } else if (result < 0) {
            node = node.right;
        } else {
            node = node.left;
        }
    }

    return null;
};

SearchTree.prototype._insertNode = function(word, value) {
    let node = null;
    let root = this._root;
    this._length++;
    if (root === null) {
        this._root = mkNode(word, value, this._valueComparer);
        this._root.color = BLACK;
        return;
    }

    while (true) {
        const result = compareStrings(root.word, word);

        if (result > 0) {
            const {left} = root;
            if (left === NULL) {
                node = mkNode(word, value, this._valueComparer);
                root.setLeftChild(node);
                break;
            } else {
                root = left;
            }
        } else if (result < 0) {
            const {right} = root;
            if (right === NULL) {
                node = mkNode(word, value, this._valueComparer);
                root.setRightChild(node);
                break;
            } else {
                root = right;
            }
        } else {
            root.add(value, this._valueComparer);
            return;
        }
    }

    while (node.parent !== null && node.parent.color === RED) {
        const uncle = node.uncle();
        let grandParent = node.grandParent();
        const {parent} = node;

        if (uncle.color === RED) {
            parent.color = BLACK;
            uncle.color = BLACK;
            grandParent.color = RED;
            node = grandParent;
            continue;
        }

        if (parent.isLeftChild()) {
            if (node.isRightChild()) {
                node = node.parent;
                node.rotateLeft();
            }

            node.parent.color = BLACK;

            grandParent = node.grandParent();
            grandParent.color = RED;
            grandParent.rotateRight();
        } else if (parent.isRightChild()) {
            if (node.isLeftChild()) {
                node = node.parent;
                node.rotateRight();
            }

            node.parent.color = BLACK;
            grandParent = node.grandParent();
            grandParent.color = RED;
            grandParent.rotateLeft();
        }
    }

    this._refreshRoot();
    this._root.color = BLACK;
};

SearchTree.prototype._rebalanceLeft = function(root, node) {
    const {parent} = node;
    let sibling = parent.right;

    if (sibling.color === RED) {
        sibling.color = BLACK;
        parent.color = RED;
        parent.rotateLeft();
        sibling = parent.right;
    }

    if (sibling.left.color === BLACK && sibling.right.color === BLACK) {
        sibling.color = RED;
        return node.parent;
    } else {
        if (sibling.right.color === BLACK) {
            sibling.left.color = BLACK;
            sibling.color = RED;
            sibling.rotateRight();
            sibling = node.parent.right;
        }

        sibling.color = node.parent.color;
        node.parent.color = BLACK;
        sibling.right.color = BLACK;
        node.parent.rotateLeft();
        return root;
    }
};

SearchTree.prototype._rebalanceRight = function(root, node) {
    const {parent} = node;
    let sibling = parent.left;

    if (sibling.color === RED) {
        sibling.color = BLACK;
        parent.color = RED;
        parent.rotateRight();
        sibling = parent.left;
    }

    if (sibling.right.color === BLACK && sibling.left.color === BLACK) {
        sibling.color = RED;
        return node.parent;
    } else {
        if (sibling.left.color === BLACK) {
            sibling.right.color = BLACK;
            sibling.color = RED;
            sibling.rotateLeft();
            sibling = node.parent.left;
        }

        sibling.color = node.parent.color;
        node.parent.color = BLACK;
        sibling.left.color = BLACK;
        node.parent.rotateRight();
        return root;
    }
};

SearchTree.prototype._rebalanceTree = function(root, node) {
    while (node.color === BLACK && node !== root) {
        if (node.isLeftChild()) {
            node = this._rebalanceLeft(root, node);
        } else {
            node = this._rebalanceRight(root, node);
        }
    }
    node.color = BLACK;
};

SearchTree.prototype._removeNode = function(node) {
    this._length--;
    const newRoot = this._doRemoveNode(node);
    if (newRoot !== null) {
        this._root = newRoot;
    } else {
        this._refreshRoot();
    }
};

SearchTree.prototype._doRemoveNode = function(node) {
    const root = this._root;
    let current, successor;

    if (node.left !== NULL &&
        node.right !== NULL) {
        successor = node.successor();
        node.word = successor.word;
        node.values = successor.values;
        node = successor;
    }

    if (node.left !== NULL) {
        current = node.left;
    } else {
        current = node.right;
    }

    if (current !== NULL) {
        const {parent} = node;

        if (node.isLeftChild()) {
            parent.setLeftChild(current);
        } else if (node.isRightChild()) {
            parent.setRightChild(current);
        }

        node.left = node.right = NULL;

        if (node.color === BLACK) {
            this._rebalanceTree(parent !== null ? root : current, current);
        }

        if (parent === null) {
            current.parent = null;
            return current;
        }
    } else if (node.parent !== null) {
        if (node.color === BLACK) {
            this._rebalanceTree(root, node);
        }

        if (node.isLeftChild()) {
            node.parent.setLeftChild(null);
        } else if (node.isRightChild()) {
            node.parent.setRightChild(null);
        }
    }
    return null;
};
