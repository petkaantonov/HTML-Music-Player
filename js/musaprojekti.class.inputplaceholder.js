function InputPlaceholder( target, opts ) {

target = typeof target == "string" ? document.getElementById( target ) : target;

	if( target.id == null ) {
	target.id = ( +new Date ) + "-placeholder";
	}

this._target = target.id;	
this._text = opts && opts.text || "";
this._style = opts && opts.style || {color: "#bbbbbb"};
this.__bind();
}

InputPlaceholder.Includes( {
	__bind: function(){
	var elm = $( document.getElementById( this._target ) ), elv = elm[0], self = this;
	
		elm.bind( "focus blur", function( e ) {
			if( e.type == "focus" ) {
			self.__removePlaceHolder( this );
			}
			else {
			self.__setPlaceHolder( this );
			}
		});
		
	
	this.__setPlaceHolder( elv );	
	},
	__removePlaceHolder: function( elm ) {
	
		if( elm.value != this._text ) {
		return true;
		}
	
	var key, styles = this._style;
	elm.value = "";
	
		for( key in styles ) {
		elm.style[ key ] = "";
		}
	},
	__setPlaceHolder: function( elm ){
	
		if( elm.value && elm.value != "" ) {
		return true;
		}
	
	var key, styles = this._style;
	elm.value = this._text;
			
		for( key in styles ) {
		elm.style[ key ] = styles[ key ];
		}
	}
	
});