var util = util || {};

util.toTimeString = function( secs ) {
var days, hours, minutes, seconds;

	if( secs == null )
	return "";
	
days = ( secs / 86400 ) >> 0;
hours = ( secs % 86400 / 3600 ) >> 0;
minutes = ( secs % 3600 / 60 ) >> 0;
seconds = ( secs % 60 );	
seconds = seconds < 10 ? "0" + seconds : seconds;
minutes = minutes < 10 ? "0" + minutes : minutes;
hours = hours && hours < 10 ? "0" + hours : hours;

return "" + ( days ? days+" - " : "" ) + ( hours ? hours+":" : "" ) + minutes + ":" + seconds;		
};

util.scrollIntoView = {
	alignMiddle: function( node, parentNode ){
		if( !node || !parentNode ) {
		return;
		}
	var nodeOffset = node.offsetTop, parentHeight = parentNode.offsetHeight,
		parentScrollTop = parentNode.scrollTop, dif, mid;
		
	dif = nodeOffset - ( parentHeight / 2 );
	
		if( dif < 0 ) {
		dif = 0;
		}
	parentNode.scrollTop = dif;	
	}
};


Function.prototype.Inherits = function() {
var args = Array.prototype.slice.call( arguments, 0 );
var parent;
var o = {};
function f(){}

		while( args.length ) {
		parent = args.shift();
			for( var key in parent.prototype)
			o[key] = parent.prototype[key];
		}
f.prototype = o;
f.prototype.constructor = f;
this.prototype = new f;
this.prototype.constructor = this;
this.prototype.__super__ = function( method ) {
		if( typeof f.prototype[method] == "function" ) {
		return f.prototype[method].apply( this, Array.prototype.slice.call(arguments, 1 ) );
		}
	};


return this;
};


Function.prototype.Includes = function( proto ) {

	if( typeof proto != "object" )
	throw new TypeError("Cannot include " +proto);

	for( var key in proto ) {

		if( key.indexOf( "STATIC__" ) > -1  ) {
		this[ key.substr( 8 ) ] = proto[key];
		}
	
		else {
		this.prototype[key] = proto[key];
		}

	}
return this;
};

function throttle( callback, delay ) {
var timeridto = 0;

	return function(){
	var 	args = Array.prototype.slice.call( arguments ),
		$this = this;
		clearTimeout( timeridto );
		timeridto = setTimeout( function(){callback.apply( $this, args ); }, delay );
	};
}

Function.prototype.Destroy = function( arr ){
 if( arr.constructor !== Array ) {
 arr = [arr];
 }
var i, l = arr.length, curProto = this.prototype, elm;

	while( curProto ) {
		for( i = 0; i < l; ++i ) {
		elm = arr[i];

			if( elm in curProto ) {
			delete curProto[elm];
			}	
		}
	curProto = curProto.__proto__ || curProto.prototype || null;
	}
};

Function.prototype.Implements = function() {
var UNDEF, args = Array.prototype.slice.call( arguments, 0 );
var l = args.length, i, Interface, members = this.prototype, test;
var funstr = this.name ? this.name.toString() : this.toString().match( /function\s*(\w*)/i )[1];

	for( i = 0; i < l; ++i ) { 
	Interface = args[i];

	if( typeof Interface != "object" )
	throw new TypeError(typeof Interface + " is not an object");


		for( var key in Interface ) {

			if( key.indexOf( "STATIC__") === 0 ) {
			test = key.substr(8);
				if( this[ test ] === UNDEF )
				throw new TypeError( 	funstr + " does not implement the static " +
								(typeof Interface[key] == "function" ? "method" : "property") +
								" " + test);
						
				else if ( typeof this[ test ] != typeof Interface[key] )
				throw new TypeError(	funstr + " Implements the static member " + test +
							" as " + typeof this[test] + " instead of " +
							typeof Interface[key] );
		
			
				else if ( 	typeof this[ test ] == "function" &&
						this[ test].length != Interface[ key ].length )

						throw new TypeError(	"The method " + test + " implemented by " + funstr +
							"expects " + this[test].length + " parameters instead of " + 
							Interface[ key ].length );

			}
	
			else {

			if( members[key] === UNDEF )
			throw new TypeError( 	funstr + " does not implement the " +
							(typeof Interface[key] == "function" ? "method" : "property") +
							" " + key);
						
			else if ( typeof members[ key ] != typeof Interface[key] )
			throw new TypeError(	funstr + " Implements " + key +
							" as " + typeof this.members[ key ] + " instead of " +
							typeof Interface[key] );
		
			
			else if ( 	typeof members[ key ] == "function" &&
					members[ key ].length != Interface[ key ].length )

			throw new TypeError(	"The method " + key + " implemented by " + funstr + 
							" expects " + members[ key ].length + " parameters instead of " + 
							Interface[ key ].length );

			}
			
		}
	}
return this;
};


