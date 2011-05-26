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

/**
 * Description.
 *
 *
 */
function MapEntries() {
    var entries = [],
    it = this.iterator();

    while( it.next() ) {
        entries.push( [it.key, it.value] );
    }
    return entries;
}

/**
 * Description.
 *
 *
 */
function MapIteratorCheckModCount() {
    if( this._modCount !== this._map._modCount ) {
        throw new Error( "map cannot be mutated while iterating" );
    }
}

/**
 * Description.
 *
 *
 */
function SetIteratorCheckModCount() {
    if( this._modCount !== this._set._modCount ) {
        throw new Error( "set cannot be mutated while iterating" );
    }
}
;
/* jshint -W079 */
/* exported Object */
var Object = (function( Object ) {

    return {
        /* For inheritance without invoking the parent constructor */
        create: Object.create || function( proto ) {
            if( proto === null ) {
                return {};
            }
            function Type(){}
            Type.prototype = proto;
            return new Type();
        },

        defineProperties: Object.defineProperties,
        defineProperty: Object.defineProperty,
        freeze: Object.freeze,
        getOwnPropertyDescriptor: Object.getOwnPropertyDescriptor,
        getOwnPropertyNames: Object.getOwnPropertyNames,
        getPrototypeOf: Object.getPrototypeOf,
        is: Object.is,
        isExtensible: Object.isExtensible,
        isFrozen: Object.isFrozen,
        isSealed: Object.isSealed,
        keys: Object.keys,
        preventExtensions: Object.preventExtensions,
        seal: Object.seal,
        prototype: Object.prototype
    };


})( ({}.constructor) );
;
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

;
/*
  I've wrapped Makoto Matsumoto and Takuji Nishimura's code in a namespace
  so it's better encapsulated. Now you can have multiple random number generators
  and they won't stomp all over eachother's state.

  If you want to use this as a substitute for Math.random(), use the random()
  method like so:

  var m = new MersenneTwister();
  var randomNumber = m.random();

  You can also call the other genrand_{foo}() methods on the instance.

  If you want to use a specific seed in order to get a repeatable random
  sequence, pass an integer into the constructor:

  var m = new MersenneTwister(123);

  and that will always produce the same random sequence.

  Sean McCullough (banksean@gmail.com)
*/

/*
   A C-program for MT19937, with initialization improved 2002/1/26.
   Coded by Takuji Nishimura and Makoto Matsumoto.

   Before using, initialize the state by using init_genrand(seed)
   or init_by_array(init_key, key_length).

   Copyright (C) 1997 - 2002, Makoto Matsumoto and Takuji Nishimura,
   All rights reserved.

   Redistribution and use in source and binary forms, with or without
   modification, are permitted provided that the following conditions
   are met:

     1. Redistributions of source code must retain the above copyright
        notice, this list of conditions and the following disclaimer.

     2. Redistributions in binary form must reproduce the above copyright
        notice, this list of conditions and the following disclaimer in the
        documentation and/or other materials provided with the distribution.

     3. The names of its contributors may not be used to endorse or promote
        products derived from this software without specific prior written
        permission.

   THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
   "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
   LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
   A PARTICULAR PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL THE COPYRIGHT OWNER OR
   CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
   EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
   PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
   PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
   LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
   NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
   SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.


   Any feedback is very welcome.
   http://www.math.sci.hiroshima-u.ac.jp/~m-mat/MT/emt.html
   email: m-mat @ math.sci.hiroshima-u.ac.jp (remove space)
*/
var MersenneTwister = (function() {
var MersenneTwister = function(seed) {
  if (seed == undefined) {
    seed = new Date().getTime();
  }
  /* Period parameters */
  this.N = 624;
  this.M = 397;
  this.MATRIX_A = 0x9908b0df;   /* constant vector a */
  this.UPPER_MASK = 0x80000000; /* most significant w-r bits */
  this.LOWER_MASK = 0x7fffffff; /* least significant r bits */

  this.mt = new Array(this.N); /* the array for the state vector */
  this.mti=this.N+1; /* mti==N+1 means mt[N] is not initialized */

  this.init_genrand(seed);
}

/* initializes mt[N] with a seed */
MersenneTwister.prototype.init_genrand = function(s) {
  this.mt[0] = s >>> 0;
  for (this.mti=1; this.mti<this.N; this.mti++) {
      var s = this.mt[this.mti-1] ^ (this.mt[this.mti-1] >>> 30);
   this.mt[this.mti] = (((((s & 0xffff0000) >>> 16) * 1812433253) << 16) + (s & 0x0000ffff) * 1812433253)
  + this.mti;
      /* See Knuth TAOCP Vol2. 3rd Ed. P.106 for multiplier. */
      /* In the previous versions, MSBs of the seed affect   */
      /* only MSBs of the array mt[].                        */
      /* 2002/01/09 modified by Makoto Matsumoto             */
      this.mt[this.mti] >>>= 0;
      /* for >32 bit machines */
  }
}

/* initialize by an array with array-length */
/* init_key is the array for initializing keys */
/* key_length is its length */
/* slight change for C++, 2004/2/26 */
MersenneTwister.prototype.init_by_array = function(init_key, key_length) {
  var i, j, k;
  this.init_genrand(19650218);
  i=1; j=0;
  k = (this.N>key_length ? this.N : key_length);
  for (; k; k--) {
    var s = this.mt[i-1] ^ (this.mt[i-1] >>> 30)
    this.mt[i] = (this.mt[i] ^ (((((s & 0xffff0000) >>> 16) * 1664525) << 16) + ((s & 0x0000ffff) * 1664525)))
      + init_key[j] + j; /* non linear */
    this.mt[i] >>>= 0; /* for WORDSIZE > 32 machines */
    i++; j++;
    if (i>=this.N) { this.mt[0] = this.mt[this.N-1]; i=1; }
    if (j>=key_length) j=0;
  }
  for (k=this.N-1; k; k--) {
    var s = this.mt[i-1] ^ (this.mt[i-1] >>> 30);
    this.mt[i] = (this.mt[i] ^ (((((s & 0xffff0000) >>> 16) * 1566083941) << 16) + (s & 0x0000ffff) * 1566083941))
      - i; /* non linear */
    this.mt[i] >>>= 0; /* for WORDSIZE > 32 machines */
    i++;
    if (i>=this.N) { this.mt[0] = this.mt[this.N-1]; i=1; }
  }

  this.mt[0] = 0x80000000; /* MSB is 1; assuring non-zero initial array */
}

/* generates a random number on [0,0xffffffff]-interval */
MersenneTwister.prototype.genrand_int32 = function() {
  var y;
  var mag01 = new Array(0x0, this.MATRIX_A);
  /* mag01[x] = x * MATRIX_A  for x=0,1 */

  if (this.mti >= this.N) { /* generate N words at one time */
    var kk;

    if (this.mti == this.N+1)   /* if init_genrand() has not been called, */
      this.init_genrand(5489); /* a default initial seed is used */

    for (kk=0;kk<this.N-this.M;kk++) {
      y = (this.mt[kk]&this.UPPER_MASK)|(this.mt[kk+1]&this.LOWER_MASK);
      this.mt[kk] = this.mt[kk+this.M] ^ (y >>> 1) ^ mag01[y & 0x1];
    }
    for (;kk<this.N-1;kk++) {
      y = (this.mt[kk]&this.UPPER_MASK)|(this.mt[kk+1]&this.LOWER_MASK);
      this.mt[kk] = this.mt[kk+(this.M-this.N)] ^ (y >>> 1) ^ mag01[y & 0x1];
    }
    y = (this.mt[this.N-1]&this.UPPER_MASK)|(this.mt[0]&this.LOWER_MASK);
    this.mt[this.N-1] = this.mt[this.M-1] ^ (y >>> 1) ^ mag01[y & 0x1];

    this.mti = 0;
  }

  y = this.mt[this.mti++];

  /* Tempering */
  y ^= (y >>> 11);
  y ^= (y << 7) & 0x9d2c5680;
  y ^= (y << 15) & 0xefc60000;
  y ^= (y >>> 18);

  return y >>> 0;
}

/* generates a random number on [0,0x7fffffff]-interval */
MersenneTwister.prototype.genrand_int31 = function() {
  return (this.genrand_int32()>>>1);
}



/* generates a random number on [0,1]-real-interval */
MersenneTwister.prototype.genrand_real1 = function() {
  return this.genrand_int32()*(1.0/4294967295.0);
  /* divided by 2^32-1 */
}

/* generates a random number on [0,1)-real-interval */
MersenneTwister.prototype.random = function() {
  return this.genrand_int32()*(1.0/4294967296.0);
  /* divided by 2^32 */
}

/* generates a random number on (0,1)-real-interval */
MersenneTwister.prototype.genrand_real3 = function() {
  return (this.genrand_int32() + 0.5)*(1.0/4294967296.0);
  /* divided by 2^32 */
}

/* generates a random number on [0,1) with 53-bit resolution*/
MersenneTwister.prototype.genrand_res53 = function() {
  var a=this.genrand_int32()>>>5, b=this.genrand_int32()>>>6;
  return(a*67108864.0+b)*(1.0/9007199254740992.0);
}
MersenneTwister.prototype.genrandInt32 = MersenneTwister.prototype.genrand_int32;
/* These real versions are due to Isaku Wada, 2002/01/09 added */

return MersenneTwister;
})();;
/* exported DEFAULT_CAPACITY, LOAD_FACTOR, MAX_CAPACITY, pow2AtLeast,
    clampCapacity */
/**
 * Get the closest next power of two of the given integer
 * or the number itself if it is a power of two.
 *
 * @param {number} n Must be greater than zero.
 * @return {number} The power of two integer.
 *
 */
function pow2AtLeast( n ) {
    n = n >>> 0;
    n = n - 1;
    n = n | (n >> 1);
    n = n | (n >> 2);
    n = n | (n >> 4);
    n = n | (n >> 8);
    n = n | (n >> 16);
    return n + 1;
}

/**
 * Forces the capacity integer to be in the sane range.
 *
 * @param {int} capacity The capacity integer to sanitize.
 * @return {int} The sanitized capacity.
 *
 */
function clampCapacity( capacity ) {
    return Math.max( DEFAULT_CAPACITY, Math.min( MAX_CAPACITY, capacity ) );
}

