/**
 * @constructor
 * @name JSONP
 * @description Creates a cross domain JSONP request wrapper
 * @param {String} url - Location of json callback
 * @param {Object} [opts] - Options
 *
 * @option {Object} params   - Parameters to pass to the get request, object with key-value pairs
 * @option {String} callback - anonymous callback function or reference to a function, defaults to no callback
 * @option {String} callbackP -  the identifier of the callback function in request, defaults to "callback"
 * @option {Number} timeout -  seconds before the jsonp request times out, defaults to 30. In case of a timeout,
 *				callback function will be called with null as the first argument
 *
 * @example
 *
 *
 * function fn( response ) {
 * alert( response );
 * }
 *
 * var jsonp = new JSONP( "http://www.google.com", {callback: fn, params: {datatype: "json-p"} }
 * jsonp.execute(); 
 * 
 * 
*/
function JSONP( url, opts ) {
var params, key, parastr = "", pararr = [];
this._url = url;

this._callback = opts && typeof opts.callback == "function" && opts.callback || function(){};
this._callbackP = opts && opts.callbackP || "callback";
this._timeout = opts && opts.timeout || 30;
params = opts && typeof opts.params == "object" && opts.params || {};

	for( key in params ) {
	pararr.push( encodeURIComponent( key ) + "=" + encodeURIComponent( params[key] ) );
	}

this._parastr = pararr && pararr.length && pararr.join( "&" ) || "";

}


window.__callbackForJSONPctr = 0;
window.__callbackForJSONP = {};

JSONP.prototype = {
	constructor: JSONP,

/**
 *
 * @name JSONP#execute
 * @method
 * @description Executes the JSONP request, deleting the created script element right after.
 * @return the JSONP object
 * 
 * 
*/
	execute: function() {
	var script = document.createElement( "script" ), str = "", callbackEnc, funcEnc, num = window.__callbackForJSONPctr,
		body = document.getElementsByTagName( "body" )[0];
	
	funcEnc = encodeURIComponent( "__callbackForJSONP["+window.__callbackForJSONPctr+"].cb" );
	callbackEnc = encodeURIComponent( this._callbackP ) + "=" + funcEnc;
	
	str = this._parastr ? this._parastr + "&" + callbackEnc : callbackEnc;
	str = this._url + "?" + str;
	
	script.type = "text/javascript";

	window.__callbackForJSONP[ num ] = {};
	window.__callbackForJSONP[ num ].cb = this._backcaller( this._callback, script, num );
	script.src = str;
	body.appendChild( script );
	
		window.__callbackForJSONP[ num ].timeoutID = window.setTimeout( function(){
		window.__callbackForJSONP[ num ].cb( null );
		}, this._timeout * 1000 );
	
	window.__callbackForJSONPctr++;
	return this;
	},
	
	_backcaller: function( fn, script, num ) {
	
		return function() {
		var args = Array.prototype.slice.call( arguments, 0 );
		script.parentNode.removeChild( script );
		fn.apply( window, args );
		window.clearTimeout( window.__callbackForJSONP[ num ].timeoutID );
		script = null;
		delete window.__callbackForJSONP[ num ];
		};

	}

};