String.prototype.htmlDecode = function(){
return this
.replace(/&amp;/gi, "&")
.replace(/&quot;/gi, "\"")
.replace(/&#039;/gi, "'")
.replace(/&lt;/gi, "<")
.replace(/&gt;/gi, ">");
};

String.prototype.htmlEncode = (function(){
	var UNESC_DQ = new RegExp('"', "g");
		return function() {
		var div = document.createElement("DIV"), ret, str = this.toString();
		div.innerText = div.textContent = str;
		ret = div.innerHTML;
        	return ret.replace( UNESC_DQ, "&quot;" );	
		};
})();

Array.prototype.bSearch = function( value ) {
var low = 0, high = this.length - 1, i;
	while ( low <= high ) {
   	i = ( low + high ) >>> 1;
	if( this[i] === value ) return i;
	else if( this[i] < value ) low = i + 1;
	else if( this[i] > value ) high = i - 1;
 	}
return -1;
};

Array.prototype.unique = function(){
var l = this.length, objekti = {}, returnarska = [];
	for(var i = 0; i < l; ++i){
	objekti[this[i]] = this[i];
	}
	for(var key in objekti){
	returnarska.push(objekti[key]);
	}
return returnarska;
};

Array.prototype.mapProximity = function(tolerance){
var l = this.length, t = tolerance || 1, i, r = [], c = 0;
r[c] = [];
	if(this.length < 2){
	r[c].push(this[0]);
	return r;
	}
	for(i = 0; i < l; ++i){
	r[c].push(this[i]);
		if(!(Math.abs(this[i+1] - this[i]) <= t) && this[i+1] !== undefined){
		++c;
		r[c] = [];
		}		
	}
return r;		
};

Array.prototype.targetMapSwap = function(target, map){
var l = map.length, targetdistance, dupe = this.slice( 0 );
	if(target > map[0]){
	targetdistance = target - map[l-1]
	var check = target - l;
		for(var i = target; i >= map[0]; --i){
			if(i > check){
			this[i] = dupe[i-targetdistance];
			}
			else if(i <= check){
			this[i] = dupe[i+l];
			}
		}
	}
	else if(target < map[0]){
	targetdistance = map[0] - target;
	var check = target + l;
		for(var i = target; i <= map[l-1]; ++i){
			if(i < check){
			this[i] = dupe[i+targetdistance];
			}
			else if(i >= check){
			this[i] = dupe[i-l];
			}
		}
	}
};	
	
/* Implement trim only if not found natively */
	if( typeof String.prototype.trim != "function") {
		String.prototype.trim = (function(){
		var TRIM_LEFT = /^\s\s*/;
		var TRIM_RIGHT = /\s\s*$/; 
			return function() {
			return this.replace( TRIM_LEFT, "" ).replace( TRIM_RIGHT, "" );
			};
		})();
	}
	
String.prototype.addSlashes = function( c ) {
c = "["+c+"]";
return this.replace( new RegExp( "("+c+")", "g" ), "\\$1" );
}

Array.prototype.range = function(x, y){
var i = 0, dif = Math.abs(x-y);
	for(i = 0; i <= dif; ++i ){
	this[i] = x+i;
	}
return this;
};

Array.prototype.shuffle = function(){
var l = this.length, j;
	for( var i = l - 1; i > 0; --i ) {
	j = ( Math.random() * ( i + 1 ) ) >> 0;
	var tmp = this[i];
	this[i] = this[j];
	this[j] = tmp;
	}
return this;
};


if (!Array.prototype.indexOf)
{
  Array.prototype.indexOf = function(searchElement /*, fromIndex */)
  {
    "use strict";
 
    if (this === void 0 || this === null)
      throw new TypeError();
 
    var t = Object(this);
    var len = t.length >>> 0;
    if (len === 0)
      return -1;
 
    var n = 0;
    if (arguments.length > 0)
    {
      n = Number(arguments[1]);
      if (n !== n) // shortcut for verifying if it's NaN
        n = 0;
      else if (n !== 0 && n !== (1 / 0) && n !== -(1 / 0))
        n = (n > 0 || -1) * Math.floor(Math.abs(n));
    }
 
    if (n >= len)
      return -1;
 
    var k = n >= 0
          ? n
          : Math.max(len - Math.abs(n), 0);
 
    for (; k < len; k++)
    {
      if (k in t && t[k] === searchElement)
        return k;
    }
    return -1;
  };
}

Object.uniqueValues = function( obj ){
var r = {}, key, check = {};

	for( key in obj ) {
		if( (obj[key].toString() ) in check ) {
		r[key] = "";
		continue;
		}
	check[ obj[key] ] = true;
	r[key] = obj[key];
	}
return r;
};



function g(a){var b=typeof a;if(b=="object")if(a){if(a instanceof Array)return"array";else if(a instanceof Object)return b;var c=Object.prototype.toString.call(a);if(c=="[object Window]")return"object";if(c=="[object Array]"||typeof a.length=="number"&&typeof a.splice!="undefined"&&typeof a.propertyIsEnumerable!="undefined"&&!a.propertyIsEnumerable("splice"))return"array";if(c=="[object Function]"||typeof a.call!="undefined"&&typeof a.propertyIsEnumerable!="undefined"&&!a.propertyIsEnumerable("call"))return"function"}else return"null";
else if(b=="function"&&typeof a.call=="undefined")return"object";return b};function h(a){var a=String(a),b;b=/^\s*$/.test(a)?!1:/^[\],:{}\s\u2028\u2029]*$/.test(a.replace(/\\["\\\/bfnrtu]/g,"@").replace(/"[^"\\\n\r\u2028\u2029\x00-\x08\x10-\x1f\x80-\x9f]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g,"]").replace(/(?:^|:|,)(?:[\s\u2028\u2029]*\[)+/g,""));if(b)try{return eval("("+a+")")}catch(c){}throw Error("Invalid JSON string: "+a);}function i(a){var b=[];j(new k,a,b);return b.join("")}function k(){}
function j(a,b,c){switch(typeof b){case "string":l(b,c);break;case "number":c.push(isFinite(b)&&!isNaN(b)?b:"null");break;case "boolean":c.push(b);break;case "undefined":c.push("null");break;case "object":if(b==null){c.push("null");break}if(g(b)=="array"){var f=b.length;c.push("[");for(var d="",e=0;e<f;e++)c.push(d),j(a,b[e],c),d=",";c.push("]");break}c.push("{");f="";for(d in b)Object.prototype.hasOwnProperty.call(b,d)&&(e=b[d],typeof e!="function"&&(c.push(f),l(d,c),c.push(":"),j(a,e,c),f=","));
c.push("}");break;case "function":break;default:throw Error("Unknown type: "+typeof b);}}var m={'"':'\\"',"\\":"\\\\","/":"\\/","\u0008":"\\b","\u000c":"\\f","\n":"\\n","\r":"\\r","\t":"\\t","\u000b":"\\u000b"},n=/\uffff/.test("\uffff")?/[\\\"\x00-\x1f\x7f-\uffff]/g:/[\\\"\x00-\x1f\x7f-\xff]/g;function l(a,b){b.push('"',a.replace(n,function(a){if(a in m)return m[a];var b=a.charCodeAt(0),d="\\u";b<16?d+="000":b<256?d+="00":b<4096&&(d+="0");return m[a]=d+b.toString(16)}),'"')};window.JSON||(window.JSON={});typeof window.JSON.stringify!=="function"&&(window.JSON.stringify=i);typeof window.JSON.parse!=="function"&&(window.JSON.parse=h);