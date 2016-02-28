/**
 * @preserve Copyright (c) 2012 Petka Antonov
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:</p>
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
;(function $package(global) {
    "use strict";;
/* exported hasOwn, toString, isArray, uid,
    toList, toListOfTuples,
    copyProperties, setIteratorMethods, MapForEach, SetForEach, exportCtor,
    MapIteratorCheckModCount, MapEntries, MapKeys, MapValues, SetToJSON,
    SetValueOf, SetToString, MapToJSON, MapValueOf, MapToString,
    arrayCopy, arraySearch, SetIteratorCheckModCount
*/
/* jshint -W079 */
var Array = [].constructor,

    Function = function(){}.constructor,

    hasOwn = {}.hasOwnProperty,

    toString = {}.toString,

    ownNames = {}.constructor.getOwnPropertyNames || function( obj ) {
        var r = [];

        for( var key in obj ) {
            if( hasOwn.call( obj, key ) ) {
                r.push( key );
            }
        }
        return r;
    },

    isArray = [].constructor.isArray || function(arr) {
        return toString.call(arr) === "[object Array]";
    };


//Takes a constructor function and returns a function that
//can instantiate the constructor Without using
//the new- keyword.

//Also copies any properties of the constructor
//unless they are underscore prefixed
//(includes .prototype, so it can still be
//monkey-patched from outside)
/**
 * Description.
 *
 *
 */
var exportCtor = (function() {

    var rnocopy = /(?:^_|^(?:length|name|arguments|caller|callee)$)/;
    return function exportCtor( Constructor ) {
        var params = new Array( Constructor.length ),
            instantiateCode = "";

        for( var i = 0, len = params.length; i < len; ++i ) {
            params[i] = "param$" + i;
        }

        if( params.length ) {
            instantiateCode = "switch( arguments.length ) {\n";
            for( var i = params.length - 1; i >= 0; --i ) {
                instantiateCode += "case "+ (i + 1) +
                    ": return new Constructor(" + params.slice(0, i + 1)
                    .join( ", " ) + ");\n";
            }
            instantiateCode += "case 0: return new Constructor();\n}"+
                "\nthrow new Error(\"too many arguments\");\n";
        }
        else {
            instantiateCode = "return new Constructor();";
        }

        var code = "return function ConstructorProxy(" +
            params.join( ", " ) + ") { \"use strict\"; " +
            instantiateCode + "};";

        var ret = new Function( "Constructor", code )( Constructor );

        var names = ownNames( Constructor );

        for( var i = 0, len = names.length; i < len; ++i ) {
            if( !rnocopy.test( names[ i ] ) ) {
                ret[ names[ i ] ] = Constructor[ names[ i ] ];
            }
        }

        return ret;
    };
})();


/**
 * Description.
 *
 *
 */
var uid = (function() {
    var id = 0,
        key = "__uid" +
            (Math.random() + "").replace(/[^0-9]/g, "")
            .substr(5) + "__";

    return function uid( obj ) {
        if( !hasOwn.call( obj, key ) ) {
            var ret = id++;
            obj[key] = ret;
            return ret;
        }
        return obj[key];
    };
})();

/**
 * Description.
 *
 *
 */
function toList( obj ) {
    var items;
    if( isArray( obj ) ) {
        return obj;
    }
    else if( obj && typeof obj === "object" ) {
        if( "iterator" in obj && typeof obj.iterator === "function" ) {
            var it = obj.iterator();

            items = [];

            while( it.next() ) {
                items.push( it.value );
            }
            return items;
        }
        else {
            items = [];

            for( var k in obj ) {
                if( hasOwn.call( obj, k ) ) {
                    items.push( obj[k] );
                }
            }
            return items;
        }
    }
    else {
        return [];
    }
}

/**
 * Description.
 *
 *
 */
function toListOfTuples( obj ) {
    if( isArray( obj ) ) {
        return obj;
    }
    else if( obj && typeof obj === "object" ) {
        if( "iterator" in obj && typeof obj.iterator === "function" ) {
            var it = obj.iterator(),
                items = [];
            while( it.next() ) {
                items.push( [it.key, it.value] );
            }
            return items;
        }
        else {
            var items = [];
            for( var k in obj ) {
                if( hasOwn.call( obj, k ) ) {
                    items.push( [k, obj[k]] );
                }
            }
            return items;
        }

    }
    else {
        return [];
    }
}

/**
 * Description.
 *
 *
 */
function copyProperties( src, dst ) {
    for( var key in src ) {
        if( hasOwn.call( src, key ) ) {
            dst[key] = src[key];
        }
    }
}

/**
 * Description.
 *
 *
 */
function arraySearch( array, startIndex, length, value ) {
    for( var i = startIndex; i < length; ++i ) {
        if( array[i] === value ) {
            return true;
        }
    }
    return false;
}

/**
 * Description.
 *
 *
 */
function arrayCopy( src, srcIndex, dst, dstIndex, len ) {
    for( var j = 0; j < len; ++j ) {
        dst[j + dstIndex ] = src[j + srcIndex];
    }
}

