"use strict";

const sortedArrays = require("lib/sortedArrays");

const RED = -1;
const BLACK = 1;

const compareStrings = function(a, b) {
    const aLen = a.length;
    const bLen = b.length;
    const length = Math.min(aLen, bLen);

    for (var i = 0; i < length; ++i) {
        var aChar = a.charCodeAt(i);
        var bChar = b.charCodeAt(i);

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
    var lcp = 0;

    for (var i = 0; i < length; ++i) {
        var aChar = a.charCodeAt(i);
        var bChar = b.charCodeAt(i);

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

Node.prototype.add = function(value, comparer) {
    sortedArrays.insert(comparer, this.values, value);
};

Node.prototype.remove = function(value, comparer) {
    sortedArrays.remove(comparer, this.values, value);
};

Node.prototype.length = function() {
    return this.values.length;
};

Node.prototype.uncle = function() {
    var gp = this.grandParent();
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
    var parent = this.parent;
    if (parent === null) return null;
    return parent.parent;
};

Node.prototype.isRightChild = function() {
    var parent = this.parent;
    return parent !== null && parent.right === this;
};

Node.prototype.isLeftChild = function() {
    var parent = this.parent;
    return parent !== null && parent.left === this;
};

Node.prototype.setLeftChild = function(node) {
    this.left = node;
    if (node !== NULL) node.parent = this;
};

Node.prototype.setRightChild = function(node) {
    this.right = node;
    if (node !== NULL) node.parent = this;
};

Node.prototype.successor = function() {
    var node = this.right;
    if (node !== NULL) {
        while (node.left !== NULL) {
            node = node.left;
        }
        return node;
    } else {
        var parent = this.parent;
        var firstLeft = this;

        while (firstLeft.isRightChild()) {
            firstLeft = parent;
            parent = parent.parent;
        }

        return parent;
    }
};

Node.prototype.precedessor = function() {
    var node = this.left;
    if (node !== NULL) {
        while (node.right !== NULL) {
            node = node.right;
        }
        return node;
    } else {
        var parent = this.parent;
        var firstRight = this;

        while (firstRight.isLeftChild()) {
            firstRight = parent;
            parent = parent.parent;
        }

        return parent;
    }
};

Node.prototype.rotateLeft = function() {
    var right = this.right;
    var parent = this.parent;

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
    var left = this.left;
    var parent = this.parent;

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
    sortedArrays.merge(comparer, sortedArray, this.values);
};

const spaces = function(level) {
    var ret = "";
    for (var i = 0; i < level; ++i) {
        ret += "  ";
    }
    return ret;
};

const NULL = new Node("");
NULL.color = BLACK;

const mkNode = function(word, value, comparer) {
    var ret = new Node(word);
    ret.add(value, comparer);
    ret.left = ret.right = NULL;
    return ret;
};

function SearchTree(valueComparer) {
    this._length = 0;
    this._root = null;
    this._valueComparer = valueComparer;
    this.lcp = 0;
}

SearchTree.prototype._print = function(node, level) {
    if (node === null || node === NULL) return;

    console.log(spaces(level), node.word, node.color === BLACK ? "BLACK" : "RED");
    this._print(node.left, level + 1);
    this._print(node.right, level + 1);
}

SearchTree.prototype.print = function() {
    this._print(this._root, 0);
};

SearchTree.prototype.insert = function(word, value) {
    this._insertNode(word, value);
};

SearchTree.prototype._searchPrecedessors = function(node, word, results) {
    while (node !== null) {
        compareStringsLcp(this, node.word, word);
        var lcp = this.lcp;
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
        var lcp = this.lcp;
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
    var node = this._root;
    if (node === null) return null;
    var results = [];
    while (node !== NULL) {
        var result = compareStringsLcp(this, node.word, word);
        var lcp = this.lcp;
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
    var prev = this._root;
    if (prev !== null) {
        var next = prev.parent;
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
    var node = this._nodeByExactWord(word);

    if (node) {
        node.remove(value, this._valueComparer);
        if (node.length() === 0) {
            this._removeNode(node);
        }
    }
};

SearchTree.prototype._nodeByExactWord = function(word) {
    var node = this._root;
    if (node === null) return null;

    while (node !== NULL) {
        var result = compareStrings(node.word, word);

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
    var node = null;
    var root = this._root;
    this._length++;
    if (root === null) {
        this._root = mkNode(word, value, this._valueComparer);
        this._root.color = BLACK;
        return;
    }

    while (true) {
        var result = compareStrings(root.word, word);

        if (result > 0) {
            var left = root.left;
            if (left === NULL) {
                node = mkNode(word, value, this._valueComparer);
                root.setLeftChild(node);
                break;
            } else {
                root = left;
            }
        } else if (result < 0) {
            var right = root.right;
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
        var uncle = node.uncle();
        var grandParent = node.grandParent();
        var parent = node.parent;

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
    var parent = node.parent;
    var sibling = parent.right;

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
    var parent = node.parent;
    var sibling = parent.left;

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
            node = this._rebalanceRight(root, node)
        }
    }
    node.color = BLACK;
};

SearchTree.prototype._removeNode = function(node) {
    this._length--;
    var newRoot = this._doRemoveNode(node);
    if (newRoot !== null) {
        this._root = newRoot;
    } else {
        this._refreshRoot();
    }
};

SearchTree.prototype._doRemoveNode = function(node) {
    var root = this._root;
    var current, successor;

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
        var parent = node.parent;

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

module.exports = SearchTree;