var DEFAULT_CAPACITY = 1 << 4;
var MAX_CAPACITY = 1 << 30;
var LOAD_FACTOR = 0.67;;
/* exported equality */
/* global isArray */
var equality = (function() {

/**
 * See if two values are equal. Considers -0 and +0 equal as
 * those are hashed by hashInt and there is only one 0 as
 * integer.
 *
 * Doesn't support arrays. If array checks are needed, the hash
 * table should transition into using the slower equals()
 * function.
 *
 * @param {dynamic} key1 Description of key1 parameter.
 * @param {dynamic} key2 Description of key2 parameter.
 * @return {boolean}
 *
 */
function simpleEquals( key1, key2 ) {
                            //fast NaN equality
    return key1 === key2 || (key1 !== key1 && key2 !== key2);
}


/**
 * See if two values are equal. Considers -0 and +0 equal as
 * those are hashed by hashInt and there is only one 0 as
 * integer.
 *
 * Supports non-circular arrays with deep comparison.
 *
 * @param {dynamic} key1 The first key.
 * @param {dynamic} key2 The second key.
 * @return {boolean}
 *
 */
function equals( key1, key2 ) {
    if( isArray( key1 ) &&
        isArray( key2 ) ) {
        if( key1.length === key2.length ) {
            for( var i = 0, len = key1.length; i < len; ++i ) {
                var val1 = key1[i],
                    val2 = key2[i];

                if( !simpleEquals( val1, val2 ) ) {
                    //Skip infinite recursion
                    if( !( val1 === key1 || val1 === key2 ||
                        val2 === key1 || val2 === key1 ) ) {
                        if( !equals( val1, val2 ) ) {
                            return false;
                        }
                    }
                    else {
                        return false;
                    }
                }
            }
            return true;
        }
        return false;
    }
    return simpleEquals( key1, key2 );
}

return {
    simpleEquals: simpleEquals,
    equals: equals
};
})();
;
/* global isArray, uid, MersenneTwister */
/* exported hash */
var hash = (function() {

var haveTypedArrays = typeof ArrayBuffer !== "undefined" &&
        typeof Uint32Array !== "undefined" &&
        typeof Float64Array !== "undefined";

var seeds = [
    5610204, 986201666, 907942159, 902349351, 797161895, 789759260,
    711023356, 576887056, 554056888, 546816461, 546185508, 524085435,
    459334166, 456527883, 383222467, 301138872, 147250593, 103672245,
    44482651, 874080556, 634220932, 600693396, 598579635, 575448586,
    450435477, 320251763, 315455317, 171499680, 164922379, 113615305,
    891544618, 787150959, 781424867, 692252409, 681534962, 600000618,
    507066596, 449273102, 169958990, 878159962, 794651257, 696691070,
    575407780, 567682439, 533628822, 458239955, 387357286, 373364136,
    345493840, 312464221, 303942867, 53740513, 874713788, 737200732,
    689774193, 557290539, 491474729, 463844961, 381345944, 235288247,
    146111809, 952752630, 870989848, 850671622, 818854957, 579958572,
    376499176, 93332135, 24878659, 969563338, 876939429, 863026139,
    877798289, 409188290, 382588822, 170007484, 456227876, 95501317,
    577863864, 559755423, 972015729, 582556160, 543151278, 451276979,
    401520780, 285701754, 101224795
];


var seed = seeds[ ( Math.random() * seeds.length ) | 0 ];

var seedTable = (function(){
    var ArrayConstructor = typeof Int32Array !== "undefined" ?
            Int32Array :
            Array;
    var r = new ArrayConstructor( 8192 );

    var m = new MersenneTwister( seed );

    for( var i = 0; i < r.length; ++i ) {
        r[i] = ( m.genrandInt32() & 0xFFFFFFFF );
    }
    return r;

})();


/**
 * Calculates a hash integer value for the given boolean.
 *
 * @param {boolean} b The input boolean.
 * @return {int} The hash.
 *
 */
function hashBoolean( b ) {
    var x = seedTable[0];
    var a = (b ? 7 : 3 );
    x = (seedTable[a] ^ x);
    return x;
}

/**
 * Calculates a hash integer value for the given string.
 * Strings with .length > 8191 will have a simple hash
 * based on the length only.
 *
 * @param {string} str The input string.
 * @return {int} The hash.
 *
 */
function hashString( str ) {
    var x = seedTable[0],
        len = str.length & 0x3FFFFFFF;

    if( len > 8191 ) {
        return hashInt( len );
    }

    for( var i = 0; i < len; ++i ) {
        x = ( ( str.charCodeAt( i ) & 0xFF ) * seedTable[ i ] + x ) | 0;
    }

    return x & 0x3FFFFFFF;
}

/**
 * Calculates a hash integer value for the given integer.
 * Using the integer itself would cause a lot of probing.
 *
 * @param {int} i The input integer.
 * @return {int} The hash.
 *
 */
function hashInt( i ) {
    var r = ( ( seedTable[ ( i & 0xFF) ] ) ^
        ( ( seedTable[ ( ( i >> 8 ) & 0xFF ) | 0x100 ] >> 1) ^
        ( ( seedTable[ ( ( i >> 16 ) & 0xFF ) | 0x200 ] >> 2) ^
        ( ( seedTable[ ( ( i >> 24 ) & 0xFF) | 0x300 ] >> 3) ^
        seedTable[ 0 ] ) ) ) );
    return r & 0x3FFFFFFF;
}

if( haveTypedArrays ) {
    var FLOAT_BUFFER = new ArrayBuffer( 8 ),
        FLOAT_BUFFER_FLOAT_VIEW = new Float64Array( FLOAT_BUFFER ),
        FLOAT_BUFFER_INT_VIEW = new Int32Array( FLOAT_BUFFER );

    /**
     * Calculates a hash integer value for the given floating
     * point number. Relies on the ability to read binary
     * representation of the float for a good hash.
     *
     * @param {float} f The input float.
     * @return {int} The hash.
     *
     */
    var hashFloat = function hashFloat( f ) {
        var x = seedTable[0];
        FLOAT_BUFFER_FLOAT_VIEW[0] = f;
        var i = FLOAT_BUFFER_INT_VIEW[0];
        var a = ((i >> 24) & 0xFF) | 0x700;
        x = (seedTable[a] >> 7) ^ x;
        a = ((i >> 16) & 0xFF) | 0x600;
        x = (seedTable[a] >> 6) ^ x;
        a = ((i >> 8) & 0xFF) | 0x500;
        x = (seedTable[a] >> 5) ^ x;
        a = (i & 0xFF) | 0x400;
        x = (seedTable[a] >> 4) ^ x;
        i = FLOAT_BUFFER_INT_VIEW[1];
        a = ((i >> 24) & 0xFF) | 0x300;
        x = (seedTable[a] >> 3) ^ x;
        a = ((i >> 16) & 0xFF) | 0x200;
        x = (seedTable[a] >> 2) ^ x;
        a = ((i >> 8) & 0xFF) | 0x100;
        x = (seedTable[a] >> 1) ^ x;
        a = (i & 0xFF);
        x = (seedTable[a]) ^ x;
        return x & 0x3FFFFFFF;
    };
}
else {
    var hashFloat = hashInt;
}

/**
 * Calculates a int hash value for the given input
 * array.
 *
 * @param {Array.<dynamic>} array The input array.
 * @return {int} The hash.
 *
 */
function hashArray( array ) {
    var x = seedTable[0],
        len = array.length & 0x3FFFFFFF;

    for( var i = 0; i < len; ++i ) {
        var val = array[i];
        if( val === array ) {//Skip infinite recursion
            continue;
        }
        x = ( ( hash( array[i], 0x40000000 ) +
            seedTable[ i & 8191 ] ) ^ x ) | 0;
    }

    return x & 0x3FFFFFFF;
}

/**
 * Returns a hash integer value for the given object. Calls
 * .valueOf() of the object which should return an integer.
 * However, by default it will return the object itself, in
 * which case identity hash is used.
 *
 * @param {Object|null} obj The object to hash. Can be null.
 * @return {int} The hash.
 *
 */
function hashObject( obj ) {
    if( obj == null ) {
        return seedTable[134];
    }
    var ret;
    //valueOf returned a number
    if( ( ret = obj.valueOf() ) !== obj ) {
        return ret;
    }
    return uid( obj );
}

/**
 * Returns an integer hash of the given value. Supported
 * types are:
 *
 * Strings, integers, floats, objects and arrays of
 * them.
 *
 * @param {dynamic} val The value to hash.
 * @param {int} tableSize The amount of buckets in the hash table.
 * Must be a power of two.
 * @return {int}
 *
 */
function hash( val, tableSize ) {
    var t = typeof val,
        bitAnd = tableSize - 1;
    if( t === "string" ) {
        return hashString( val ) & bitAnd;
    }
    else if( t === "number" ) {
        if( ( val | 0 ) === val ) {
            return hashInt( val & 0x3FFFFFFF ) & bitAnd;
        }
        return hashFloat( val ) & bitAnd;
    }
    else if( t === "boolean" ) {
        return hashBoolean( val ) & bitAnd;
    }
    else {
        if( isArray( val ) ) {
            return hashArray( val ) & bitAnd;
        }
        return hashObject( val ) & bitAnd;
    }
}

return hash;})();
;
/* global MapForEach, toListOfTuples,
    MapIteratorCheckModCount, MapEntries, MapKeys, MapValues, MapValueOf,
    MapToJSON, MapToString, DEFAULT_CAPACITY, hash,
    isArray, pow2AtLeast, clampCapacity, equality, LOAD_FACTOR,
    global */
