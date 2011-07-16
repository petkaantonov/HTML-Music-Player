function FlyingMessage( target, opts ){
var $target = target;

target = ( target.nodeName && ( target.id || ( target.id = "fly-through-"+( +new Date ) ) ) && target.id ) || target;
this._removeAfter = opts && opts.removeAfter || 5000;
this._from = "left";
this._animateFor = opts && opts.animateFor || 300;
this._ifTaken = opts && opts.ifTaken || "remove";
this._curMsgId = "";
this._flying = [];
this._target = target;
this._curTimer = 0;
}

FlyingMessage.Includes({
	onafter: function( elem ){
	},
	createMsg: function( msg, className, from ){
	var id = "fly-through-span"+(+new Date ),
		span = document.createElement("span"), width,
		parWidth, startWidth, endWidth, target = document.getElementById( this._target ), self = this,
		from = from || this._from || "left", animate;
		
		if( target == null ) {
		return this;
		}
		
		if( this._flying.length ) {
		
			switch( this._ifTaken ) {
			case "cancel":
			return this;
			case "remove":
			window.clearTimeout( self._curTimer );
			$( document.getElementById( this._flying.pop() ) ).stop( true, false ).remove();
			break;
			case "nothing":
			break;
			
			default:
			window.clearTimeout( self._curTimer );
			$( document.getElementById( this._flying.pop() ) ).stop( true, false ).remove();
			}
		}
	span.className = className || "";
	span.appendChild( document.createTextNode( msg ) );
	span.style.visibility = "hidden";
	document.body.appendChild( span );
	width = span.offsetWidth;
	parWidth = target.offsetWidth;
	document.body.removeChild( span );
	span.style.visibility = "";
	span.style.position = "absolute";
	span.style[from] = "-100000px";
	endWidth = parWidth / 2 - width / 2;
	startWidth = 0 - width - 25;
	span.id = id;
	this._flying.push( id );
	
	animate = (function(endWidth){var r = {}; r[from] = endWidth+"px"; return r;})(endWidth);
		
		$( span ).css( from, ( ""+startWidth )+"px" ).appendTo( target ).animate(
			animate,
			this._animateFor,
			function() {
			var $this = this;
			self._curTimer=	window.setTimeout( function(){
				self.onafter.call( self, $this.parentNode.removeChild( $this ) );
				self._flying.pop();
				
				}, self._removeAfter );
			}
		);

	return this;
	}
});