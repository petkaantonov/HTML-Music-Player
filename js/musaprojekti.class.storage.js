function Storage( stringify, parse) {
	var undef;
	var hasLocalStorage = "localStorage" in window,
		__set, __get, __remove;
		

	stringify = stringify || window.JSON.stringify;
	parse = parse || window.JSON.parse;
	
	var __toString = function( obj ) {
	return typeof obj == "string" ? obj : stringify( obj );
	},
	
	__toObj = function( str ) {
	var r;
		try {
		r = parse( str );
		}
		catch(e){
		return str;
		}
	return r;
	};
	
		if( hasLocalStorage ) {
			__set = function( name, value ) {
			window.localStorage.setItem( name, value );
			};

			__get = function( name ) {
			return window.localStorage.getItem( name );
			};

			__remove = function( name ) {
			return window.localStorage.removeItem( name );
			};
		}
		else {
			__set = function( name, value, exp ) {
			exp = exp || 1;
			var date = new Date();
			date.setTime( +date + ( exp * 31536000000 ) );
			document.cookie = name + "=" + value + "; expires=" + date.toGMTString() + "; path=/";
			};

			__get = function( name ) {
			var cookies = document.cookie.split( ";" ),
				cookieN, i, l = cookies.length, key = name + "=";
				
				for( i = 0; i < l; ++i ) {
				cookieN = cookies[i];
					while ( cookieN.charAt( 0 ) == " " ) {
					cookieN = cookieN.substring( 1, cookieN.length );
					}
					
					if( cookieN.indexOf( key ) === 0 ) {
					return cookieN.substring( key.length, cookieN.length );
					}
				
				}
			return null;
			};

			__remove = function( name ) {
			return __set( name, "", -1 );
			};		
		}

	return {
		"update": function( obj, name, value ){
		var objk = __toObj( __get( obj ) ), upd;
			if( !objk ) {
			var upd = {};
			upd[name] = value;
			return this.set( obj, __toString( upd ) );
			}
		objk[name] = value;
		return this.set( obj, __toString( objk ) );
		},
		"get": function( name ) {
		return __toObj( __get( name ) );
		},
		"set": function( name, value ) {
		var key;
			if( typeof name == "object" ) {

				for( key in name ) {
				value = name[key];
				__set( key, __toString( name[key] ) );
				}
			}
			else {
			__set( name, __toString( value ) );
			}
			
		return this;
		},
		"remove": function( name ) {
		return __remove( name );
		}

	};
}