var setIteratorMethods = {
    /**
     * Description.
     *
     *
     */
    next: function next() {
        var ret = this._iterator.next();
        this.value = this._iterator.key;
        this.index = this._iterator.index;
        return ret;
    },

    /**
     * Description.
     *
     *
     */
    prev: function prev() {
        var ret = this._iterator.prev();
        this.value = this._iterator.key;
        this.index = this._iterator.index;
        return ret;
    },

    /**
     * Description.
     *
     *
     */
    moveToStart: function moveToStart() {
        this._iterator.moveToStart();
        this.value = this._iterator.key;
        this.index = this._iterator.index;
        return this;
    },

    /**
     * Description.
     *
     *
     */
    moveToEnd: function moveToEnd() {
        this._iterator.moveToEnd();
        this.value = this._iterator.key;
        this.index = this._iterator.index;
        return this;
    },

    /**
     * Description.
     *
     *
     */
    "delete": function $delete() {
        var ret = this._iterator.remove();
        this.value = this._iterator.key;
        this.index = this._iterator.index;
        return ret;
    },

    /**
     * Description.
     *
     *
     */
    remove: function remove() {
        var ret = this._iterator.remove();
        this.value = this._iterator.key;
        this.index = this._iterator.index;
        return ret;
    }
};

/**
 * Description.
 *
 *
 */
function MapForEach( fn, ctx ) {
    var it = this.iterator();
    if( ctx ) {
        while( it.next() ) {
            if( fn.call( ctx, it.value, it.key, it.index ) === false ) {
                return;
            }
        }
    }
    else {
        while( it.next() ) {
            if( fn( it.value, it.key, it.index ) === false ) {
                return;
            }
        }
    }
}

/**
 * Description.
 *
 *
 */
function SetForEach( fn, ctx ) {
    var it = this.iterator();
    if( ctx ) {
        while( it.next() ) {
            if( fn.call( ctx, it.value, it.index ) === false ) {
                return;
            }
        }
    }
    else {
        while( it.next() ) {
            if( fn( it.value, it.index ) === false ) {
                return;
            }
        }
    }
}

/**
 * Description.
 *
 *
 */
function MapToString() {
    var ret = [],
        it = this.iterator();

    while( it.next() ) {
        ret.push( [
            it.key === this ? null : it.key,
            it.value === this ? null : it.value
        ]);
    }

    return JSON.stringify( ret );
}

/**
 * Description.
 *
 *
 */
function MapValueOf() {
    return 1;
}

/**
 * Description.
 *
 *
 */
function MapToJSON() {
    return this.entries();
}

/**
 * Description.
 *
 *
 */
function SetToString() {
    var ret = [],
        it = this.iterator();

    while( it.next() ) {
        ret.push( it.value === this ? null : it.value );
    }

    return JSON.stringify( ret );
}

/**
 * Description.
 *
 *
 */
function SetValueOf() {
    return 1;
}

/**
 * Description.
 *
 *
 */
function SetToJSON() {
    return this.values();
}

/**
 * Description.
 *
 *
 */
function MapKeys() {
    var keys = [],
        it = this.iterator();

    while( it.next() ) {
        keys.push( it.key );
    }
    return keys;
}

/**
 * Description.
 *
 *
 */
function MapValues() {
    var values = [],
        it = this.iterator();

    while( it.next() ) {
        values.push( it.value );
    }
    return values;
}

function MapEntries() {
    var entries = [],
    it = this.iterator();

    while( it.next() ) {
        entries.push( [it.key, it.value] );
    }
    return entries;
}

/* exported RED, BLACK, arePrimitive, defaultComparer, composeComparators,
    comparePosition, invertedComparator, True, Null */
/* global uid, arrayCopy */
var BLACK = true,
    RED = false,
    OBJ = {}.constructor;


function arePrimitive( a, b ) {
    return OBJ(a) !== a &&
           OBJ(b) !== b;
}


function defaultComparer( a,b ) {
    //primitive or obj with .valueOf() returning primitive
    if( a < b ) {
        return -1;
    }
    if( a > b ) {
        return 1;
    }

    //equal primitives or uncomparable objects for which
    //.valueOf() returns just the object itself
    a = a.valueOf();
    b = b.valueOf();

    if( arePrimitive(a, b ) ) {
        return 0; //Since they were primitive, and < > compares
                  //primitives, they must be equal
    }
    else { //uncomparable objects
        //the expando property is enumerable in ie <9
        a = uid(a);
        b = uid(b);
        return a < b ? -1 : a > b ? 1 : 0;
    }
}


function composeComparators( arg ) {
    if( !Array.isArray(arg) ) {
        arg = arrayCopy(arguments, 0, [], 0, arguments.length);
    }
    return function( a, b ) {
        for( var i = 0; i < arg.length; ++i ) {
            var result = arg[i](a, b);
            if( result !== 0 ) {
                return result;
            }
        }
    };
}

