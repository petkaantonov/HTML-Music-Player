var player = player || {};

/* TODO: load these from local storage */
player.defaults = {
	"volume": 15
};

player.main = new Player( playlist ).setVolume( player.defaults.volume );

player.seekSlider = new Slider( "app-song-progress-container" );
player.volumeSlider = new Slider( "app-volume-slider-clickarea" );

player.seekSlider.onslidebegin = function(){

	if( !player.main._isStopped &&
		player.main.getDuration()
		&& playlist.main._currentSong ) {
	/* disable progress updates during seek */
	player.main.onprogress = jQuery.noop; 
	}
};

player.seekSlider.onslideend = function( p ){
dur = player.main.getDuration(); 
	if( dur && !player.main._isStopped ) {
	document.getElementById( "app-current-playtime").innerHTML = util.toTimeString( ( dur * p / 1000 ) >> 0 );
	player.main.seek( dur * p ); /* logic to handle seek validity in Player class */
	}
player.main.onprogress = player.methodProgress;

};

player.seekSlider.onslide = function( p ){
var dur = player.main.getDuration();
	if( dur &&
		playlist.main._currentSong &&
		!player.main._isStopped ) {
	document.getElementById( "app-song-progress").style.left = "-" + ( ( 1-p ) * 546 ) + "px";
	document.getElementById( "app-current-playtime").innerHTML = "Seek to: " + util.toTimeString( ( dur * p / 1000 ) >> 0 );
	}
};

player.volumeSlider.onslidebegin = function(){
document.getElementById( "app-volume-slider-wrap" ).setAttribute(
	"style",
	"-webkit-box-shadow: 0px 0px 7px #A8B7FF;" +
	"-moz-box-shadow: 0px 0px 7px #A8B7FF;" +
	"box-shadow: 0px 0px 7px #A8B7FF;");
$( "#app-volume-percentage" ).fadeIn(500);
};

player.volumeSlider.onslideend = function(){
document.getElementById( "app-volume-slider-wrap" ).removeAttribute( "style" );
$( "#app-volume-percentage" ).fadeOut(500);

};

player.volumeSlider.onslide = function( p ){
document.getElementById( "app-volume-percentage").innerHTML = ( ( p * 100 ) >> 0 ) + "%";
document.getElementById( "app-volume-slider-bg").style.width = ( p * 110 ) + "px";
document.getElementById( "app-volume-slider-knob").style.left = ( p * 105 - 5 ) + "px";
	if( player.main.isMuted() && p > 0 ) {
	$( "#app-volume-mute" ).removeClass( "app-volume-muted" );
	player.main.toggleMute();
	}
player.main.setVolume( ( p * 100 ) >> 0 );
};

player.volumeSlider.onslide( player.defaults.volume / 100 );

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




player.hideYoutube = function(){
jQuery( "#app-fullscreen").hide();
fullscreen.disable( player.main._currentPlayer.id );
jQuery( ".app-youtube-audio" ).addClass( "hidden" );

};

player.main.onyoutube = function( player ) {

	if( !player ) {
	return;
	}
	
jQuery( "#"+player ).removeClass("hidden");
document.getElementById("app-fullscreen").style.display = "block";	
};

/* To be used both with hotkeys and click binds */

player.methodPause = function(){
player.main.pause();
return false;
};
player.methodPlay = function(){
player.main.play();
return false;
};
player.methodStop = function(){
player.main.stop();
return false;
};

player.methodNext = function(){
playlist.main.next();
return false;
};
player.methodPrev = function(){
playlist.main.prev();
return false;
};

playlist.main.onplaylistempty = function(){
player.main.stop();
playlist.songDisplay.newTitle( "" );
document.title = window.__PROJECT__TITLE();
player.main.onprogress( 0, 0, 0, 1, 0, 0 );
};

playlist.main.onloadneed = function( songObj) {
player.hideYoutube();
player.main.loadSong( songObj.url );

};



player.methodProgress = function( lp, ppa, pt, tt, bl, bt ) {
var prog = pt / tt;
document.getElementById( "app-song-progress").style.left = "-"+ ( ( 1 - ( isNaN( prog ) ? 0 : prog ) )* 546) + "px";
document.getElementById( "app-current-playtime").innerHTML = util.toTimeString( ( pt / 1000 ) >> 0)
document.getElementById( "app-total-playtime").innerHTML = tt < 1 ? "loading" : util.toTimeString( ( tt / 1000 ) >> 0)
};