/* exported Map */
/* jshint -W079 */
var Map = (function() {
var Error = global.Error;
/**
 * Constructor for Maps. Map is a simple lookup structure without
 * any ordering. Fast lookup, slow iteration. Memory
 * efficient.
 *
 * The undefined value is not supported as a key nor as a value. Use
 * null instead.
 *
 * If ordering is needed consider OrderedMap or SortedMap.
 *
 * Array of tuples initialization:
 *
 * var map = new Map([
 *      [0, "zero"],
 *      [5, "five"],
 *      [10, "ten"],
 *      [13, "thirteen"]
 * ]);
 *
 * @param {int=|Object=|Array.<Tuple>|Map} capacity The initial capacity.
 * Can also be a object, array of tuples or another map to initialize
 * the map.
 * @constructor
 */
function Map( capacity ) {
    this._buckets = null;
    this._size = 0;
    this._modCount = 0;
    this._capacity = DEFAULT_CAPACITY;
    this._equality = equality.simpleEquals;
    this._usingSimpleEquals = true;
    this._init( capacity );
}
var method = Map.prototype;

/**
 * Internal.
 *
 * @param {int=} capacity Description of capacity parameter.
 * @return {void}
 *
 */
method._init = function _init( capacity ) {
    if( capacity == null ) {
        this._makeBuckets();
        return;
    }

    switch( typeof capacity ) {
    case "number":
        this._capacity = clampCapacity( pow2AtLeast( capacity / LOAD_FACTOR ) );
        this._makeBuckets();
        break;
    case "object":
        var tuples = toListOfTuples( capacity );
        var size = tuples.length;
        this._capacity = pow2AtLeast( size / LOAD_FACTOR );
        this._makeBuckets();
        this._setAll( tuples );
        break;
    default:
        this._makeBuckets();
    }
};

/**
 * Internal.
 *
 * @return {void}
 *
 */
method._checkEquals = function _checkEquals() {
    if( this._usingSimpleEquals === true ) {
        this._usingSimpleEquals = false;
        this._equality = equality.equals;
    }
};

/**
 * Internal.
 *
 * @return {void}
 *
 */
method._makeBuckets = function _makeBuckets() {
    var length = this._capacity << 1;

    var b = this._buckets = new Array( length < 100000 ? length : 0 );

    for( var i = 0; i < length; ++i ) {
        b[i] = void 0;
    }

};

/**
 * Internal.
 *
 * @param {Array.<dynamic>} oldBuckets Description of oldBuckets parameter.
 * @return {void}
 *
 */
method._resized = function _resized( oldBuckets ) {
    var newBuckets = this._buckets,
        oldLength = oldBuckets.length;

    for( var i = 0; i < oldLength; i+=2 ) {

        var key = oldBuckets[i];
        if( key !== void 0) {
            var newIndex = hash( key, this._capacity );

            while( newBuckets[ newIndex << 1 ] !== void 0 ) {
                newIndex = ( this._capacity - 1 ) & ( newIndex + 1 );
            }
            newBuckets[ newIndex << 1 ] = oldBuckets[ i ];
            newBuckets[ ( newIndex << 1 ) + 1 ] = oldBuckets[ i + 1 ];

            oldBuckets[i] = oldBuckets[i+1] = void 0;
        }
    }
};

/**
 * Internal.
 *
 * @param {int} capacity Description of capacity parameter.
 * @return {void}
 *
 */
method._resizeTo = function _resizeTo( capacity ) {
    capacity = clampCapacity( capacity );
    if( this._capacity >= capacity ) {
        return;
    }
    var oldBuckets = this._buckets;
    this._capacity = capacity;
    this._makeBuckets();

    if( oldBuckets !== null ) {
        this._resized( oldBuckets );
    }
};

/**
 * Internal.
 *
 * @return {int}
 *
 */
method._getNextCapacity = function _getNextCapacity() {
    return (this._capacity < 200000 ?
        this._capacity << 2 :
        this._capacity << 1);
};

/**
 * Internal.
 *
 * @param {int} size Description of size parameter.
 * @return {boolean}
 *
 */
method._isOverCapacity = function _isOverCapacity( size ) {
    return ( ( size << 2 ) - size ) >= ( this._capacity << 1 );
}; //Load factor of 0.67

/**
 * Internal.
 *
 * @return {void}
 *
 */
method._checkResize = function _checkResize() {
    if( this._isOverCapacity( this._size ) ) {
        this._resizeTo( this._getNextCapacity() );
    }
};

/**
 * Internal.
 *
 * @param {Array.<Tuple>} obj Description of obj parameter.
 * @return {void}
 *
 */
method._setAll = function _setAll( obj ) {
    if( !obj.length ) {
        return;
    }
    var newSize = obj.length + this._size;

    if( this._isOverCapacity( newSize ) ) {
        var capacity = pow2AtLeast( newSize );
        if( ( ( newSize << 2 ) - newSize ) >= ( capacity << 1 ) ) {
            capacity <<= 1;
            if( capacity < 100000 ) {
                capacity <<= 1;
            }
        }
        this._resizeTo( capacity );
    }

    for( var i = 0; i < obj.length; ++i ) {
        this.set( obj[ i ][ 0 ], obj[ i ][ 1 ] );
    }

};

//API

/**
 * Simple way to iterate the map. The callback fn receives arguments:
 *
 * {dynamic} value, {dynamic} key, {integer} index
 *
 * Iteration can be very slow in an unordered map.
 *
 * @param {function} fn Description of fn parameter.
 * @param {Object=} ctx Description of ctx parameter.
 * @return {void}
 *
 */
method.forEach = MapForEach;

/**
 * Returns a shallow clone of the map.
 *
 * @return {Map}
 *
 */
method.clone = function clone() {
    return new this.constructor( this.entries() );
};

/**
 * See if the value is contained in the map.
 *
 * Iteration can be very slow in an unordered map.
 *
 * @param {dynamic} value The value to lookup.
 * @return {boolean}
 *
 */
method.containsValue = method.hasValue = function hasValue( value ) {
    if( value === void 0 ) {
        return false;
    }
    var it = this.iterator();
    while( it.next() ) {
        if( it.value === value ) {
            return true;
        }
    }
    return false;
};

/**
 * See if the key is contained in the map.
 *
 * @param {dynamic} key The key to lookup.
 * @return {boolean}
 *
 */
method.containsKey = method.hasKey = function hasKey( key ) {
    return this.get( key ) !== void 0;
};

/**
 * Get the value associated with the given key in this map.
 *
 * Returns undefined if not found. Key cannot be undefined.
 *
 * @param {dynamic} key The key to lookup value for.
 * @return {dynamic}
 * @return {void}
 *
 */
method.get = function get( key ) {
    var capacity = this._capacity,
        buckets = this._buckets,
        bucketIndex = hash( key, capacity );

    while( true ) {
        var k = buckets[ bucketIndex << 1 ];

        if( k === void 0 ) {
            return void 0;
        }
        else if( this._equality( k, key ) ) {
            return buckets[ ( bucketIndex << 1 ) + 1 ];
        }
        bucketIndex = ( 1 + bucketIndex ) & ( capacity - 1 );

    }
};

/**
 * Associate a value with a key. If the key is already in the
 * map, that key is updated with the given value. Otherwise a
 * new entry is added.
 *
 * If a value was updated, returns the old value. If the key was
 * inserted into the map, returns undefined.
 *
 * The undefined value is not supported as a key nor as a value. Use
 * null instead.
 *
 * @param {dynamic} key The key to associate with value.
 * @param {dynamic} value The value to associate with key.
 * @return {dynamic}
 * @return {void}
 * @throws {Error} When key or value is undefined
 *
 */
method.put = method.set = function set( key, value ) {
    if( key === void 0 || value === void 0 ) {
        throw new Error( "Cannot use undefined as a key or value" );
    }
    if( isArray( key ) ) {
        this._checkEquals();
    }

    var bucketIndex = hash( key, this._capacity ),
        capacity = this._capacity - 1,
        buckets = this._buckets;
    while( true ) {
        var k = buckets[ bucketIndex << 1 ];

        if( k === void 0 ) {
            //Insertion
            buckets[ bucketIndex << 1 ] = key;
            buckets[ ( bucketIndex << 1 ) + 1 ] = value;
            this._size++;
            this._checkResize();
            this._modCount++;
            return void 0;
        }
        else if( this._equality( k, key ) === true ) {

            //update
            var ret = buckets[ ( bucketIndex << 1 ) + 1 ];
            buckets[ ( bucketIndex << 1 ) + 1 ] = value;
            this._modCount++;
            return ret;
        }

        bucketIndex = ( 1 + bucketIndex ) & capacity;
    }
};

/**
 * Removes a value associated with the given key in the map. If the
 * key is not in the map, returns undefined. If the key is in the map,
 * returns the value associated with the key.
 *
 * You can check if the removal was successful by checking
 *
 * map.remove( myKey ) !== void 0
 *
 * The undefined value as a key or value is not supported. Use null instead.
 *
 * @param {dynamic} key The key to remove from the map.
 * @return {dynamic}
 * @return {void}
 *
 */
//Linear probing with step of 1 can use
//the instant clean-up algorithm from
//http://en.wikipedia.org/wiki/Open_addressing
//instead of marking slots as deleted.
method["delete"] = method.unset = method.remove = function remove( key ) {
    var bucketIndex = hash( key, this._capacity ),
        capacity = this._capacity - 1,
        buckets = this._buckets;
    while( true ) {
        var k = buckets[ bucketIndex << 1 ];

        if( k === void 0 ) {
            //key is not in table
            return void 0;
        }
        else if( this._equality( k, key ) ) {
            break;
        }

        bucketIndex = ( 1 + bucketIndex ) & capacity;
    }

    var entryIndex = bucketIndex;
    var ret = buckets[ ( bucketIndex << 1 ) + 1 ];

    buckets[ ( bucketIndex << 1 ) ] =
        buckets[ ( bucketIndex << 1 ) + 1 ] = void 0;

    this._modCount++;

    while( true ) {
        entryIndex = ( 1 + entryIndex ) & capacity;

        var slotKey = buckets[ entryIndex << 1 ];

        if( slotKey === void 0 ) {
            break;
        }

        var k = hash( slotKey, capacity + 1 );

        if ( ( bucketIndex <= entryIndex ) ?
            ( ( bucketIndex < k ) && ( k <= entryIndex ) ) :
            ( ( bucketIndex < k ) || ( k <= entryIndex ) ) ) {
            continue;
        }

        buckets[ ( bucketIndex << 1 ) ] = buckets[ ( entryIndex << 1 ) ];
        buckets[ ( bucketIndex << 1 ) + 1 ] =
            buckets[ ( entryIndex << 1 ) + 1 ];

        bucketIndex = entryIndex;

        buckets[ ( bucketIndex << 1 ) ] =
            buckets[ ( bucketIndex << 1 ) + 1 ] = void 0;
    }

    this._size--;
    return ret;
};

/**
 * Insert the given key-value pairs into the map. Can be given in the form
 * of an array of tuples, another Map, or an Object which will be
 * reflectively iterated over for string keys.
 *
 * Array of tuples example:
 *
 * map.setAll([
 *      [0, "zero"],
 *      [5, "five"],
 *      [10, "ten"],
 *      [13, "thirteen"]
 * ]);
 *
 * The array of tuples syntax supports all types of keys, not just strings.
 *
 * @param {Array.<Tuple>|Map|Object} obj Description of obj parameter.
 * @return {void}
 *
 */
method.putAll = method.setAll = function setAll( obj ) {
    this._modCount++;
    var listOfTuples = toListOfTuples( obj );
    this._setAll( listOfTuples );
};

/**
 * Remove everything in the map.
 *
 * @return {void}
 *
 */
method.clear = function clear() {
    this._modCount++;
    this._capacity = DEFAULT_CAPACITY;
    this._size = 0;
    this._makeBuckets();
};

/**
 * Returns the amount of items in the map.
 *
 * @return {int}
 *
 */
method.length = method.size = function size() {
    return this._size;
};

/**
 * See if the map doesn't contain anything.
 *
 * @return {boolean}
 *
 */
method.isEmpty = function isEmpty() {
    return this._size === 0;
};

/**
 * Automatically called by JSON.stringify. If you later parse the JSON
 * you can pass the array of tuples to a map constructor.
 *
 * @return {Array.<Tuple>}
 *
 */
method.toJSON = MapToJSON;

/**
 * Returns a string representation of the map.
 *
 * @return {String}
 *
 */
method.toString = MapToString;

/**
 * Returns a hash code for the map.
 *
 * @return {int}
 *
 */
method.valueOf = MapValueOf;

/**
 * Returns the keys in the map as an array.
 *
 * Iteration can be very slow in an unordered map.
 *
 * @return {Array.<dynamic>}
 *
 */
method.keys = MapKeys;

/**
 * Returns the values in the map as an array.
 *
 * Iteration can be very slow in an unordered map.
 *
 * @return {Array.<dynamic>}
 *
 */
method.values = MapValues;

/**
 * Returns the key-value pairs in the map as an array of tuples.
 *
 * Iteration can be very slow in an unordered map.
 *
 * @return {Array.<Tuple>}
 *
 */
method.entries = MapEntries;

/**
 * Returns an Iterator for the map. The iterator will become invalid
 * if the map is modified outside that iterator.
 *
 * Iteration can be very slow in an unordered map.
 *
 * @return {MapIterator}
 *
 */
method.iterator = function iterator() {
    return new Iterator( this );
};

var Iterator = (function() {
    /**
     * Iterator constructor for the unordered map.
     *
     * If the iterator cursor is currently pointing at a valid
     * entry, you can retrieve the entry's key, value and index
     * from the iterator .key, .value and .index properties
     * respectively.
     *
     * For performance, they are just simple properties but
     * they are meant to be read-only.
     *
     * You may reset the cursor at no cost to the beginning (
     * .moveToStart()) or to the end (.moveToEnd()).
     *
     * You may move the cursor one item forward (.next())
     * or backward (.prev()).
     *
     * Example:
     *
     * var it = map.iterator();
     *
     * while( it.next() ) {
     *      console.log( it.key, it.value, it.index );
     * }
     * //Cursor is now *after* the last entry
     * while( it.prev() ) { //Iterate backwards
     *      console.log( it.key, it.value, it.index );
     * }
     * //Cursor is now *before*the first entry
     *
     * Iteration can be very slow in an unordered map.
     *
     * @param {Map} map Description of map parameter.
     * @constructor
     */
    function Iterator( map ) {
        this.key = this.value = void 0;
        this.index = -1;
        this._modCount = map._modCount;

        this._indexDelta = 1;
        this._index = -1;
        this._map = map;
        this._bucketIndex = -1;
    }
    var method = Iterator.prototype;

    /**
     * Internal
     *
     * @return {void}
     *
     */
    method._checkModCount = MapIteratorCheckModCount;

    /**
     * Internal.
     *
     * @return {void}
     *
     */
    method._moveToNextBucketIndex = function _moveToNextBucketIndex() {
        var i = ( this._bucketIndex << 1 ) + ( this._indexDelta << 1 ),
            b = this._map._buckets,
            l = b.length;

        for( ; i < l; i += 2 ) {
            if( b[i] !== void 0 ) {
                this.key = b[i];
                this.value = b[i+1];
                this._bucketIndex = i >> 1;
                break;
            }
        }
    };

    /**
     * Internal.
     *
     * @return {void}
     *
     */
    method._moveToPrevBucketIndex = function _moveToPrevBucketIndex() {
        var i = ( this._bucketIndex << 1 ) - 2,
            b = this._map._buckets;

        for( ; i >= 0; i -= 2 ) {
            if( b[i] !== void 0 ) {
                this.key = b[i];
                this.value = b[i+1];
                this._bucketIndex = i >> 1;
                break;
            }
        }
    };

    //API

    /**
     * Move the cursor forward by one position. Returns true if the cursor is
     * pointing at a valid entry. Returns false otherwise.
     *
     * @return {boolean}
     *
     */
    method.next = function next() {
        this._checkModCount();
        this._index += this._indexDelta;

        if( this._index >= this._map._size ) {
            this.moveToEnd();
            return false;
        }

        this._moveToNextBucketIndex();
        this.index = this._index;
        this._indexDelta = 1;

        return true;
    };

    /**
     * Move the cursor backward by one position. Returns true if the cursor is
     * pointing at a valid entry. Returns false otherwise.
     *
     * @return {boolean}
     *
     */
    method.prev = function prev() {
        this._checkModCount();
        this._index--;

        if( this._index < 0 ||
            this._map._size === 0 ) {
            this.moveToStart();
            return false;
        }

        this._moveToPrevBucketIndex();
        this.index = this._index;

        this._indexDelta = 1;

        return true;
    };

    /**
     * Move the cursor before the first entry. The cursor is not
     * pointing at a valid entry, you may move to the first entry after
     * calling this method by calling .next().
     *
     * This method operates in constant time.
     *
     * @return {MapIterator}
     *
     */
    method.moveToStart = function moveToStart() {
        this._checkModCount();
        this.key = this.value = void 0;
        this.index = -1;
        this._index = -1;
        this._bucketIndex = -1;
        this._indexDelta = 1;

        return this;
    };

    /**
     * Move the cursor after the last entry. The cursor is not pointing at
     * a valid entry, you may move to the last entry after calling this
     * method by calling .prev().
     *
     * This method operates in constant time.
     *
     * @return {MapIterator}
     *
     */
    method.moveToEnd = function moveToEnd() {
        this._checkModCount();
        this.key = this.value = void 0;
        this._index = this._map._size;
        this.index = -1;
        this._bucketIndex = this._map._capacity;
        this._indexDelta = 1;

        return this;
    };

    /**
     * If the cursor is pointing at a valid entry, you may update
     * the entry's value with this method without invalidating
     * the iterator.
     *
     * An iterator becomes invalid if the map is modified behind
     * its back.
     *
     * You may call this method multiple times while the cursor
     * is pointing at the same entry, with each call replacing the
     * last call's value for the key.
     *
     * Returns the previous value that was associated with the key.
     * Returns undefined if the cursor was not pointing at an entry.
     *
     * @param {dynamic} value The value to associate
     * with the current cursor's key in the map.
     * @return {dynamic}
     * @return {void}
     *
     */
    method.set = method.put = function put( value ) {
        this._checkModCount();
        var i = this._bucketIndex;

        if( i < 0 || i >= this._map._capacity ) {
            return;
        }

        var ret = this.value;
        this._map._buckets[ ( i << 1 ) + 1 ] = this.value = value;
        return ret;
    };

    /**
     * If the cursor is pointing at a valid entry, you may delete
     * the entry's associated key-value mapping from the map with
     * this method without invalidating the iterator.
     *
     * An iterator becomes invalid if the map is modified behind
     * its back.
     *
     * After successfully calling this method (deletion happend),
     * the cursor does not point at anything. After deletion, you
     * may move the cursor normally with the cursor traversal
     * methods.
     *
     * If deletion happened, returns the value that was associated
     * with the deleted key. Returns undefined otherwise.
     *
     * @return {dynamic}
     * @return {void}
     *
     */
    method["delete"] = method.remove = method.unset = function remove() {
        this._checkModCount();

        var i = this._bucketIndex;

        if( i < 0 || i >= this._map._capacity ||
            this.key === void 0 ) {
            return;
        }

        var ret = this._map.remove( this.key );
        this._modCount = this._map._modCount;
        this.key = this.value = void 0;
        this.index = -1;

        this._indexDelta = 0;

        return ret;
    };

    return Iterator;
})();

method._Iterator = Iterator;


return Map;})();;
/* global MapIteratorCheckModCount, DEFAULT_CAPACITY, isArray,
    pow2AtLeast, hash, equality */
