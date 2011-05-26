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

var util = {};

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


