var fullscreen = fullscreen || {};
fullscreen.enabled = false;
fullscreen.resize = jQuery.noop;

fullscreen.resizer = function( elm ){
	return function(e){
		if( fullscreen.enabled ) {
		var win = jQuery( window ),
			width = win.width(), height = win.height();

		jQuery( "#"+elm )
			.css({
			width: width + "px",
			height: ( height - 115 )+ "px"
			});
		}
	
	};
};

fullscreen.enable = function( id ){
var win = jQuery( window );
	
jQuery( "#"+id ).css({
	width: win.width() + "px",
	height: ( win.height() - 115 )+ "px",
	left: "0px",
	zIndex: "2001",
	top: "115px"
});

fullscreen.resize = throttle( fullscreen.resizer( id ), 200 );
win.bind( "resize", fullscreen.resize);

document.getElementById("app-player-panel-container").style.backgroundColor = "transparent";
document.getElementById("curplaycontainer").style.color = "#FFFFFF";
document.getElementById("app-volume-percentage").style.color = "#FFFFFF";
document.getElementById("app-header-main").style.display = "none";


jQuery( "<div id=\"app-fullscreen-cancel\" style=\"display:none;\">Cancel fullscreen (esc)</div>" )
	.appendTo( "body" )
	.bind( "click", window.fullscreen.deactivate )
	.wrap( "<div id=\"app-fullscreen-overlay\" />" )
	.fadeIn( 500 );
	
fullscreen.enabled = true;
};

fullscreen.disable = function( id ){
	if( !fullscreen.enabled ) {
	return;
	}

$(window).unbind( "resize", fullscreen.resize )	
document.getElementById("app-player-panel-container").style.backgroundColor = "#FFFFFF";
document.getElementById("app-volume-percentage").style.color = "";
document.getElementById("curplaycontainer").style.color = "";
document.getElementById("app-header-main").style.display = "block";
jQuery( "#app-fullscreen-overlay" ).remove();

jQuery( "#"+id ).css({
	width: "",
	height: "",
	left: "",
	zIndex: "",
	top: ""
});

fullscreen.enabled = false;
window.__YTPLACEMENT();
}

fullscreen.activate = function(){
	if( !fullscreen.enabled && player.main._currentPlayer.type == "youtube" ) {
	fullscreen.enable( player.main._currentPlayer.id );
	}
}

fullscreen.deactivate = function(){
	if( fullscreen.enabled && player.main._currentPlayer.type == "youtube" ) {
	fullscreen.disable( player.main._currentPlayer.id );
	}
}

jQuery( "#app-fullscreen" ).bind( "click", window.fullscreen.activate );

jQuery( document ).bind( "keyup",
	function(e){
		if( e.which === 27 ) {
		window.fullscreen.deactivate();
		}
	}
);