/* exported OrderedMap */
var OrderedMap = (function() {

var INSERTION_ORDER = OrderedMap._INSERTION_ORDER = {};
var ACCESS_ORDER = OrderedMap._ACCESS_ORDER = {};

/**
 * Constructor for ordered maps. Ordered map is like map except
 * it has an inherent order. The inherent order is by default
 * the order entries are inserted into the map.
 *
 * You may use OrderedMap.inAccessOrder() constructor to construct
 * an ordered map that is ordered according to access order. Any
 * access will bump the target entry at the end of the map.
 *
 * Compared to Map, OrderedMap is less memory efficient,
 * lookup is slightly slower but iteration is faster.
 *
 * The undefined value is not supported as a key nor as a value. Use
 * null instead.
 *
 * Ordering gives a meaning to operations like firstKey, firstValue,
 * lastKey, lastValue, nthKey, nthValue, indexOfKey, indexOfValue and so on.
 *
 * Deletion of an entry doesn't affect order of other entries
 * in either ordering mode.
 *
 * Array of tuples initialization:
 *
 * var map = OrderedMap([
 *      [0, "zero"],
 *      [5, "five"],
 *      [10, "ten"],
 *      [13, "thirteen"]
 * ]);
 *
 * @param {int=|Object=|Array.<Tuple>|Map} capacity The initial capacity.
 * Can also be a object, array of tuples or another map to initialize
 * the ordered map.
 * @constructor
 */
function OrderedMap( capacity ) {
    this._buckets = null;
    this._size = 0;
    this._modCount = 0;
    this._capacity = DEFAULT_CAPACITY;
    this._equality = equality.simpleEquals;
    this._usingSimpleEquals = true;
    this._ordering = INSERTION_ORDER;
    this._firstEntry = this._lastEntry = null;
    this._init( capacity );
}
var method = OrderedMap.prototype;

/**
 * Constructs an ordered map that is ordered according
 * to accesses.
 * @param {int=|Object=|Array.<Tuple>|Map} capacity The initial capacity.
 * Can also be a object, array of tuples or another map to initialize
 * the ordered map.
 */
OrderedMap.inAccessOrder = function inAccessOrder( capacity ) {
    var ret = new OrderedMap( capacity );
    ret._ordering = ACCESS_ORDER;
    return ret;
};

/**
 * Internal.
 *
 *
 */
method._init = Map.prototype._init;

/**
 * Internal.
 *
 *
 */
method._checkEquals = Map.prototype._checkEquals;

/**
 * Internal.
 *
 *
 */
method._resizeTo = Map.prototype._resizeTo;

/**
 * Internal.
 *
 *
 */
method._getNextCapacity = Map.prototype._getNextCapacity;

/**
 * Internal.
 *
 *
 */
method._isOverCapacity = Map.prototype._isOverCapacity;

/**
 * Internal.
 *
 *
 */
method._checkResize = Map.prototype._checkResize;

/**
 * Internal.
 *
 *
 */
method._resized = function _resized() {
    var newBuckets = this._buckets,
        entry = this._firstEntry;

    while( entry !== null ) {
        var bucketIndex = this._keyAsBucketIndex( entry.key );

        entry.next = newBuckets[bucketIndex];
        newBuckets[bucketIndex] = entry;

        entry = entry.nextEntry;
    }
};

/**
 * Internal.
 *
 *
 */
method._makeBuckets = function _makeBuckets() {
    var capacity = this._capacity;
    var b = this._buckets = new Array( capacity < 10000 ? capacity : 0 );

    for( var i = 0; i < capacity; ++i ) {
        b[i] = null;
    }
};

/**
 * Internal.
 *
 *
 */
method._keyAsBucketIndex = function _keyAsBucketIndex( key ) {
    if( this._buckets === null ) {
        this._makeBuckets();
    }
    return hash( key, this._capacity );
};

/**
 * Internal.
 *
 *
 */
method._getEntryWithKey = function _getEntryWithKey( entry, key ) {
    var eq = this._equality;
    while( entry !== null ) {
        if( eq( entry.key, key ) ) {
            return entry;
        }
        entry = entry.next;
    }
    return null;
};

/**
 * Internal.
 *
 *
 */
                        //Used by OrderedSet
method._setAll = function _setAll( obj, __value ) {
    if( !obj.length ) {
        return;
    }
    var newSize = obj.length + this._size;

    if( this._isOverCapacity( newSize ) ) {
        var capacity = pow2AtLeast( newSize );
        if( ( ( newSize << 2 ) - newSize ) >= ( capacity << 1 ) ) {
            capacity = capacity << 1;
        }
        this._resizeTo( capacity );
    }

    if( arguments.length > 1 ) {
        for( var i = 0; i < obj.length; ++i ) {
            this.set( obj[i], __value );
        }
    }
    else {
        for( var i = 0; i < obj.length; ++i ) {
            this.set( obj[i][0], obj[i][1] );
        }
    }
};

//API

/**
 * Simple way to iterate the map. The callback fn receives arguments:
 *
 * {dynamic} value, {dynamic} key, {integer} index
 *
 * @param {function} fn Description of fn parameter.
 * @param {Object=} ctx Description of ctx parameter.
 * @return {void}
 *
 */
method.forEach = Map.prototype.forEach;

/**
 * Returns the amount of items in the map.
 *
 * @return {int}
 *
 */
method.length = method.size = Map.prototype.size;

/**
 * See if the map doesn't contain anything.
 *
 * @return {boolean}
 *
 */
method.isEmpty = Map.prototype.isEmpty;

/**
 * Automatically called by JSON.stringify. If you later parse the JSON
 * you can pass the array of tuples to a map constructor.
 *
 * @return {Array.<Tuple>}
 *
 */
method.toJSON = Map.prototype.toJSON;

/**
 * Returns a string representation of the map.
 *
 * @return {String}
 *
 */
method.toString = Map.prototype.toString;

/**
 * Returns a hash code for the map.
 *
 * @return {int}
 *
 */
method.valueOf = Map.prototype.valueOf;

/**
 * Returns the keys in the map as an array.
 *
 * @return {Array.<dynamic>}
 *
 */
method.keys = Map.prototype.keys;

/**
 * Returns the values in the map as an array.
 *
 * @return {Array.<dynamic>}
 *
 */
method.values = Map.prototype.values;

/**
 * Returns the key-value pairs in the map as an array of tuples.
 *
 * Iteration can be very slow in an unordered map.
 *
 * @return {Array.<Tuple>}
 *
 */
method.entries = Map.prototype.entries;

/**
 * Insert the given key-value pairs into the map. Can be given in the form
 * of an array of tuples, another Map, or an Object which will be
 * reflectively iterated over for string keys.
 *
 * Array of tuples example:
 *
 * map.setAll([
 *      [0, "zero"],
 *      [5, "five"],
 *      [10, "ten"],
 *      [13, "thirteen"]
 * ]);
 *
 * The array of tuples syntax supports all types of keys, not just strings.
 *
 * @param {Array.<Tuple>|Map|Object} obj Description of obj parameter.
 * @return {void}
 *
 */
method.putAll = method.setAll = Map.prototype.putAll;

/**
 * See if the key is contained in the map.
 *
 * @param {dynamic} key The key to lookup.
 * @return {boolean}
 *
 */
method.containsKey = method.hasKey = Map.prototype.hasKey;

/**
 * Returns a shallow clone of the ordered map.
 *
 * @return {OrderedMap}
 *
 */
method.clone = function clone() {
    if( this._ordering === ACCESS_ORDER ) {
        return OrderedMap.inAccessOrder( this.entries() );
    }
    else {
        return new OrderedMap( this.entries() );
    }
};

/**
 * Associate a value with a key. If the key is already in the
 * map, that key is updated with the given value. Otherwise a
 * new entry is added.
 *
 * If a value was updated, returns the old value. If the key was
 * inserted into the map, returns undefined.
 *
 * The undefined value is not supported as a key nor as a value. Use
 * null instead.
 *
 * @param {dynamic} key The key to associate with value.
 * @param {dynamic} value The value to associate with key.
 * @return {dynamic}
 * @return {void}
 * @throws {Error} When key or value is undefined
 *
 */
method.put = method.set = function put( key, value ) {
    if( key === void 0 || value === void 0) {
        throw new Error( "Cannot use undefined as a key or value" );
    }
    if( isArray( key ) ) {
        this._checkEquals();
    }
    var bucketIndex = this._keyAsBucketIndex( key ),
        ret = void 0,
        oldEntry = this._buckets[bucketIndex],
        entry = this._getEntryWithKey( oldEntry, key );

    this._modCount++;
    if( entry === null ) {
        this._size++;
        this._buckets[ bucketIndex ] = entry =
            new Entry( key, value, oldEntry );

        entry.inserted( this );
        this._checkResize();
    }
    else {
        ret = entry.value;
        entry.value = value;
        entry.accessed( this );
    }

    return ret;
};

/**
 * Removes a value associated with the given key in the map. If the
 * key is not in the map, returns undefined. If the key is in the map,
 * returns the value associated with the key.
 *
 * You can check if the removal was successful by checking
 *
 * map.remove( myKey ) !== void 0
 *
 * The undefined value as a key or value is not supported. Use null instead.
 *
 * @param {dynamic} key The key to remove from the map.
 * @return {dynamic}
 * @return {void}
 *
 */
method["delete"] = method.unset = method.remove = function remove( key ) {
    if( key === void 0 ) {
        return void 0;
    }
    var bucketIndex = this._keyAsBucketIndex( key ),
        ret = void 0,
        entry = this._buckets[bucketIndex],
        eq = this._equality,
        prevEntry = null;

    var eq = this._equality;

    //Find the entry in the bucket
    while( entry !== null ) {
        if( eq( entry.key, key ) ) {
            break;
        }
        prevEntry = entry;
        entry = entry.next;
    }

    //It was found in the bucket, remove
    if( entry !== null ) {
        this._modCount++;
        ret = entry.value;
        if( prevEntry === null) { //It was the first entry in the bucket
            this._buckets[bucketIndex] = entry.next;
        }
        else {
            prevEntry.next = entry.next;
        }
        this._size--;
        entry.removed( this );
    }
    return ret;
};

/**
 * Get the value associated with the given key in this map.
 *
 * Returns undefined if not found.
 *
 * Key cannot be undefined. Use null instead.
 *
 * @param {dynamic} key The key to lookup value for.
 * @return {dynamic}
 * @return {void}
 *
 */
method.get = function get( key ) {
    if( key === void 0 ) {
        return void 0;
    }
    var bucketIndex = this._keyAsBucketIndex( key ),
        entry = this._getEntryWithKey( this._buckets[bucketIndex], key );

    if( entry !== null ) {
        entry.accessed( this );
        return entry.value;
    }
    return void 0;
};

/**
 * See if the value is contained in the map.
 *
 * @param {dynamic} value The value to lookup.
 * @return {boolean}
 *
 */
method.containsValue = method.hasValue = function hasValue( value ) {
    return this.indexOfValue( value ) !== -1;
};

/**
 * Find the zero-based index of the key in the map. O(n).
 *
 * Returns -1 if the key is not in the map.
 *
 * Key cannot be undefined. Use null instead.
 *
 * @param {dynamic} key The key to lookup index for.
 * @return {int}
 *
 */
method.indexOfKey = function indexOfKey( key ) {
    if( this._firstEntry === null ) {
        return -1;
    }
    var eq = this._equality,
        entry = this._firstEntry,
        i = 0;

    while( entry !== null ) {
        if( eq( entry.key, key ) ) {
            return i;
        }
        i++;
        entry = entry.nextEntry;
    }
    return -1;
};

/**
 * Find the zero-based index of the value in the map. O(n).
 *
 * Returns -1 if the value is not in the map.
 *
 * @param {dynamic} value The value to lookup index for.
 * @return {int}
 *
 */
method.indexOfValue = function indexOfValue( value ) {
    if( this._firstEntry === null ) {
        return -1;
    }
    var entry = this._firstEntry,
        i = 0;

    while( entry !== null ) {
        if( entry.value === value ) {
            return i;
        }
        i++;
        entry = entry.nextEntry;
    }
    return -1;
};

/**
 * Returns the first key in the map. Returns
 * undefined if the map is empty. O(1).
 *
 * @return {dynamic}
 *
 */
method.firstKey = function firstKey() {
    if( this._firstEntry === null ) {
        return void 0;
    }
    return this._firstEntry.key;
};

/**
 * Returns the first value in the map. Returns
 * undefined if the map is empty. O(1).
 *
 * @return {dynamic}
 *
 */
method.first = function first() {
    return this.get( this.firstKey() );
};

/**
 * Returns the last key in the map. Returns
 * undefined if the map is empty. O(1).
 *
 * @return {dynamic}
 *
 */
method.lastKey = function lastKey( ) {
    if( this._firstEntry === null ) {
        return void 0;
    }

    return this._lastEntry.key;
};

/**
 * Returns the last value in the map. Returns
 * undefined if the map is empty. O(1).
 *
 * @return {dynamic}
 *
 */
method.last = function last() {
    return this.get( this.lastKey() );
};

/**
 * Returns the nth key (0-based) in the map. Returns
 * undefined if the index is out of bounds. O(N).
 *
 * @return {dynamic}
 *
 */
method.nthKey = function nthKey( index ) {
    if( index < 0 || index >= this._size ) {
        return void 0;
    }
    var entry = this._firstEntry;
    var i = 0;
    while( i < index ) {
        entry = entry.nextEntry;
        i++;
    }
    return entry.key;
};

/**
 * Returns the nth value (0-based) in the map. Returns
 * undefined if the index is out of bounds. O(N).
 *
 * @return {dynamic}
 *
 */
method.nth = method.nthValue = function nth( index ) {
    return this.get( this.nthKey( index ) );
};


/**
 * Remove everything in the map.
 *
 * @return {void}
 *
 */
method.clear = function clear() {
    this._modCount++;
    this._capacity = DEFAULT_CAPACITY;
    this._size = 0;
    this._firstEntry = this._lastEntry = null;
    this._makeBuckets();
};

/**
 * Returns an Iterator for the map. The iterator will become invalid
 * if the map is modified outside the iterator's methods.
 *
 * @return {MapIterator}
 *
 */
method.iterator = function iterator() {
    return new Iterator( this );
};

var Iterator = (function() {


    /**
     * Iterator constructor for the ordered map.
     *
     * If the iterator cursor is currently pointing at a valid
     * entry, you can retrieve the entry's key, value and index
     * from the iterator .key, .value and .index properties
     * respectively.
     *
     * For performance, they are just simple properties but
     * they are meant to be read-only.
     *
     * You may reset the cursor at no cost to the beginning (
     * .moveToStart()) or to the end (.moveToEnd()).
     *
     * You may move the cursor one item forward (.next())
     * or backward (.prev()).
     *
     * Example:
     *
     * var it = map.iterator();
     *
     * while( it.next() ) {
     *      console.log( it.key, it.value, it.index );
     * }
     * //Cursor is now *after* the last entry
     * while( it.prev() ) { //Iterate backwards
     *      console.log( it.key, it.value, it.index );
     * }
     * //Cursor is now *before*the first entry
     *
     *
     * @param {OrderedMap} map Description of map parameter.
     * @constructor
     */
    function Iterator( map ) {
        this.key = this.value = void 0;
        this.index = -1;
        this._modCount = map._modCount;

        this._index = -1;
        this._map = map;
        this._backingEntry = null;
        this._currentEntry = null;
    }
    var method = Iterator.prototype;

    /**
     * Internal.
     *
     *
     */
    method._checkModCount = MapIteratorCheckModCount;

    /**
     * Internal.
     *
     *
     */
    method._getNextEntry = function _getNextEntry() {
        if( this._backingEntry !== null ) {
            var ret = this._backingEntry;
            this._backingEntry = null;
            this._index--;
            return ret;
        }
        if( this._currentEntry === null ) {
            return this._map._firstEntry;
        }
        else {
            return this._currentEntry.nextEntry;
        }
    };

    /**
     * Internal.
     *
     *
     */
    method._getPrevEntry = function _getPrevEntry() {
        if( this._backingEntry !== null ) {
            var ret = this._backingEntry;
            this._backingEntry = null;
            return ret.prevEntry;
        }
        if( this._currentEntry === null ) {
            return this._map._lastEntry;
        }
        else {
            return this._currentEntry.prevEntry;
        }
    };

    /**
     * Move the cursor forward by one position. Returns true if the cursor is
     * pointing at a valid entry. Returns false otherwise.
     *
     * @return {boolean}
     *
     */
    method.next = function next() {
        this._checkModCount();
        this._index++;

        if( this._backingEntry === null &&
            this._index >= this._map._size ) {
            this.moveToEnd();
            return false;
        }

        var entry = this._currentEntry = this._getNextEntry();

        this.key = entry.key;
        this.value = entry.value;
        this.index = this._index;

        return true;
    };

    /**
     * Move the cursor backward by one position. Returns true if the cursor is
     * pointing at a valid entry. Returns false otherwise.
     *
     * @return {boolean}
     *
     */
    method.prev = function prev() {
        this._checkModCount();
        this._index--;

        if( this._index < 0 ||
            this._map._size === 0 ) {
            this.moveToStart();
            return false;
        }
        var entry = this._currentEntry = this._getPrevEntry();

        this.key = entry.key;
        this.value = entry.value;
        this.index = this._index;


        return true;
    };

    /**
     * Move the cursor before the first entry. The cursor is not
     * pointing at a valid entry, you may move to the first entry after
     * calling this method by calling .next().
     *
     * This method operates in constant time.
     *
     * @return {MapIterator}
     *
     */
    method.moveToStart = function moveToStart() {
        this._checkModCount();
        this.key = this.value = void 0;
        this.index = -1;
        this._index = -1;
        this._backingEntry = this._currentEntry = null;

        return this;
    };

    /**
     * Move the cursor after the last entry. The cursor is not pointing at
     * a valid entry, you may move to the last entry after calling this
     * method by calling .prev().
     *
     * This method operates in constant time.
     *
     * @return {MapIterator}
     *
     */
    method.moveToEnd = function moveToEnd() {
        this._checkModCount();
        this.key = this.value = void 0;
        this._index = this._map._size;
        this.index = -1;
        this._backingEntry = this._currentEntry = null;

        return this;
    };

    /**
     * If the cursor is pointing at a valid entry, you may update
     * the entry's value with this method without invalidating
     * the iterator.
     *
     * An iterator becomes invalid if the map is modified behind
     * its back.
     *
     * You may call this method multiple times while the cursor
     * is pointing at the same entry, with each call replacing the
     * last call's value for the key.
     *
     * Returns the previous value that was associated with the key.
     * Returns undefined if the cursor was not pointing at an entry.
     *
     * @param {dynamic} value The value to associate
     * with the current cursor's key in the map.
     * @return {dynamic}
     * @return {void}
     *
     */
    method.set = method.put = function put( value ) {
        this._checkModCount();

        if( this._currentEntry === null ) {
            return;
        }

        var ret = this.value;
        this._currentEntry.value = this.value = value;
        return ret;
    };

    /**
     * If the cursor is pointing at a valid entry, you may delete
     * the entry's associated key-value mapping from the map with
     * this method without invalidating the iterator.
     *
     * An iterator becomes invalid if the map is modified behind
     * its back.
     *
     * After successfully calling this method (deletion happend),
     * the cursor does not point at anything. After deletion, you
     * may move the cursor normally with the cursor traversal
     * methods.
     *
     * If deletion happened, returns the value that was associated
     * with the deleted key. Returns undefined otherwise.
     *
     * @return {dynamic}
     * @return {void}
     *
     */
    method["delete"] = method.remove = function remove() {
        this._checkModCount();

        if( this._currentEntry === null ) {
            return;
        }
        var entry = this._currentEntry,
            backingEntry,
            ret = entry.value;

        backingEntry = this._backingEntry = entry.nextEntry;

        this._map.remove( this.key );
        this._modCount = this._map._modCount;
        this.key = this.value = void 0;
        this.index = -1;

        if( backingEntry === null ) {
            this.moveToEnd();
        }

        return ret;
    };


    return Iterator;
})();

method._Iterator = Iterator;

var Entry = (function() {

    /**
     * Ordered maps use separate chaining with linked lists
     * to maintain reasonable performance.
     *
     * @constructor
     *
     */
    function Entry( key, value, next ) {
        this.key = key;
        this.value = value;
        this.next = next;

        this.prevEntry = this.nextEntry = null;
    }
    var method = Entry.prototype;

    /**
     * When an entry is inserted, it should be placed
     * at the end for both access order and insert orderd
     * maps.
     *
     * @param {OrderedMap} map The map this entry was inserted
     * into.
     * @return {void}
     *
     */
    method.inserted = function inserted( map ) {
        if( map._firstEntry === null ) {
            map._firstEntry = map._lastEntry = this;
        }
        else if( map._firstEntry === map._lastEntry ) {
            map._lastEntry = this;
            map._firstEntry.nextEntry = this;
            this.prevEntry = map._firstEntry;
        }
        else {
            var last = map._lastEntry;
            map._lastEntry = this;
            last.nextEntry = this;
            this.prevEntry = last;
        }
    };

    /**
     * When an entry is removed, bookkeeping within the map's
     * backing linked list needs to be performed.
     *
     * @param {OrderedMap} map The map this entry was removed
     * from.
     * @return {void}
     */
    method.removed = function removed( map ) {
        var prev = this.prevEntry,
            next = this.nextEntry,
            prevIsNull = prev === null,
            nextIsNull = next === null;

        this.prevEntry = this.nextEntry =
            this.key = this.value = this.next = null;

        if( prevIsNull && nextIsNull ) {
            map._firstEntry = map._lastEntry = null;
        }
        else if( nextIsNull ) {
            map._lastEntry = prev;
            map._lastEntry.nextEntry = null;
        }
        else if( prevIsNull ) {
            map._firstEntry = next;
            map._firstEntry.prevEntry = null;
        }
        else {
            next.prevEntry = prev;
            prev.nextEntry = next;
        }
    };

    /**
     * When an entry is accessed (get or value update), ordered maps
     * using access order have to move the entry to the back.
     *
     * @param {OrderedMap} map The map this entry was accessed in.
     * @return {void}
     */
    method.accessed = function accessed( map ) {
        if( map._ordering === ACCESS_ORDER &&
            map._firstEntry !== null &&
            map._firstEntry !== map._lastEntry &&
            map._lastEntry !== this ) {
            var prev = this.prevEntry,
                next = this.nextEntry;

            if( prev !== null ) {
                prev.nextEntry = next;
            }
            else {
                map._firstEntry = next;
            }
            next.prevEntry = prev;

            var last = map._lastEntry;

            this.nextEntry = null;
            this.prevEntry = last;
            last.nextEntry = this;
            map._lastEntry = this;
        }
    };

    return Entry;
})();

return OrderedMap;})();;
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
})();;
/* global toList, SetForEach,
    SetToJSON, SetToString, SetValueOf, SetIteratorCheckModCount,
    hash, MapValues, isArray, pow2AtLeast,
    clampCapacity, equality, DEFAULT_CAPACITY, LOAD_FACTOR */
