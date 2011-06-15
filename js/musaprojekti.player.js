var player = player || {};

player.defaults = {
	"volume": 15
};

player.main = new Player().setVolume( player.defaults.volume );


player.slider = new Slider( "app-volume-slider-clickarea" );

player.slider.onslidebegin = function(){
document.getElementById( "app-volume-slider-wrap" ).setAttribute(
	"style",
	"-webkit-box-shadow: 0px 0px 7px #A8B7FF;" +
	"-moz-box-shadow: 0px 0px 7px #A8B7FF;" +
	"box-shadow: 0px 0px 7px #A8B7FF;");
$( "#app-volume-percentage" ).fadeIn(500);
};

player.slider.onslideend = function(){
document.getElementById( "app-volume-slider-wrap" ).removeAttribute( "style" );
$( "#app-volume-percentage" ).fadeOut(500);

};

player.slider.onslide = function( p ){
document.getElementById( "app-volume-percentage").innerHTML = ( ( p * 100 ) >> 0 ) + "%";
document.getElementById( "app-volume-slider-bg").style.width = ( p * 110 ) + "px";
document.getElementById( "app-volume-slider-knob").style.left = ( p * 105 - 5 ) + "px";
	if( player.main.isMuted() && p > 0 ) {
	$( "#app-volume-mute" ).removeClass( "app-volume-muted" );
	player.main.toggleMute();
	}
player.main.setVolume( ( p * 100 ) >> 0 );
};

player.slider.onslide( player.defaults.volume / 100 );

$( "#app-volume-mute").bind( "click",
	function(){
	var val = player.main.toggleMute() / 100, elm = $(this);
	document.getElementById( "app-volume-slider-bg").style.width = ( val * 110 ) + "px";
	document.getElementById( "app-volume-slider-knob").style.left = ( val * 105 - 5 ) + "px";
	
		if( player.main.isMuted() ){
		elm.addClass( "app-volume-muted" );
		}else{	
		elm.removeClass( "app-volume-muted" );
		}
	}
);