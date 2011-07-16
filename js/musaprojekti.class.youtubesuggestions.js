function YouTubeSuggestions( target, opts ) {
var self = this;
target = typeof target == "string" ? document.getElementById( target ) : target;

	if( target.id == null ) {
	target.id = ( +new Date ) + "-suggestcon";
	}
	
this._target = target.id;
this._throttle = opts && opts.throttle || 300;
this._handler = opts && opts.handler || function(){};

$( "#"+this._target ).bind("keyup", throttle( function(e){
	if( e.which < 42 ){
	return true;
	}
self.__jsonp.call(self, this.value);

}, this._throttle ));
	


}

YouTubeSuggestions.Includes({
	__jsonp: function( val ) {
	
	var self = this, jsonp = new JSONP( "http://suggestqueries.google.com/complete/search", { 
			callbackP: "jsonp",

			timeout: 30,

			callback: function(resp) {
			self._handler.call( self, resp );
			},

			params: {
				hl: "en",
				ds: "yt",
				json: "t",
				q: val
			}
		});
	jsonp.execute();
	}

});