/* exported Set */
/* jshint -W079 */
var Set = (function() {
/**
 * Constructor for sets. Set is a unique collection of values, without
 * any ordering. It is not backed by a map and the memory usage is thus
 * incredibly low.
 *
 * The undefined value is not supported as a value. Use
 * null instead.
 *
 * If ordering is needed consider OrderedSet or SortedSet.
 *
 * @param {int=|Array.<dynamic>|Set} capacity The initial capacity.
 * Can also be an array or another set to initialize the set.
 * @constructor
 */
function Set( capacity ) {
    this._buckets = null;
    this._size = 0;
    this._modCount = 0;
    this._capacity = DEFAULT_CAPACITY;
    this._equality = equality.simpleEquals;
    this._usingSimpleEquals = true;
    this._init( capacity );
}
var method = Set.prototype;

/**
 * Internal.
 *
 * @param {int=} capacity Description of capacity parameter.
 * @return {void}
 *
 */
method._init = function _init( capacity ) {
    if( capacity == null ) {
        this._makeBuckets();
        return;
    }

    switch( typeof capacity ) {
    case "number":
        this._capacity =
            clampCapacity( pow2AtLeast( capacity / LOAD_FACTOR ) );
        this._makeBuckets();
        break;
    case "object":
        var items = toList( capacity );
        var size = items.length;
        this._capacity = pow2AtLeast( size / LOAD_FACTOR );
        this._makeBuckets();
        this._addAll( items );
        break;
    default:
        this._makeBuckets();
    }
};

/**
 * Internal.
 *
 * @return {void}
 *
 */
method._checkEquals = Map.prototype._checkEquals;

/**
 * Internal.
 *
 * @return {void}
 *
 */
method._resizeTo = Map.prototype._resizeTo;

/**
 * Internal.
 *
 * @return {void}
 *
 */
method._getNextCapacity = Map.prototype._getNextCapacity;

/**
 * Internal.
 *
 * @return {void}
 *
 */
method._isOverCapacity = Map.prototype._isOverCapacity;

/**
 * Internal.
 *
 * @return {void}
 *
 */
method._checkResize = Map.prototype._checkResize;

/**
 * Internal.
 *
 * @return {void}
 *
 */
method._makeBuckets = function _makeBuckets() {
    var length = this._capacity << 0;

    var b = this._buckets = new Array( length < 100000 ? length : 0 );

    for( var i = 0; i < length; ++i ) {
        b[i] = void 0;
    }

};

/**
 * Internal.
 *
 * @param {Array.<dynamic>} oldBuckets Description of oldBuckets parameter.
 * @return {void}
 *
 */
method._resized = function _resized( oldBuckets ) {
    var newBuckets = this._buckets,
        oldLength = oldBuckets.length;

    for( var i = 0; i < oldLength; i++ ) {

        var value = oldBuckets[i];
        if( value !== void 0) {
            var newIndex = hash( value, this._capacity );

            while( newBuckets[ newIndex ] !== void 0 ) {
                newIndex = ( this._capacity - 1 ) & ( newIndex + 1 );
            }
            newBuckets[ newIndex ] = oldBuckets[ i ];
            oldBuckets[ i ] = void 0;
        }
    }
};


/**
 * Internal.
 *
 * @param {Array.<dynamic>} obj Description of obj parameter.
 * @return {void}
 *
 */
method._addAll = function _addAll( obj ) {
    if( !obj.length ) {
        return;
    }
    var newSize = obj.length + this._size;

    if( this._isOverCapacity( newSize ) ) {
        var capacity = pow2AtLeast( newSize );
        if( ( ( newSize << 2 ) - newSize ) >= ( capacity << 1 ) ) {
            capacity <<= 1;
            if( capacity < 100000 ) {
                capacity <<= 1;
            }
        }
        this._resizeTo( capacity );
    }

    for( var i = 0; i < obj.length; ++i ) {
        this.add( obj[i] );
    }

};

//API
/**
 * Simple way to iterate the set. The callback fn receives arguments:
 *
 * {dynamic} value, {integer} index
 *
 * Iteration can be very slow in an unordered set.
 *
 * @param {function} fn Description of fn parameter.
 * @param {Object=} ctx Description of ctx parameter.
 * @return {void}
 *
 */
method.forEach = SetForEach;

/**
 * Returns a shallow clone of the set.
 *
 * @return {Set}
 *
 */
method.clone = function clone() {
    return new this.constructor(
        this.toArray()
    );
};

/**
 * Add a value into the set. If the value is already in the
 * set, returns false. Returns true otherwise.
 *
 * The undefined value is not supported as a value. Use
 * null instead.
 *
 * @param {dynamic} value The value to add into the set.
 * @return {boolean}
 * @throws {Error} When value is undefined
 *
 */
method.add = function add( value ) {
    if( value === void 0 ) {
        throw new Error( "Cannot use undefined as a value" );
    }
    if( isArray( value ) ) {
        this._checkEquals();
    }
    var bucketIndex = hash( value, this._capacity ),
        capacity = this._capacity - 1,
        buckets = this._buckets;
    while( true ) {
        var k = buckets[ bucketIndex ];

        if( k === void 0 ) {
            buckets[ bucketIndex ] = value;
            this._size++;
            this._checkResize();
            this._modCount++;
            return true;
        }
        else if( this._equality( k, value ) === true ) {
            return false;
        }

        bucketIndex = ( 1 + bucketIndex ) & capacity;
    }
};

/**
 * Removes the given value from the set. If the
 * value is not in the set, returns false. If the value is in the
 * set, the value is removed and true is returned;
 *
 * You can check if the removal was successful by checking
 *
 * set.remove( value ) === true
 *
 * The undefined value as a value is not supported. Use null instead.
 *
 * @param {dynamic} value The value to remove from the set.
 * @return {boolean}
 *
 */
//Linear probing with step of 1 can use
//the instant clean-up algorithm from
//http://en.wikipedia.org/wiki/Open_addressing
//instead of marking slots as deleted.
method["delete"] = method.remove = function remove( value ) {
    var bucketIndex = hash( value, this._capacity ),
        capacity = this._capacity - 1,
        buckets = this._buckets;
    while( true ) {
        var k = buckets[ bucketIndex ];

        if( k === void 0 ) {
            //value is not in table
            return false;
        }
        else if( this._equality( k, value ) ) {
            break;
        }

        bucketIndex = ( 1 + bucketIndex ) & capacity;
    }

    var entryIndex = bucketIndex;
    buckets[ bucketIndex ] = void 0;
    this._modCount++;

    while( true ) {
        entryIndex = ( 1 + entryIndex ) & capacity;

        var slotValue = buckets[ entryIndex ];

        if( slotValue === void 0 ) {
            break;
        }

        var k = hash( slotValue, capacity + 1 );

        if ( ( bucketIndex <= entryIndex ) ?
            ( ( bucketIndex < k ) && ( k <= entryIndex ) ) :
            ( ( bucketIndex < k ) || ( k <= entryIndex ) ) ) {
            continue;
        }

        buckets[ bucketIndex  ] = buckets[ entryIndex ];
        bucketIndex = entryIndex;
        buckets[ bucketIndex ] = void 0;
    }

    this._size--;
    return true;
};

/**
 * Insert the given values into the set. Can be given in the form
 * of an array or another Set.
 *
 *
 * @param {Array.<dynamic>|Set} items Description of items parameter.
 * @return {void}
 *
 */
method.addAll = function addAll( items ) {
    this._addAll( toList( items ) );
};

/**
 * Remove everything in the set.
 *
 * @return {void}
 *
 */
method.clear = Map.prototype.clear;

/**
 * Returns the set as an array.
 *
 * Iteration can be very slow in an unordered set.
 *
 * @return {Array.<dynamic>}
 *
 */
method.values = method.toArray = MapValues;

/**
 * See if the value is contained in this set.
 *
 * Value cannot be undefined.
 *
 * @param {dynamic} value The value to look up.
 * @return {boolean}
 *
 */
method.contains = function contains( value ) {
    var capacity = this._capacity,
        buckets = this._buckets,
        bucketIndex = hash( value, capacity );

    while( true ) {
        var k = buckets[ bucketIndex ];

        if( k === void 0 ) {
            return false;
        }
        else if( this._equality( k, value ) ) {
            return true;
        }
        bucketIndex = ( 1 + bucketIndex ) & ( capacity - 1 );
    }
};

/**
 * Returns the amount of items in the set.
 *
 * @return {int}
 *
 */
method.size = method.length = Map.prototype.size;

/**
 * See if the set doesn't contain anything.
 *
 * @return {boolean}
 *
 */
method.isEmpty = Map.prototype.isEmpty;

/**
 * See if this set is a proper subset of the argument set.
 *
 * @param {Set} set The argument set.
 * @return {boolean}
 *
 */
method.subsetOf = function subsetOf( set ) {
    var it = this.iterator();
    while( it.next() ) {
        if( !set.contains( it.value ) ) {
            return false;
        }
    }
    return this.size() !== set.size();
};

/**
 * See if this set is a proper superset of the argument set.
 *
 * @param {Set} set The argument set.
 * @return {boolean}
 *
 */
method.supersetOf = function supersetOf( set ) {
    return set.subsetOf( this );
};

/**
 * See if this set is fully contained in the argument set.
 *
 * @param {Set} set The argument set.
 * @return {boolean}
 *
 */
method.allContainedIn = function allContainedIn( set ) {
    var it = this.iterator();
    while( it.next() ) {
        if( !set.contains( it.value ) ) {
            return false;
        }
    }
    return true;
};

/**
 * See if this set is fully contains the argument set.
 *
 * @param {Set} set The argument set.
 * @return {boolean}
 *
 */
method.containsAll = function containsAll( set ) {
    return set.allContainedIn( this );
};

/**
 * Returns a hash code for the set.
 *
 * @return {int}
 *
 */
method.valueOf = SetValueOf;

/**
 * Returns a string representation of the set.
 *
 * @return {String}
 *
 */
method.toString = SetToString;

/**
 * Automatically called by JSON.stringify. If you later parse the JSON
 * you can pass the array to a set constructor.
 *
 * @return {Array.<dynamic>}
 *
 */
method.toJSON = SetToJSON;

/**
 * Returns the union of the argument set and this set. The returned
 * set will have all the members that appear in this set, the second
 * set or both.
 *
 * @param {Set} a The set to union this set with.
 * @return {Set}
 *
 */
method.union = function union( a ) {
    var ret = new this.constructor( ( this.size() + a.size() ) / 0.67 );

    var aHas, bHas,
        itA = this.iterator(),
        itB = a.iterator();

    while( true ) {
        if( aHas = itA.next() ) {
            ret.add( itA.value );
        }
        if( bHas = itB.next() ) {
            ret.add( itB.value );
        }

        if( !aHas && !bHas ) {
            break;
        }
    }

    return ret;
};

/**
 * Returns the intersection of the argument set and this set. The returned
 * set will have all the members that appear in both this set and the
 * argument set.
 *
 * @param {Set} a The set to intersect this set with.
 * @return {Set}
 *
 */
method.intersection = function intersection( a ) {
    var ret = new this.constructor( Math.max( this.size(), a.size() ) / 0.67 );

    var src = this.size() < a.size() ? this : a,
        dst = src === a ? this : a,
        it = src.iterator();

    while( it.next() ) {
        if( dst.contains( it.value ) ) {
            ret.add( it.value );
        }
    }

    return ret;
};

/**
 * Returns the relative complement of this set in relation to the argument
 * set. The returned set will have all the members that are in this set
 * but were not in the argument set.
 *
 * Note that set1.complement(set2) is different from set2.complement(set1)
 *
 * @param {Set} a The set to complement this set with.
 * @return {Set}
 *
 */
method.complement = function complement( a ) {
    var ret = new this.constructor( Math.max( this.size(), a.size() ) / 0.67 );

    var it = this.iterator();

    while( it.next() ) {
        if( !a.contains( it.value ) ) {
            ret.add( it.value );
        }
    }
    return ret;
};

/**
 * Returns the symmetrict difference of this set and the argument set.
 * set. The returned set will have all the members that are in this set
 * and the argument set, but not those that are in both sets.
 *
 * This is relatively expensive operation, requiring iteration of both
 * sets currently.
 *
 * @param {Set} a The argument set.
 * @return {Set}
 *
 */
method.difference = function difference( a ) {
    var ret = new this.constructor( Math.max( this.size(), a.size() ) / 0.67 );

    var it = this.iterator();

    while( it.next() ) {
        if( !a.contains( it.value ) ) {
            ret.add( it.value );
        }
    }

    it = a.iterator();

    while( it.next() ) {
        if( !this.contains( it.value ) ) {
            ret.add( it.value );
        }
    }
    return ret;
};

/**
 * Returns an Iterator for the set. The iterator will become invalid
 * if the set is modified outside that iterator.
 *
 * Iteration can be very slow in an unordered set.
 *
 * @return {MapIterator}
 *
 */
method.iterator = function iterator() {
    return new Iterator( this );
};

var Iterator = (function() {
    /**
     * Iterator constructor for the unordered set.
     *
     * If the iterator cursor is currently pointing at a valid
     * entry, you can retrieve the entry's value and index
     * from the iterator .value and .index properties
     * respectively.
     *
     * For performance, they are just simple properties but
     * they are meant to be read-only.
     *
     * You may reset the cursor at no cost to the beginning (
     * .moveToStart()) or to the end (.moveToEnd()).
     *
     * You may move the cursor one item forward (.next())
     * or backward (.prev()).
     *
     * Example:
     *
     * var it = set.iterator();
     *
     * while( it.next() ) {
     *      console.log( it.value, it.index );
     * }
     * //Cursor is now *after* the last entry
     * while( it.prev() ) { //Iterate backwards
     *      console.log(  it.value, it.index );
     * }
     * //Cursor is now *before*the first entry
     *
     * Iteration can be very slow in an unordered set.
     *
     * @param {Set} set Description of set parameter.
     * @constructor
     */
    function Iterator( set ) {
        this.value = void 0;
        this.index = -1;
        this._modCount = set._modCount;

        this._indexDelta = 1;
        this._index = -1;
        this._set = set;
        this._bucketIndex = -1;
    }
    var method = Iterator.prototype;

    /**
     * Internal
     *
     * @return {void}
     *
     */
    method._checkModCount = SetIteratorCheckModCount;

    /**
     * Internal.
     *
     * @return {void}
     *
     */
    method._moveToNextBucketIndex = function _moveToNextBucketIndex() {
        var i = this._bucketIndex + this._indexDelta,
            b = this._set._buckets,
            l = b.length;
        for( ; i < l; i ++ ) {
            if( b[i] !== void 0 ) {
                this.value = b[i];
                this._bucketIndex = i;
                break;
            }
        }
    };

    /**
     * Internal.
     *
     * @return {void}
     *
     */
    method._moveToPrevBucketIndex = function _moveToPrevBucketIndex() {
        var i = this._bucketIndex - 1,
            b = this._set._buckets;
        for( ; i >= 0; i -- ) {
            if( b[i] !== void 0 ) {
                this.value = b[i];
                this._bucketIndex = i;
                break;
            }
        }
    };

    //API

    /**
     * Move the cursor forward by one position. Returns true if the cursor is
     * pointing at a valid entry. Returns false otherwise.
     *
     * @return {boolean}
     *
     */
    method.next = function next() {
        this._checkModCount();
        this._index += this._indexDelta;

        if( this._index >= this._set._size ) {
            this.moveToEnd();
            return false;
        }

        this._moveToNextBucketIndex();
        this.index = this._index;
        this._indexDelta = 1;

        return true;
    };

    /**
     * Move the cursor backward by one position. Returns true if the cursor is
     * pointing at a valid entry. Returns false otherwise.
     *
     * @return {boolean}
     *
     */
    method.prev = function prev() {
        this._checkModCount();
        this._index--;

        if( this._index < 0 ||
            this._set._size === 0 ) {
            this.moveToStart();
            return false;
        }

        this._moveToPrevBucketIndex();
        this.index = this._index;

        this._indexDelta = 1;

        return true;
    };

    /**
     * Move the cursor before the first entry. The cursor is not
     * pointing at a valid entry, you may move to the first entry after
     * calling this method by calling .next().
     *
     * This method operates in constant time.
     *
     * @return {SetIterator}
     *
     */
    method.moveToStart = function moveToStart() {
        this._checkModCount();
        this.value = void 0;
        this.index = -1;
        this._index = -1;
        this._bucketIndex = -1;
        this._indexDelta = 1;

        return this;
    };

    /**
     * Move the cursor after the last entry. The cursor is not pointing at
     * a valid entry, you may move to the last entry after calling this
     * method by calling .prev().
     *
     * This method operates in constant time.
     *
     * @return {SetIterator}
     *
     */
    method.moveToEnd = function moveToEnd() {
        this._checkModCount();
        this.value = void 0;
        this._index = this._set._size;
        this.index = -1;
        this._bucketIndex = this._set._capacity;
        this._indexDelta = 1;

        return this;
    };


    /**
     * If the cursor is pointing at a valid entry, you may delete
     * the value from the iterated set without invalidating this
     * iterator.
     *
     * An iterator becomes invalid if the set is modified behind
     * its back.
     *
     * After successfully calling this method (deletion happend),
     * the cursor does not point at anything. After deletion, you
     * may move the cursor normally with the cursor traversal
     * methods.
     *
     * If deletion happened, returns true. Returns false otherwise.
     *
     * @return {boolean}
     * @return {void}
     *
     */
    method["delete"] = method.remove = function remove() {
        this._checkModCount();

        var i = this._bucketIndex;

        if( i < 0 || i >= this._set._capacity ||
            this.value === void 0 ) {
            return false;
        }

        this._set.remove( this.value );
        this._modCount = this._set._modCount;
        this.value = void 0;
        this.index = -1;

        this._indexDelta = 0;

        return true;
    };


    return Iterator;
})();

method._Iterator = Iterator;


return Set;})();
;
/* global OrderedMap, setIteratorMethods, copyProperties,
    toList, SetForEach, toList */
