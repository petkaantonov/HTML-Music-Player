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

};

player.slider.onslideend = function(){
document.getElementById( "app-volume-slider-wrap" ).removeAttribute( "style" );

};

player.slider.onslide = function( p ){
document.getElementById( "app-volume-slider-bg").style.width = ( p * 110 ) + "px";
document.getElementById( "app-volume-slider-knob").style.left = ( p * 105 - 5 ) + "px";
player.main.setVolume( ( p * 100 ) >> 0 );
};

player.slider.onslide( player.defaults.volume / 100 );