// Compare Position - MIT Licensed, John Resig
function comparePosition(a, b){
    return a.compareDocumentPosition ?
        a.compareDocumentPosition(b) :
        a.contains ?
            (a !== b && a.contains(b) && 16) +
                (a !== b && b.contains(a) && 8) +
                (a.sourceIndex >= 0 && b.sourceIndex >= 0 ?
                    (a.sourceIndex < b.sourceIndex && 4) +
                        (a.sourceIndex > b.sourceIndex && 2) :
                    1) +
            0 :
            0;
}

function invertedComparator( arg ) {
    return function( a, b ) {
        return -1 * arg( a, b );
    };
}

function True() {
    return true;
}

function NULL() {}

var NIL = new NULL();

NIL.left = NIL.right = NIL.parent =
    NIL.key = NIL.contents = void 0;

NIL.subtreeCount = 0;
NIL.color = BLACK;;
/* global RED, NIL */
/* exported RedBlackNode */
var RedBlackNode = (function() {

/**
 * Description.
 *
 *
 */
function RedBlackNode( key, value, parent ) {
    this.left = NIL;
    this.right = NIL;
    this.parent = parent;
    this.key = key;
    this.value = value;
    this.color = RED;
    this.subtreeCount = 1;
}
var method = RedBlackNode.prototype;

/**
 * Description.
 *
 *
 */
method.setValue = function( value ) {
    this.value = value;
};

/**
 * Description.
 *
 *
 */
method.getValue = function() {
    return this.value;
};

/**
 * Description.
 *
 *
 */
method.getUncle = function() {
    var gp = this.getGrandparent();

    if( !gp ) {
        return NIL;
    }

    if( gp.left === this.parent ) {
        return gp.right;
    }
    else if( gp.right === this.parent ) {
        return gp.left;
    }
    else {
        return NIL;
    }
};

/**
 * Description.
 *
 *
 */
method.getGrandparent = function() {
    if( this.parent && this.parent.parent ) {
        return this.parent.parent;
    }
    return null;
};

/**
 * Description.
 *
 *
 */
method.isRightChild = function() {
    return !!(this.parent && this.parent.right === this);
};

/**
 * Description.
 *
 *
 */
method.isLeftChild = function() {
    return !!(this.parent && this.parent.left === this);
};

/**
 * Description.
 *
 *
 */
method.setLeftChild = function( node ) {
    this.left = node;
    if( node && node !== NIL ) {
        node.parent = this;
    }
};

/**
 * Description.
 *
 *
 */
method.setRightChild = function( node ) {
    this.right = node;
    if( node && node !== NIL ) {
        node.parent = this;
    }
};

/**
 * Description.
 *
 *
 */
method.getSuccessor = function() {
    if( this.right !== NIL ) {
        var node = this.right;
        while( node.left !== NIL ) {
            node = node.left;
        }
        return node;
    }
    else {
        var parent = this.parent;
        var firstLeft = this;

        while (firstLeft.isRightChild()) {
            firstLeft = parent;
            parent = parent.parent;
        }

        return parent || null;
    }
};

/**
 * Description.
 *
 *
 */
method.getPrecedessor = function() {
    if( this.left !== NIL ) {
        var node = this.left;
        while( node.right !== NIL ) {
            node = node.right;
        }
        return node;
    }
    else {
        var parent = this.parent;
        var firstRight = this;

        while (firstRight.isLeftChild()) {
            firstRight = parent;
            parent = parent.parent;
        }

        return parent || null;
    }
};

/**
 * Description.
 *
 *
 */
method.rotateLeft = function() {
    var right = this.right,
        parent = this.parent;


    this.setRightChild(right.left);

    if( this.isRightChild() ) {
        parent.setRightChild(right);
    }
    else if( this.isLeftChild() ) {
        parent.setLeftChild(right);
    }
    else {
        right.parent = null;
    }

    right.setLeftChild(this);

    this.subtreeCount =
        1 + this.left.subtreeCount + this.right.subtreeCount;
    right.subtreeCount =
        1 + right.left.subtreeCount + right.right.subtreeCount;
};

/**
 * Description.
 *
 *
 */
method.rotateRight = function() {
    var left = this.left,
        parent = this.parent;

    this.setLeftChild(left.right);

    if( this.isRightChild()) {
        parent.setRightChild(left);
    }
    else if( this.isLeftChild() ) {
        parent.setLeftChild(left);
    }
    else {
        left.parent = null;
    }

    left.setRightChild(this);

    this.subtreeCount =
        1 + this.left.subtreeCount + this.right.subtreeCount;
    left.subtreeCount =
        1 + left.left.subtreeCount + left.right.subtreeCount;
};

return RedBlackNode;})();;
/* global RED, BLACK, NIL, defaultComparer, RedBlackNode */
/* exported RedBlackTree */
var RedBlackTree = (function() {

/**
 * Description.
 *
 *
 */
function RedBlackTree( comparator ) {
    this.root = null;
    this.length = 0;
    this.comparator = typeof comparator === "function" ?
        comparator :
        defaultComparer;
    this.modCount = 0;
}
var method = RedBlackTree.prototype;

/**
 * Description.
 *
 *
 */
method.size = method.length = function length() {
    return this.length;
};

//The root reference might point to wrong node after insertion/deletion
//simply find the node without parent is the new root
//The cost is often 0 or 1-2 operations in worst case because
//the root only changes when the rotations are happening near it
method.updateRootReference = function updateRootReference() {
    var cur = this.root;
    if( cur && cur.parent ) {
        while( ( cur = cur.parent ) ) {
            if( !cur.parent ) {
                this.root = cur;
                break;
            }
        }
    }
};

/**
 * Description.
 *
 *
 */
method.getComparator = function getComparator() {
    return this.comparator;
};

/**
 * Description.
 *
 *
 */
method.modified = function modified() {
    this.modCount++;
};

/**
 * Description.
 *
 *
 */
method.clear = function clear() {
    this.modified();
    this.root = null;
    this.length = 0;
};

/**
 * Description.
 *
 *
 */
method.set = function set( key, value ) {
    if( key == null ) {
        return void 0;
    }
    if( value === void 0 ) {
        return void 0;
    }
    this.modified();

    var node = key instanceof RedBlackNode ? key : this.nodeByKey( key ),
        ret = void 0;

    if( node ) {
        ret = node.value;
        node.setValue( value );
    }
    else {
        insert.call( this, key, value );
    }
    return ret;
};

/**
 * Description.
 *
 *
 */
method.setAt = function setAt( index, value ) {
    if( value === void 0 ) {
        return;
    }
    var node = this.nodeByIndex( index );

    if( node ) {
        return this.set( node, value );
    }
};

/**
 * Description.
 *
 *
 */
method.unsetAt = function unsetAt( index ) {
    var node = this.nodeByIndex( index );

    if( node ) {
        return this.unset( node );
    }
};

/**
 * Description.
 *
 *
 */
method.unset = function unset( key ) {
    if( key == null ) {
        return void 0;
    }
    this.modified();
    var node = key instanceof RedBlackNode ? key : this.nodeByKey( key );

    if( node ) {

        var newRoot = treeRemove( this.root, node );
        this.length--;
        if( newRoot !== void 0 ) {
            this.root = newRoot;
        }
        else {
            this.updateRootReference();
        }
        return node;
    }
    else {
        return void 0;
    }
};



//node with key >= inputKey
/**
 * Description.
 *
 *
 */
method.nodeByKeyAtLeast = function nodeByKeyAtLeast( key ) {
    return greaterKeys.call( this, key, true );
};

//node with key > inputKey
/**
 * Description.
 *
 *
 */
method.nodeByGreaterKey = function nodeByGreaterKey( key ) {
    return greaterKeys.call( this, key, false );
};

//node with key <= inputKey
/**
 * Description.
 *
 *
 */
method.nodeByKeyAtMost = function nodeByKeyAtMost( key ) {
    return lesserKeys.call( this, key, true );
};

//node with key < inputKey
/**
 * Description.
 *
 *
 */
method.nodeByLesserKey = function nodeByLesserKey( key ) {
    return lesserKeys.call( this, key, false );

};

/**
 * Description.
 *
 *
 */
method.nodeByKey = function nodeByKey( key ) {
    if( key == null ) {
        return void 0;
    }
    var node = this.root;

    if( !node ) {
        return void 0;
    }

    while( node !== NIL ) {
        var comp = this.comparator( node.key, key );
        if( comp === 0 ) {
            return node;
        }
        else {
            node = comp > 0 ? node.left : node.right;
        }
    }
    return void 0;
};

/**
 * Description.
 *
 *
 */
method.indexOfNode = function indexOfNode( node ) {
    if( !node ) {
        return -1;
    }

    var ret = rank( this.root, node );
    if( ret ) {
        return ret - 1;
    }
    return -1;
};

/**
 * Description.
 *
 *
 */
method.indexOfKey = function indexOfKey( key ) {
    if( key == null ) {
        return void 0;
    }

    return this.indexOfNode( this.nodeByKey( key ) );
};

/**
 * Description.
 *
 *
 */
method.nodeByIndex = function nodeByIndex( index ) {
    index = +index;
    if( !isFinite( index ) ) {
        return void 0;
    }
    if( index < 0 ) {
        index = index + this.length;
    }
    if( index < 0 ) {
        return this.firstNode();
    }
    if( index >= this.length ) {
        return this.lastNode();
    }

                           //OS-Select indexing is 1-based
    return nthNode( this.root, index + 1 );
};

/**
 * Description.
 *
 *
 */
method.firstNode = function firstNode() {
    var cur = this.root,
        prev;

    if( !cur ) {
        return void 0;
    }

    while( cur !== NIL ) {
        prev = cur;
        cur = cur.left;
    }
    return prev;
};

/**
 * Description.
 *
 *
 */
method.lastNode = function lastNode() {
    var cur = this.root,
        prev;

    if( !cur ) {
        return void 0;
    }

    while( cur !== NIL ) {
        prev = cur;
        cur = cur.right;
    }
    return prev;
};

/**
 * Description.
 *
 *
 */
method.iterator = function iterator() {
    return new Iterator( this );
};



var rotateWords = {
    left: "rotateLeft",
    right: "rotateRight"
};

var LEFT = "left",
    RIGHT = "right";

function treeRemoveFix( root, node ) {

    while( node.color === BLACK && node !== root) {
        var isLeft = node.isLeftChild(),
            dir = isLeft ? LEFT : RIGHT, //Avoid duplicating the symmetry
            rotateDir = rotateWords[dir],
            oppositeDir = isLeft ? RIGHT : LEFT,
            rotateOppositeDir = rotateWords[oppositeDir];

        var parent = node.parent,
            sibling = parent[oppositeDir];

        if( sibling.color === RED ) {
            sibling.color = BLACK;
            parent.color = RED;
            parent[rotateDir]();
            sibling = parent[oppositeDir];
        }

        if( sibling[dir].color === BLACK &&
            sibling[oppositeDir].color === BLACK ) {
            sibling.color = RED;
            node = node.parent;
        }
        else {
            if( sibling[oppositeDir].color === BLACK ) {
                sibling[dir].color = BLACK;
                sibling.color = RED;
                sibling[rotateOppositeDir]();
                sibling = node.parent[oppositeDir];
            }

            sibling.color = node.parent.color;
            node.parent.color = BLACK;
            sibling[oppositeDir].color = BLACK;
            node.parent[rotateDir]();
            node = root;
        }
    }
    node.color = BLACK;
}

//Return new value for root, undefined otherwise
function treeRemove( root, node ) {
    var current, successor;

    if( node.left !== NIL &&
        node.right !== NIL ) {
        successor = node.getSuccessor();
        node.key = successor.key;
        node.value = successor.value;
        node = successor;
    }

    if( node.left !== NIL ) {
        current = node.left;
    }
    else {
        current = node.right;
    }

    if( current !== NIL ) {
        var parent = node.parent;

        if( node.isLeftChild() ) {
            parent.setLeftChild(current);
        }
        else if( node.isRightChild() ) {
            parent.setRightChild(current);
        }

        node.left = node.right = NIL;

        var upd = current;
        while( upd ) {
            upd.subtreeCount =
                upd.left.subtreeCount + upd.right.subtreeCount + 1;
            upd = upd.parent;
        }

        if( node.color === BLACK ) {
            treeRemoveFix(parent ? root : current, current);
        }

        if( !parent ) {
            current.parent = null;
            return current;
        }
    }
    else if( !node.parent ) {
        return null;
    }
    else {
        if( node.color === BLACK ) {
            treeRemoveFix( root, node );
        }

        if( node.isLeftChild() ) {
            node.parent.setLeftChild(NIL);
        }
        else if( node.isRightChild() ) {
            node.parent.setRightChild(NIL);
        }

        var upd = node;
        while( upd ) {
            upd.subtreeCount =
                upd.left.subtreeCount + upd.right.subtreeCount + 1;
            upd = upd.parent;
        }
    }
}



//Return true if the node was inserted into the tree, false otherwise
function treeInsert( fn, root, node ) {

    while( root && root !== NIL ) {
        var comp = fn( root.key, node.key );

        if( comp === 0 ) {
            return false;
        }
        root.subtreeCount++;
        if( comp > 0 ) {

            if( root.left === NIL ) {
                root.setLeftChild(node);
                return true;
            }
            else {
                root = root.left;
            }
        }
        else {
            if( root.right === NIL ) {
                root.setRightChild(node);
                return true;
            }
            else {
                root = root.right;
            }
        }

    }
    return false;
}

function insert( key, value ) {
    var node = new RedBlackNode(key, value, null);
    if( !this.root ) {
        this.root = node;
        this.length = 1;
        node.color = BLACK;
    }
    else if( treeInsert( this.comparator, this.root, node ) ) {
        this.length++;
        while( node.parent && node.parent.color === RED ) {

            var uncle = node.getUncle(),
                grandparent = node.getGrandparent(),
                parent = node.parent;

            if( uncle.color === RED ) {
                parent.color = BLACK;
                uncle.color = BLACK;
                grandparent.color = RED;
                node = grandparent;
                continue;
            }

            if( parent.isLeftChild() ) {
                if( node.isRightChild() ) {
                    node = node.parent;
                    node.rotateLeft();
                }

                node.parent.color = BLACK;
                grandparent = node.getGrandparent();
                grandparent.color = RED;
                grandparent.rotateRight();

            }
            else if( parent.isRightChild() ) {
                if( node.isLeftChild() ) {
                    node = node.parent;
                    node.rotateRight();
                }
                node.parent.color = BLACK;
                grandparent = node.getGrandparent();
                grandparent.color = RED;
                grandparent.rotateLeft();
            }
        }
        this.updateRootReference();
        this.root.color = BLACK;
    }
}
//1-based indexing
function nthNode( root, n ) {
    while( root && root !== NIL ) {
        var r = root.left.subtreeCount + 1;
        if( n === r ) {
            return root;
        }

        if( n < r ) {
            root = root.left;
        }
        else {
            n -= r;
            root = root.right;
        }
    }
    return void 0;
}

function rank( root, node ) {
    if( !root || root === NIL ) {
        return void 0;
    }
    if( !node || node === NIL ) {
        return void 0;
    }
    var i = node.left.subtreeCount + 1;

    while( node !== root ) {
        if( node.isRightChild() ) {
            i += (node.parent.left.subtreeCount + 1);
        }
        node = node.parent;
    }
    return i;
}

                        //true = less-than-or-equal
                        //false = less-than
function lesserKeys( key, open ) {
    if( key == null ) {
        return void 0;
    }

    var node = this.root;

    while( node && node !== NIL ) {
        var comp = this.comparator( node.key, key );


        if( open && comp === 0 ) {
            return node;
        }//node's key is less than input key
        else if( comp < 0 ) {
            //there is also no greater keys
            if( node.right === NIL ) {
                return node;
            }
            else {
                node = node.right;
            }
        }
        else { //node's key is equal or greater, go for backingNode
            if( node.left !== NIL ) {
                node = node.left;
            }
            else {
                //second least node in the tree
                //return least or undefined
                return node.getPrecedessor() || void 0;
            }
        }
    }
    return void 0;
}

                        //true = less-than-or-equal
                        //false = less-than
function greaterKeys( key, open ) {
    if( key == null ) {
        return void 0;
    }

    var node = this.root;

    while( node && node !== NIL ) {
        var comp = this.comparator( node.key, key );

        if( open && comp === 0 ) {
            return node;
        }   //node's key is greater than input key
        else if( comp > 0 ) {
            //there is also no lesser keys

            if( node.left === NIL ) {
                return node;
            }
            else {
                node = node.left;
            }
        }
        else { //node's key is less, try to find a greater key
            if( node.right !== NIL ) {
                node = node.right;
            }
            else {
                //second greatest node in the tree
                //return greatest or undefined
                return node.getSuccessor() || void 0;
            }
        }
    }
    return void 0;
}

var Iterator = (function() {


    /**
     * Description.
     *
     *
     */
    function Iterator( tree ) {
        this.key = this.value = void 0;
        this.index = -1;
        this._modCount = tree.modCount;

        this._index = -1;
        this._tree = tree;
        this._backingNode = null;
        this._currentNode = null;
    }
    var method = Iterator.prototype;

    /**
     * Description.
     *
     *
     */
    method._checkModCount = function _checkModCount() {
        if( this._modCount !== this._tree.modCount ) {
            throw new Error( "map cannot be mutated while iterating" );
        }
    };

    /**
     * Description.
     *
     *
     */
    method._getPrevNode = function _getPrevNode() {
        var ret;
        if( this._currentNode === null ) {
            if( this._backingNode !== null ) {
                ret = this._backingNode;
                this._backingNode = null;
                return ret.getPrecedessor();

            }
            else {
                ret = this._tree.lastNode();
            }
        }
        else {
            ret = this._currentNode.getPrecedessor();
        }
        return ret;
    };

    /**
     * Description.
     *
     *
     */
    method._getNextNode = function _getNextNode() {

        var ret;
        if( this._currentNode === null ) {
            if( this._backingNode !== null ) {
                ret = this._backingNode;
                this._backingNode = null;
                this._index--;
            }
            else {

                ret = this._tree.firstNode();
            }
        }
        else {
            ret = this._currentNode.getSuccessor();
        }
        return ret;
    };

    /**
     * Description.
     *
     *
     */
    method.next = function next() {
        this._checkModCount();

        this._index++;

        if( this._backingNode === null &&
            this._index >= this._tree.size()
        ) {
            this.moveToEnd();
            return false;
        }

        this._currentNode = this._getNextNode();
        this.key = this._currentNode.key;
        this.value = this._currentNode.value;
        this.index = this._index;

        return true;
    };

    /**
     * Description.
     *
     *
     */
    method.prev = function prev() {
        this._checkModCount();

        this._index--;

        if( this._index < 0 ||
            this._tree.size() === 0 ) {
            this.moveToStart();
            return false;
        }

        this._currentNode = this._getPrevNode();

        this.key = this._currentNode.key;
        this.value = this._currentNode.value;
        this.index = this._index;

        return true;

    };

    /**
     * Description.
     *
     *
     */
    method.moveToStart = function moveToStart() {
        this._checkModCount();

        this._index = -1;
        this.key = this.value = void 0;
        this.index = -1;
        this._currentNode = null;

        return this;
    };

    /**
     * Description.
     *
     *
     */
    method.moveToEnd = function moveToEnd() {
        this._checkModCount();

        this._index = this._tree.size();
        this.key = this.value = void 0;
        this.index = -1;
        this._currentNode = null;

        return this;
    };

    /**
     * Description.
     *
     *
     */
    method.set = method.put = function put( value ) {
        this._checkModCount();

        if( this._currentNode === null ) {
            return;
        }

        var ret = this.value;
        this._currentNode.value = this.value = value;
        return ret;
    };

    /**
     * Description.
     *
     *
     */
    method["delete"] = method.remove = function remove() {
        this._checkModCount();

        if( this._currentNode === null ) {
            return;
        }

        var ret = this._currentNode.value,
            backingNode,
            parent;

        this._backingNode = backingNode = this._currentNode.getSuccessor();

        this._tree.unset( this._currentNode );

        this.key = this.value = void 0;
        this.index = -1;
        this._currentNode = null;
        this._modCount = this._tree.modCount;


        if( backingNode === null ) {
            this.moveToEnd();
        }
        else if( ( parent = backingNode.parent ) !== null &&
            this._tree.comparator( parent.key, backingNode.key ) === 0 ) {
            this._backingNode = parent;
        }

        return ret;
    };


    return Iterator;
})();

method._Iterator = Iterator;

return RedBlackTree;})();

