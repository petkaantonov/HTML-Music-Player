function BlockingPopup(){
Popup.apply( this, Array.prototype.slice.call( arguments, 0) );
this._blockerId = "blocker-"+(+new Date);
}

BlockingPopup.Inherits( Popup ).Includes({
	closeAll: function(){
		if( !this.__super__( "closeAll" ) ) {
		return false;
		}
	$( "#"+this._blockerId).remove();
	return this;
	},
	open: function( html, width, height ){
	this.__super__( "open", html, width, height );
	
		if( this.length < 2 ) {
		$("<div id=\""+this._blockerId+"\"style=\"background-color:transparent;position:absolute;" +
			"top:0px;left:0px;z-index:99999;display:block;width:"+$(window).width()+"px;" +
			"height:"+$(window).height()+"px;\"></div>").prependTo( "body" );
		}
	return this;
	},
	close: function( elm ){
	this.__super__( "close", elm );
		if( !this.length ) {
		$( "#"+this._blockerId).remove();
		}
	return this;
	}
});