/* exported OrderedSet */
var OrderedSet = (function() {
var __value = true;

/**
 * Constructor for ordered sets. Ordered set is like set except
 * it has an inherent order. The inherent order is the order
 * the values are inserted into the set in.
 *
 * Compared to Set, OrderedSet is extremely memory inefficient,
 * has slightly slower lookup but iteration is faster.
 *
 * The undefined value is not supported as a value. Use
 * null instead.
 *
 * Ordering gives a meaning to operations like first,
 * last, nth, indexOf and so on.
 *
 * Deletion of an entry doesn't affect order of other values.
 *
 * @param {int=|Array.<dynamic>|Set} capacity The initial capacity.
 * Can also be an array or another set to initialize the set.
 * @constructor
 */
function OrderedSet( capacity ) {
    this._map = null;
    this._init( capacity );
}
var method = OrderedSet.prototype;


/**
 * Internal.
 *
 *
 */

method._addAll = function _addAll( items ) {
    this._map._setAll( items, __value );
};

/**
 * Internal.
 *
 *
 */
method._init = function _init( capacity ) {
    if( typeof capacity === "object" &&
        capacity !== null ) {
        capacity = toList( capacity );
        this._map = new OrderedMap( capacity.length | 0 );
        this._addAll( capacity );
    }
    else if( typeof capacity === "number" ) {
        this._map = new OrderedMap( capacity );
    }
    else {
        this._map = new OrderedMap();
    }
};

//API

/**
 * Simple way to iterate the set. The callback fn receives arguments:
 *
 * {dynamic} value, {integer} index
 *
 * @param {function} fn Description of fn parameter.
 * @param {Object=} ctx Description of ctx parameter.
 * @return {void}
 *
 */
method.forEach = SetForEach;

/**
 * Returns a shallow clone of the set.
 *
 * @return {OrderedSet}
 *
 */
method.clone = function clone() {
    return new OrderedSet( this.toArray() );
};

/**
 * Add a value into the set. If the value is already in the
 * set, returns false. Returns true otherwise.
 *
 * The undefined value is not supported as a value. Use
 * null instead.
 *
 * @param {dynamic} value The value to add into the set.
 * @return {boolean}
 * @throws {Error} When value is undefined
 *
 */
method.add = function add( value ) {
    if( value === void 0) {
        throw new Error( "Cannot use undefined as a value" );
    }
    return this._map.put( value, __value ) === void 0;
};

/**
 * Removes the given value from the set. If the
 * value is not in the set, returns false. If the value is in the
 * set, the value is removed and true is returned;
 *
 * You can check if the removal was successful by checking
 *
 * set.remove( value ) === true
 *
 * The undefined value as a value is not supported. Use null instead.
 *
 * @param {dynamic} value The value to remove from the set.
 * @return {boolean}
 *
 */
method["delete"] = method.remove = function remove( value ) {
    return this._map.remove( value ) !== void 0;
};

/**
 * See if the value is contained in this set.
 *
 * Value cannot be undefined.
 *
 * @param {dynamic} value The value to look up.
 * @return {boolean}
 *
 */
method.contains = function contains( value ) {
    return this._map.hasKey( value );
};

/**
 * Insert the given values into the set. Can be given in the form
 * of an array or another Set.
 *
 *
 * @param {Array.<dynamic>|Set} items Description of items parameter.
 * @return {void}
 *
 */
method.addAll = function addAll( items ) {
    this._addAll( toList( items ) );
};

/**
 * Remove everything in the set.
 *
 * @return {void}
 *
 */
method.clear = function clear() {
    return this._map.clear();
};

/**
 * Description.
 *
 *
 */
method.toArray = method.values = function toArray() {
    return this._map.keys();
};

/**
 * Returns the amount of items in the set.
 *
 * @return {int}
 *
 */
method.size = method.length = function size() {
    return this._map.size();
};

/**
 * See if the set doesn't contain anything.
 *
 * @return {boolean}
 *
 */
method.isEmpty = function isEmpty() {
    return this._map.isEmpty();
};

/**
 * See if this set is a proper superset of the argument set.
 *
 * @param {Set} set The argument set.
 * @return {boolean}
 *
 */
method.supersetOf = Set.prototype.supersetOf;

/**
 * See if this set is a proper subset of the argument set.
 *
 * @param {Set} set The argument set.
 * @return {boolean}
 *
 */
method.subsetOf = Set.prototype.subsetOf;

/**
 * See if this set is fully contained in the argument set.
 *
 * @param {Set} set The argument set.
 * @return {boolean}
 *
 */
method.allContainedIn = Set.prototype.allContainedIn;

/**
 * See if this set is fully contains the argument set.
 *
 * @param {Set} set The argument set.
 * @return {boolean}
 *
 */
method.containsAll = Set.prototype.containsAll;

/**
 * Returns a hash code for the set.
 *
 * @return {int}
 *
 */
method.valueOf = Set.prototype.valueOf;

/**
 * Returns a string representation of the set.
 *
 * @return {String}
 *
 */
method.toString = Set.prototype.toString;

/**
 * Automatically called by JSON.stringify. If you later parse the JSON
 * you can pass the array to a set constructor.
 *
 * @return {Array.<dynamic>}
 *
 */
method.toJSON = Set.prototype.toJSON;

/**
 * Returns the union of the argument set and this set. The returned
 * set will have all the members that appear in this set, the second
 * set or both.
 *
 * @param {Set} a The set to union this set with.
 * @return {Set}
 *
 */
method.union = Set.prototype.union;

/**
 * Returns the intersection of the argument set and this set. The returned
 * set will have all the members that appear in both this set and the
 * argument set.
 *
 * @param {Set} a The set to intersect this set with.
 * @return {Set}
 *
 */
method.intersection = Set.prototype.intersection;

/**
 * Returns the relative complement of this set in relation to the argument
 * set. The returned set will have all the members that are in this set
 * but were not in the argument set.
 *
 * Note that set1.complement(set2) is different from set2.complement(set1)
 *
 * @param {Set} a The set to complement this set with.
 * @return {Set}
 *
 */
method.complement = Set.prototype.complement;

/**
 * Returns the symmetrict difference of this set and the argument set.
 * set. The returned set will have all the members that are in this set
 * and the argument set, but not those that are in both sets.
 *
 * This is relatively expensive operation, requiring iteration of both
 * sets currently.
 *
 * @param {Set} a The argument set.
 * @return {Set}
 *
 */
method.difference = Set.prototype.difference;

/**
 * Find the zero-based index of the value in the set. O(n).
 *
 * Returns -1 if the value is not in the set.
 *
 * Value cannot be undefined. Use null instead.
 *
 * @param {dynamic} value The value to lookup index for.
 * @return {int}
 *
 */
method.indexOf = function indexOf( value ) {
    return this._map.indexOfKey( value );
};

/**
 * Returns the first value in the set. Returns
 * undefined if the set is empty. O(1).
 *
 * @return {dynamic}
 *
 */
method.first = function first() {
    return this._map.firstKey();
};

/**
 * Returns the last value in the set. Returns
 * undefined if the set is empty. O(1).
 *
 * @return {dynamic}
 *
 */
method.last = function last() {
    return this._map.lastKey();
};

/**
 * Returns the nth value (0-based) in the set. Returns
 * undefined if the index is out of bounds. O(N).
 *
 * @return {dynamic}
 *
 */
method.get = method.nth = function nth( index ) {
    return this._map.nthKey( index );
};

/**
 * Returns an Iterator for the set. The iterator will become invalid
 * if the set is modified outside the iterator's methods.
 *
 * @return {SetIterator}
 *
 */
method.iterator = function iterator() {
    return new Iterator( this );
};

var Iterator = (function() {
    /**
     * Iterator constructor for the ordered set.
     *
     * If the iterator cursor is currently pointing at a valid
     * entry, you can retrieve the entry's value and index
     * from the iterator .value and .index properties
     * respectively.
     *
     * For performance, they are just simple properties but
     * they are meant to be read-only.
     *
     * You may reset the cursor at no cost to the beginning (
     * .moveToStart()) or to the end (.moveToEnd()).
     *
     * You may move the cursor one item forward (.next())
     * or backward (.prev()).
     *
     * Example:
     *
     * var it = set.iterator();
     *
     * while( it.next() ) {
     *      console.log( it.value, it.index );
     * }
     * //Cursor is now *after* the last entry
     * while( it.prev() ) { //Iterate backwards
     *      console.log( it.value, it.index );
     * }
     * //Cursor is now *before*the first entry
     *
     *
     * @param {OrderedSet} set Description of set parameter.
     * @constructor
     */
    function Iterator( set ) {
        this._iterator = set._map.iterator();
        this.value = void 0;
        this.index = -1;
    }
    var method = Iterator.prototype;

    copyProperties( setIteratorMethods, method );

    return Iterator;
})();



return OrderedSet;})();
;
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
var Queue = (function() {
var DEFAULT_CAPACITY = 16;
var MAX_CAPACITY = 536870912;

/**
 * Description.
 *
 *
 */
function clampCapacity( capacity ) {
    return Math.max(
            Math.min( MAX_CAPACITY, capacity ),
            DEFAULT_CAPACITY
    );
}

/**
 * Description.
 *
 *
 */
function nextPowerOfTwo( num ) {
    num = ((num >>> 0) - 1);
    num |= (num >>> 1);
    num |= (num >>> 2);
    num |= (num >>> 4);
    num |= (num >>> 8);
    num |= (num >>> 16);
    return (num + 1)>>>0;
}

/**
 * This is efficient array implementation that provides O(1) for random
 * access, removing at front, removing at back (deque only), adding at
 * front, adding at back( deque only)
 *
 * It resizes itself automatically and uses power of two physical sizes to
 * take advantage of bitwise wizardry in wrapping to avoid modulo
 * operations and if blocks.
 *
 * It should perform much better than the native Javascript array when
 * using the unshift/shift methods which need to do full move of all
 * indices every time. Random access etc is slower, but much faster than
 * would be in a linked list O(N).
 *
 * I didn't use this implementation because of random access though but to
 * avoid creating a ton of objects and have better spatial locality of
 * reference. I implemented the random access methods just because it was
 * possible to do so efficiently. Could be useful if you need queue/deque
 * but also random access...
 */
function Queue( capacity, maxSize, _arrayImpl ) {
    var items = null;

    this._maxSize = (maxSize = maxSize >>> 0) > 0 ?
        Math.min( maxSize, MAX_CAPACITY ) :
        MAX_CAPACITY;

    switch( typeof capacity ) {
    case "number":
        capacity = nextPowerOfTwo( capacity );
        break;
    case "object":
        if( capacity ) {
            items = toList( capacity );
            capacity = nextPowerOfTwo( items.length );
        }
        break;
    default:
        capacity = DEFAULT_CAPACITY;
    }

    this._capacity = clampCapacity( capacity );

    this._size = 0;
    this._queue = null;
    this._front = 0;
    this._modCount = 0;

    if( _arrayImpl != null ) {
        this._arrayImpl = _arrayImpl;
        this._fillValue = 0;
    }
    else {
        this._arrayImpl = Array;
        this._fillValue = null;
    }

    if( items ) {
        this._makeCapacity();
        this._addAll( items );
    }
}
var method = Queue.prototype;

/**
 * Description.
 *
 *
 */
method._checkCapacity = function( size ) {
    if( this._capacity < size && size < this._maxSize ) {
        this._resizeTo( this._capacity * 2 );
    }
};

/**
 * Description.
 *
 *
 */
method._makeCapacity = function() {
    var capacity = this._capacity,
        items = this._queue = new this._arrayImpl( capacity ),
        fill = this._fillValue;


    for( var i = 0; i < capacity; ++i ) {
        items[i] = fill;
    }
    this._front = 0;
};

/**
 * Description.
 *
 *
 */
method._resizeTo = function( capacity ) {
    var oldQueue = this._queue,
        newQueue,
        oldFront = this._front,
        oldCapacity = this._capacity,
        size = this._size;

    this._capacity = capacity;

    this._makeCapacity();

    newQueue = this._queue;

    //Can perform direct linear copy
    if( oldFront + size <= oldCapacity ) {
        arrayCopy( oldQueue, oldFront, newQueue, 0, size );
    }
    else {//Cannot perform copy directly, perform as much as possible
            //at the end, and then copy the rest to the beginning of the buffer
        var lengthBeforeWrapping =
            size - ( ( oldFront + size ) & ( oldCapacity - 1 ) );

        arrayCopy( oldQueue, oldFront, newQueue, 0, lengthBeforeWrapping );
        arrayCopy(
            oldQueue,
            0,
            newQueue,
            lengthBeforeWrapping,
            size - lengthBeforeWrapping
        );
    }

};

/**
 * Description.
 *
 *
 */
method._addAll = function( items ) {
    this._modCount++;
    var size = this._size;

    var len = items.length;
    if( len <= 0 ) {
        return;
    }
    this._checkCapacity( len + size );

    if( this._queue === null ) {
        this._makeCapacity();
    }

    var queue = this._queue,
        capacity = this._capacity,
        insertionPoint = ( this._front + size) & ( capacity - 1 );

     //Can perform direct linear copy
    if( insertionPoint + len < capacity ) {
        arrayCopy( items, 0, queue, insertionPoint, len );
    }
    else {
        //Cannot perform copy directly, perform as much as possible
        //at the end, and then copy the rest to the beginning of the buffer
        var lengthBeforeWrapping = capacity - insertionPoint;
        arrayCopy( items, 0, queue, insertionPoint, lengthBeforeWrapping );
        arrayCopy(
            items,
            lengthBeforeWrapping,
            queue,
            0,
            len - lengthBeforeWrapping
        );
    }

    this._size = Math.min( size + len, this._maxSize );


};

//API

/**
 * Description.
 *
 *
 */
method.forEach = SetForEach;

/**
 * Description.
 *
 *
 */
method.get = function( index ) {
    var i = (index >>> 0);
    if( i < 0 || i >= this._size ) {
        return void 0;
    }
    i = ( this._front + i ) & ( this._capacity - 1 );
    return this._queue[i];
};

/**
 * Description.
 *
 *
 */
method.set = function( index, value ) {
    this._modCount++;
    var i = (index >>> 0);
    if( i < 0 || i >= this._size ) {
        return void 0;
    }
    i = ( this._front + i ) & ( this._capacity - 1 );
    var ret = this._queue[i];
    this._queue[i] = value;
    return ret;
};

/**
 * Description.
 *
 *
 */
method.addAll = function( items ) {
    this._modCount++;
    return this._addAll( toList( items ) );
};

/**
 * Description.
 *
 *
 */
method.add = method.enqueue = function( item ) {
    this._modCount++;
    var size = this._size;
    if( this._queue === null ) {
        this._makeCapacity();
    }
    this._checkCapacity( size + 1 );
    var i = ( this._front + size ) & ( this._capacity - 1 );
    this._queue[i] = item;
    this._size = Math.min( size + 1, this._maxSize );
};

/**
 * Description.
 *
 *
 */
method.remove = method.dequeue = function() {
    this._modCount++;
    if( this._size === 0 ){
        return void 0;
    }
    var front = this._front,
        ret = this._queue[front];

    this._queue[front] = this._fillValue;
    this._front = ( front + 1 ) & ( this._capacity - 1);
    this._size--;
    return ret;
};

/**
 * Description.
 *
 *
 */
method.peek = function() {
    if( this._size === 0 ){
        return void 0;
    }
    return this._queue[this._front];
};

/**
 * Description.
 *
 *
 */
method.clear = function() {
    this._modCount++;
    var queue = this._queue,
        fill = this._fillValue;
    for( var i = 0, len = queue.length; i < len; ++i ) {
        queue[i] = fill;
    }
    this._size = 0;
    this._front = 0;
};

/**
 * Description.
 *
 *
 */
method.size = function() {
    return this._size;
};

/**
 * Description.
 *
 *
 */
method.isEmpty = function() {
    return this._size === 0;
};

/**
 * Description.
 *
 *
 */
method.toArray = method.toJSON = method.values = function() {
    if( this._size === 0 ) {
        return [];
    }
    var size = this._size,
        queue = this._queue,
        front = this._front,
        capacity = this._capacity,
        ret = new Array( size );

    if( front + size <= capacity ) {
        arrayCopy( queue, front, ret, 0, size );
    }
    else {
        var lengthBeforeWrapping =
            size - ( ( front + size ) & ( capacity - 1 ) );
        arrayCopy( queue, front, ret, 0, lengthBeforeWrapping );
        arrayCopy(
            queue,
            0,
            ret,
            lengthBeforeWrapping,
            size - lengthBeforeWrapping
        );
    }

    return ret;
};

/**
 * Description.
 *
 *
 */
method.contains = function( value ) {
    var size = this._size;

    if( size === 0 ) {
        return false;
    }

    var queue = this._queue,
        front = this._front,
        capacity = this._capacity;

    if( front + size <= capacity ) {
        return arraySearch( queue, front, size, value );
    }
    else {
        var lengthBeforeWrapping =
            size - ( ( front + size ) & ( capacity - 1 ) );
        return  arraySearch( queue, front, lengthBeforeWrapping, value ) ?
                true :
                arraySearch( queue, 0, size - lengthBeforeWrapping, value );
    }
};

/**
 * Description.
 *
 *
 */
method.valueOf = SetValueOf;

/**
 * Description.
 *
 *
 */
method.toString = function() {
    return JSON.stringify( this.values() );
};

/**
 * Description.
 *
 *
 */
method.iterator = function() {
    return new Iterator( this );
};

var Iterator = (function() {


    /**
     * Description.
     *
     *
     */
    function Iterator( queue ) {
        this._queue = queue;
        this._modCount = this._queue._modCount;
        this._items = this._queue._queue;
        this.moveToStart();
    }
    var method = Iterator.prototype;

    /**
     * Description.
     *
     *
     */
    method._checkModCount = function() {
        if( this._modCount !== this._queue._modCount ) {
            throw new Error( "Cannot mutate queue while iterating" );
        }
    };

    /**
     * Description.
     *
     *
     */
    method.next = function() {
        this._checkModCount();

        var i = ++this._index;

        if( i >= this._queue._size ) {
            this.moveToEnd();
            return false;
        }

        var item = this._items[
                ( this._queue._front + i ) &
                ( this._queue._capacity - 1 )
        ];

        this.value = item;
        this.index = i;

        return true;
    };

    /**
     * Description.
     *
     *
     */
    method.prev = function() {
        this._checkModCount();

        var i = --this._index;

        if( i < 0 || this._queue._size === 0 ) {
            this.moveToStart();
            return false;
        }

        var item = this._items[
            ( this._queue._front + i ) &
            ( this._queue._capacity - 1 )
        ];

        this.value = item;
        this.index = i;

        return true;
    };

    /**
     * Description.
     *
     *
     */
    method.moveToStart = function() {
        this._checkModCount();

        this.index = -1;
        this._index = -1;
        this.value = void 0;

        return this;
    };

    /**
     * Description.
     *
     *
     */
    method.moveToEnd = function() {
        this._checkModCount();

        this.index = -1;
        this._index = this._queue._size;
        this.value = void 0;

        return this;
    };

    return Iterator;
})();

return Queue;})();;
/* global Queue */
/* exported Deque */
var Deque = (function() {

/**
 * Description.
 *
 *
 */
function Deque( capacity, maxSize, arrayImpl ) {
    _super.constructor.call( this, capacity, maxSize, arrayImpl );
}

var _super = Queue.prototype,
    method = Deque.prototype = Object.create( _super );

method.constructor = Deque;


/**
 * Description.
 *
 *
 */
method.unshift = method.insertFront = function( item ) {
    this._modCount++;
    if( this._queue === null ) {
        this._makeCapacity();
    }
    var size = this._size;

    this._checkCapacity( size + 1 );
    var capacity = this._capacity;

    //Need this._front - 1, but if it is 0, that simply returns 0.
    //It would need to be capacity - 1, I.E. wrap to end, when front is 0
    //Because capacity is a power of two, capacity-bit 2's complement
    //integers can be emulated like this which returns capacity - 1
    //if this._front === 0

    var i = (((( this._front - 1 ) &
        ( capacity - 1) ) ^ capacity ) - capacity );
    this._queue[i] = item;
    this._size = Math.min( size + 1, this._maxSize );
    this._front = i;
};

/**
 * Description.
 *
 *
 */
method.pop = method.removeBack = function() {
    this._modCount++;
    var size = this._size;
    if( size === 0 ){
        return void 0;
    }
    var i = ( this._front + size - 1 ) & ( this._capacity - 1 );

    var ret = this._queue[i];
    this._queue[i] = this._fillValue;

    this._size--;
    return ret;
};

/**
 * Description.
 *
 *
 */
method.peekBack = function() {
    var size = this._size;
    if( size === 0 ) {
        return void 0;
    }
    return this._queue[
        ( this._front + size - 1 ) &
        ( this._capacity - 1 )
    ];
};

method.shift = method.removeFront = method.remove;
method.push = method.insertBack = method.add;
method.peekFront = method.peek;

//Meaningless semantics here
method.peek = method.remove =
    method.add = method.enqueue = method.dequeue = null;


return Deque;})();;
/* global Set, OrderedSet, SortedSet, Map, OrderedMap, SortedMap,
    defaultComparer, invertedComparator, arePrimitive, composeComparators,
    comparePosition, global, exportCtor, Queue, Deque */

var DS = {

    Set: exportCtor( Set ),
    OrderedSet: exportCtor( OrderedSet ),
    SortedSet: exportCtor( SortedSet ),

    Map: exportCtor( Map ),
    OrderedMap: exportCtor( OrderedMap ),
    SortedMap: exportCtor( SortedMap ),

    Queue: exportCtor( Queue ),
    Deque: exportCtor( Deque ),

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