player.main.onprogress = player.methodProgress;

player.main.onerror = function( hash, position){
	if( position != null ) {
	jQuery( "#app-song-"+position ).addClass( "app-song-error" );
	}
};

player.main.onplay = function(){
$( ".app-panel-control", document.getElementById( "app-player-panel-controls" ) ).removeClass("active");
$( "#app-panel-play" ).addClass( "active" );
};

player.main.onstop = function(){
$( ".app-panel-control", document.getElementById( "app-player-panel-controls" ) ).removeClass("active");
$( "#app-panel-stop" ).addClass( "active" );
};

player.main.onpause = function(){
$( ".app-panel-control", document.getElementById( "app-player-panel-controls" ) ).removeClass("active");
$( "#app-panel-pause" ).addClass( "active" );
};

$( "#app-panel-play" ).click( player.methodPlay );
$( "#app-panel-stop" ).click( player.methodStop );
$( "#app-panel-pause" ).click( player.methodPause );
$( "#app-panel-next" ).click( player.methodNext );
$( "#app-panel-previous" ).click( player.methodPrev );


	if( features.readFiles ) {
		$( "#app-html5-audio-0" ).add( "#app-html5-audio-1" ).jPlayer({
			swfPath: "",
			nativeSupport: true,
			volume: player.defaults.volume,
			customCssIds: true,
			errorAlerts: true,
			warningAlerts: true
			}
		);
		
	player.main.addPlayer( "html5", "app-html5-audio-0" ).
		addPlayer( "html5", "app-html5-audio-1" );
	}
	
	/* youtube api doesn't provide any way to associate events with a specific player,
		with this crude hack and jQuery element data api it becomes possible */
function __YTSTATECHANGE0( arg ){
player.main._youtubeStateChange( arg, "app-youtube-audio-0" );

};
function __YTERROR0( arg ){
player.main._playerError( arg, "app-youtube-audio-0" );
};

function __YTQUALITY0( arg ){
player.main._youtubeQualityChange( arg, "app-youtube-audio-0"  );
};

function __YTSTATECHANGE1( arg ){
player.main._youtubeStateChange( arg, "app-youtube-audio-1"  );

};
function __YTERROR1( arg ){
player.main._playerError( arg, "app-youtube-audio-1"  );
};

function __YTQUALITY1( arg ){
player.main._youtubeQualityChange( arg, "app-youtube-audio-1"  );
};

window.__YTPLACEMENT =  function(){
	
	if( window.fullscreen.enabled ) {
	return;
	}

var offset = jQuery( "#app-video-container" ).offset();
	jQuery( ".app-youtube-audio" )
		.css({
		top: offset.top + "px",
		left: offset.left + "px"
		});
};

window.__YTCOUNT = 0;

jQuery( window ).bind( "youtubeready", window.__YTPLACEMENT );

function onYouTubePlayerReady( playerId ) {
var elm = document.getElementById( playerId  ), identifier = playerId.charAt( playerId.length - 1 );
window.__YTCOUNT++;
	try {
	elm.addEventListener( "onStateChange", "__YTSTATECHANGE"+identifier );
	elm.addEventListener( "onError", "__YTERROR"+identifier );
	elm.addEventListener( "onPlaybackQualityChange", "__YTQUALITY"+identifier );
	}
	catch(e) {
	elm.addEventListener( "onStateChange", window["__YTSTATECHANGE"+identifier] );
	elm.addEventListener( "onError", window["__YTERROR"+identifier] );
	elm.addEventListener( "onPlaybackQualityChange", window["__YTQUALITY"+identifier] );
	}
	
player.main.addPlayer( "youtube", playerId );

	if( window.__YTCOUNT >= 2 ) {
	jQuery( window ).trigger( "youtubeready" );		
	}

}

(function(){
var name = storage.get( "crossFadePreset" ) || "Default";
player.main.importCrossFade( crossfading.loadPreset( name ) );
}());