/* global toListOfTuples, MapForEach, RedBlackTree, defaultComparer,
    MapValueOf, MapEntries, MapKeys, MapValues, MapToString, MapToJSON */
var SortedMap = (function() {
    var method = SortedMap.prototype;

    function SortedMap( keyValues, comparator ) {
        this._tree = null;
        this._init( keyValues, comparator );
    }

    method._init = function _init( keyValues, comparator ) {
        if( typeof keyValues === "function" ) {
            var tmp = comparator;
            comparator = keyValues;
            keyValues = tmp;
        }

        if( typeof comparator !== "function" ) {
            comparator = defaultComparer;
        }

        this._tree = new RedBlackTree( comparator );

        if( typeof keyValues === "object" ) {
            this._setAll( toListOfTuples( keyValues ) );
        }
    };

    method._setAll = function _setAll( items ) {
        for( var i = 0, l = items.length; i < l; ++i ) {
            this.set( items[i][0], items[i][1] );
        }
    };
    //API
    method.forEach = MapForEach;

    method.getComparator = function getComparator() {
        return this._tree.getComparator();
    };

    method.clone = function clone() {
        return new SortedMap( this.entries(), this.comparator );
    };

    method.clear = function clear() {
        this._tree.clear();
        return this;
    };

    method.put = method.set = function set( key, value ) {
        return this._tree.set( key, value );
    };

    method.putAll = method.setAll = function setAll( arr ) {
        var items = toListOfTuples( arr );
        this._setAll( items );
        return this;
    };

    method["delete"] = method.remove = method.unset = function unset( key ) {
        var ret = this._tree.unset( key );
        return ret ? ret.getValue() : ret;
    };

    method.get = function get( key ) {
        var node = this._tree.nodeByKey(key);
        if( !node ) {
            return void 0;
        }
        return node.getValue();
    };

    method.containsKey = method.hasKey = function hasKey( key ) {
        return !!this._tree.nodeByKey( key );
    };

    method.containsValue = method.hasValue = function hasValue( value ) {
        var it = this.iterator();

        while( it.next() ) {
            if( it.value === value ) {
                return true;
            }
        }
        return false;
    };

    method.first = function first() {
        return this.get( this.firstKey() );
    };

    method.last = function last() {
        return this.get( this.lastKey() );
    };

    method.nth = function nth( index ) {
        return this.get( this.nthKey( index ) );
    };

    method.nthKey = function nthKey( index ) {
        var node = this._tree.nodeByIndex(index);
        if( !node ) {
            return void 0;
        }
        return node.key;
    };

    method.firstKey = function firstKey() {
        var first = this._tree.firstNode();

        if( !first ) {
            return void 0;
        }
        return first.key;
    };

    method.lastKey = function lastKey() {
        var last = this._tree.lastNode();

        if( !last) {
            return void 0;
        }
        return last.key;
    };

    method.size = method.length = function length() {
        return this._tree.size();
    };

    method.isEmpty = function isEmpty() {
        return this._tree.size() === 0;
    };

    method.keys = MapKeys;

    method.values = MapValues;

    method.entries = MapEntries;

    method.iterator = function iterator() {
        return this._tree.iterator();
    };

    method.toJSON = MapToJSON;

    method.toString = MapToString;

    method.valueOf = MapValueOf;

    return SortedMap;
})();
/* global defaultComparer, SortedMap, SetForEach, setIteratorMethods,
    copyProperties, toList, RedBlackTree,
    SetValueOf, SetToString, SetToJSON */