/*
Hacky way to detect onready in case onyoutubeready doesn't get called

window.ytReady = (function(){
var count = 0;
	return function ytReady( id ){
	count++;
		try {
		id.addEventListener( "onStateChange", "__YTSTATECHANGE", false );
		id.addEventListener( "onError", "__YTERROR", false  );
		id.addEventListener( "onPlaybackQualityChange", "__YTQUALITY", false  );
		}
		catch(e) {
		id.addEventListener( "onStateChange", window.__YTSTATECHANGE, false );
		id.addEventListener( "onError", window.__YTERROR, false  );
		id.addEventListener( "onPlaybackQualityChange", window.__YTQUALITY, false  );
		}
	player.main.addPlayer( "youtube", id.id );
		if( count >= 2 ) {
		window.clearInterval( ytPoller );
		$( "#app-loader").remove();
		$( "#app-container" ).show();
		tabs.selectTab( tabs.getTab( tabs.playlist ) );
		window.addFolderHack();
		}
	};
})();


var ytPoller = window.setInterval( (function(){
var ready = {};
	return function(){
	var elm = document.getElementById("app-youtube-audio-0"),
	elm1 = document.getElementById("app-youtube-audio-1");
	
		if( elm && !( "app-youtube-audio-0" in ready ) ) {
		ready["app-youtube-audio-0" ] = true;
		ytReady(elm);
		}
		if( elm1 && !( "app-youtube-audio-1" in ready ) ){
		ready["app-youtube-audio-1" ] = true;
		ytReady( elm1 );
		}
	};
})(), 200 );

*/



jQuery( window )
	.bind( "resize", window.__YTPLACEMENT )
	.bind( "load" ,
		function(){
		jQuery( "#app-youtube-mode")[0].checked = true;

/*
		jQuery( "#wrapper").prepend( '<embed type="application/x-shockwave-flash" src="http://www.youtube.com/apiplayer?modestbranding=1&amp;enablejsapi=1&amp;version=3&amp;playerapiid=app-youtube-audio-0&amp;rel=0&amp;disablekb=1&amp;fs=1&amp;showinfo=0&amp;iv_load_policy=3" flashvars="modestbranding=1&amp;enablejsapi=1&amp;version=3&amp;playerapiid=app-youtube-audio-0&amp;rel=0&amp;disablekb=1&amp;fs=1&amp;showinfo=0&amp;iv_load_policy=3" wmode="transparent" allowscriptaccess="always" id="app-youtube-audio-0" class="app-youtube-audio hidden" />' );
		jQuery( "#wrapper").prepend( '<embed type="application/x-shockwave-flash" src="http://www.youtube.com/apiplayer?modestbranding=1&amp;enablejsapi=1&amp;version=3&amp;playerapiid=app-youtube-audio-1&amp;rel=0&amp;disablekb=1&amp;fs=1&amp;showinfo=0&amp;iv_load_policy=3" flashvars="modestbranding=1&amp;enablejsapi=1&amp;version=3&amp;playerapiid=app-youtube-audio-0&amp;rel=0&amp;disablekb=1&amp;fs=1&amp;showinfo=0&amp;iv_load_policy=3" wmode="transparent" allowscriptaccess="always" id="app-youtube-audio-1" class="app-youtube-audio hidden" />' );
*/

		var params = {
			"allowScriptAccess":"always",
			"wmode":"transparent"
		};
		var atts = {
			"id":"app-youtube-audio-0",
			"class":"app-youtube-audio hidden",
			"wmode":"transparent"
		};

		var atts1 = {
			"id":"app-youtube-audio-1",
			"class":"app-youtube-audio hidden",
			"wmode":"transparent"
		};

		swfobject.embedSWF("http://www.youtube.com/apiplayer?modestbranding=1&amp;enablejsapi=1&amp;version=3&amp;playerapiid=app-youtube-audio-0&amp;rel=0&amp;disablekb=1&amp;fs=1&amp;showinfo=0&amp;iv_load_policy=3",
			"app-youtube-audio-0",
			"130",
			"130",
			"8",
			null,
			null,
			params,
			atts
		);

		swfobject.embedSWF("http://www.youtube.com/apiplayer?modestbranding=1&amp;enablejsapi=1&amp;version=3&amp;playerapiid=app-youtube-audio-1&amp;rel=0&amp;disablekb=1&amp;fs=1&amp;showinfo=0&amp;iv_load_policy=3",
			"app-youtube-audio-1",
			"130",
			"130",
			"8",
			null,
			null,
			params,
			atts1
		);

	
	}
);