var SortedSet = (function() {

    var method = SortedSet.prototype;

    function SortedSet( values, comparator ) {
        this._tree = null;
        this._init( values, comparator );
    }

    method._init = function _init( values, comparator ) {
        if( typeof values === "function" ) {
            var tmp = comparator;
            comparator = values;
            values = tmp;
        }

        if( typeof comparator !== "function" ) {
            comparator = defaultComparer;
        }

        this._tree = new RedBlackTree( comparator );

        if( typeof values === "object" && values != null ) {
            this._addAll( toList(values) );
        }
    };

    //API
    method.forEach = SetForEach;

    method.getComparator = SortedMap.prototype.getComparator;

    method.clear = SortedMap.prototype.clear;


    method.values = method.toArray = function toArray() {
        var values = [],
            it = this.iterator();

        while( it.next() ) {
            values.push( it.value );
        }
        return values;
    };

    method.contains = SortedMap.prototype.containsKey;
    method.get = method.nth = SortedMap.prototype.nthKey;
    method.first = SortedMap.prototype.firstKey;
    method.last = SortedMap.prototype.lastKey;
    method.size = method.length = SortedMap.prototype.size;
    method.isEmpty = SortedMap.prototype.isEmpty;

    method.add = function add( value ) {
        this._tree.set( value, true );
        return this;
    };

    method._addAll = function _addAll( values ) {
        for( var i = 0, l = values.length; i < l; ++i ) {
            this.add( values[i] );
        }
    };

    method.addAll = function addAll( arr ) {
        var values = toList(arr);
        this._addAll( values );
        return this;
    };

    method.clone = function clone() {
        return new SortedSet( this.values() );
    };

    method.remove = function remove( value ) {
        var ret = this._tree.unset( value );
        return ret ? ret.key : ret;
    };

    method.subsetOf = function subsetOf( set ) {
        var it = this.iterator();

        while( it.next() ) {
            if( !set.contains( it.key ) ) {
                return false;
            }
        }
        return this.size() !== set.size();
    };

    method.supersetOf = function supersetOf( set ) {
        return set.subsetOf(this);
    };

    method.allContainedIn = function allContainedIn( set ) {
        var it = this.iterator();

        while( it.next() ) {
            if( !set.contains( it.key ) ) {
                return false;
            }
        }
        return true;
    };

    method.containsAll = function containsAll( set ) {
        return set.allContainedIn( this );
    };

    method.valueOf = SetValueOf;

    method.toString = SetToString;

    method.toJSON = SetToJSON;

    method.union = function union(a) {
        var ret = new SortedSet( this.getComparator() ),

            aHas, bHas,

            itA = this.iterator(),
            itB = a.iterator();

        while( true ) {
            if( aHas = itA.next() ) {
                ret.add( itA.key );
            }
            if( bHas = itB.next() ) {
                ret.add( itB.key );
            }

            if( !aHas && !bHas ) {
                break;
            }
        }

        return ret;
    };


    method.intersection = function intersection(a) {
        var ret = new SortedSet( this.getComparator() ),
            src = this.size() < a.size() ? this : a,
            dst = src === a ? this : a,
            it = src.iterator();

        while( it.next() ) {
            if( dst.contains( it.key ) ) {
                ret.add( it.key );
            }
        }

        return ret;
    };

    method.complement = function complement( a ) {
        var ret = new SortedSet( this.getComparator() ),
            it = this.iterator();

        while( it.next() ) {
            if( !a.contains( it.key ) ) {
                ret.add( it.key );
            }
        }

        return ret;
    };


    method.difference = function difference( a ) {
        var ret = this.union( a ),
            tmp = this.intersection( a ),
            it = tmp.iterator();

        while( it.next() ) {
            ret.remove( it.key );
        }

        return ret;
    };

    method.iterator = function iterator() {
        return new Iterator( this );
    };

    var Iterator = (function() {
        var method = Iterator.prototype;

        function Iterator( set ) {
            this._iterator = set._tree.iterator();
            this.value = void 0;
            this.index = -1;
            this.moveToStart();
        }

        copyProperties( setIteratorMethods, method );


        return Iterator;
    })();

    method._Iterator = Iterator;

    return SortedSet;
})();;
/* global toList, arraySearch, arrayCopy, SetForEach, SetValueOf */
/* exported Queue */

var DS = {

    SortedSet: exportCtor(SortedSet),
    SortedMap: exportCtor(SortedMap),

    compare: {
        NATURAL_ASC: defaultComparer,

        NATURAL_DESC: invertedComparator(defaultComparer),

        NUMERIC_ASC: function( a, b ) {
            return a-b;
        },

        NUMERIC_DESC: function( a, b ) {
            return b-a;
        },

        LOCALE: function( a, b ) {
            if( !arePrimitive( a, b ) ) {
                a = a.toString();
                b = b.toString();
            }
            return a.localeCompare(b);
        },

        DOM: function( a, b ) {
            if( a === b ) {
                return 0;
            }
            return (3 - (comparePosition(a, b) & 6));
        },

        invertedComparator: invertedComparator,

        composeComparators: composeComparators
    }
};




if( typeof module !== "undefined" && module.exports ) {
    module.exports = DS;
}
else if ( typeof define === "function" && define.amd && define.amd.DS ) {
    define( "DS", [], function () { return DS; } );
}
else if ( global ) {
    global.DS = DS;
};
})( ( function(){}.constructor( "return this" )() ) );


