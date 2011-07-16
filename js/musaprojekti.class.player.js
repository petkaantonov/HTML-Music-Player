function Player( playlist ){
var self = this;
this._volume = 0;
this._mutedVolume = 0;
this._youtubeQuality = "hd720";
this._isMuted = false;
this._isStopped = true;
this._isPaused = false;
this._isPlaying = false;
this._playlist = playlist.main;
this._revoke = []; /* holds blob urls, half of which get cleaned up when array reaches 10 elements 
			if cleared earlier it might interrupt with cross fading */
this._timerId = 0;
this._playerModified;
this._preloadTime = 5000; // TODO: Keep track of youtube video loading times and calculate average to determine this

this._allowPreloadTrigger = true;
this._crossFadeOutEnabled = true;
this._crossFadeOutTime = 10000;
this._crossFadeOutInProgress = false;
this._crossFadeOutLevel = 0.9;

this._crossFadeOutPlayer = "";
this._crossFadeOutType = "";
this._crossFadeOutCurve = "sCurve"
this._crossFadeInInProgress = false;
this._crossFadeInTime = 10000;
this._crossFadeInEnabled = false;
this._crossFadeInLevel = 0.25;

this._preloadId = 0;
this._crossFadeInCurve = "linear";

this._queueCrossFadeSettings = jQuery.noop;


/* don't clear out old in loadSong method, these are just basic hack booleans to cope with all the asynchronous mess */
this._noClear = false;
this._preventClear = false;

this._jPlayerPoller = this._jPlayerPollerCreate();
jQuery.jPlayer.prototype.jPlayerOnProgressChange = this._jPlayerPoller;
jQuery.jPlayer.prototype.jPlayerOnErrorCustom = function(){ /* link all jPlayer errors to this instance */
self._playerError();
};

/* in case crossfade doesn't trigger. happens when browser grossly misestimates the mp3 duration 
 and song ends before crossfade can trigger */
jQuery.jPlayer.prototype.onSoundCompleteCustom = function(){
self._hardComplete();
};

	this._crossFader = {
		type: "noop",
		id: ""
	};
	
	this._previousPlayer = {
		type: "noop",
		id: ""
	};

	this._currentPlayer = {
		type: "noop",
		id: ""
	};
	
	this._players = {
		"html5": [],
		"youtube": [],
		"flash": []
	};
}

Player.jPlayerStopUpdates = function( player ) { // Needed for fade outs
jQuery( "#"+player ).jPlayer( "stopUpdates" );
}

Player.jPlayerLoadSilent = function( url, player ) {
jQuery( "#"+player ).jPlayer( "setFileSilent", url ).jPlayer( "pause" ).jPlayer( "volume", 0 );
};

Player.jPlayerLoad = function( url, player ) {
jQuery( "#"+player ).jPlayer( "setFile", url ).jPlayer( "play" );
};

Player.jPlayerPlay = function( player ) {
jQuery( "#"+player ).jPlayer( "play" );
};

Player.jPlayerStop = function( player ) {
jQuery( "#"+player ).jPlayer( "playHeadTime", 1).jPlayer( "pause" );
};

Player.jPlayerPause = function( player ) {
jQuery( "#"+player ).jPlayer( "pause" );
};

Player.jPlayerSetVolume = function( amount, player ) {
jQuery( "#"+player ).jPlayer( "volume", amount );
};

Player.jPlayerSeekTo = function( amount, player ) {
jQuery( "#"+player ).jPlayer( "playHeadTime", amount );
};

Player.jPlayerDuration = function( player ) {
return jQuery( "#"+player ).jPlayer( "getData", "diag.totalTime" );
}

Player.jPlayerClear = function( player ) {
jQuery( "#"+player ).jPlayer( "clearFile" );
};

Player.matchYoutube = /youtube[0-9a-zA-Z-_]{11}/;

Player.Includes({
	ObjectURL: window.URL || window.webkitURL || window.mozURL || window.oURL || null,
	onyoutube: jQuery.noop,
	onqualitychange: jQuery.noop,
	onprogress: jQuery.noop,
	onerror: jQuery.noop,
	onsongload: jQuery.noop,
	onplay: jQuery.noop,
	onpause: jQuery.noop,
	onstop: jQuery.noop,
	
	_preventClearFn: function(){
	this._preventClear = true;
	},
	
	_youtubeStateChange: function( state, id ) {
	var elm = document.getElementById( id ), data = jQuery.data( elm );

		/* ignore this players state when it is fading out */	
		if( data.stopUpdates === true ) {
		return;
		}
	
		switch ( state ) {
		case -1:
			/* Avoid buffer hang at start, credit youtify.com :) */	
			if( data.loadingNew ) {
			this["youtube"].play( id );
			jQuery.data( elm, "loadingNew", false );
			}
		break;
		case 0: /* song ended */
			if( !this._isStopped )  {
			jQuery.data( elm, "changed", true );
			this._hardComplete();
			}
		break;
		case 2:
			if( !this._isStopped && !this._isPaused ) {
			this.play();
			}
		
		break;
		}
	

	},
	
	_youtubeQualityChange: function( quality ) {
	this.onqualitychange.call( this, quality );
	},
	
	_youtubePollerCreate: function( id ){
	var self = this;
	
		return function(){
		var elm = document.getElementById( id );
		
			if( jQuery.data( elm, "stopUpdates" ) === true ) {
			return;
			}
		
		var bl = elm.getVideoBytesLoaded(),
			pt = elm.getCurrentTime() * 1000,
			tt = elm.getDuration() * 1000,
			bt = elm.getVideoBytesTotal(),
			ppa = pt / tt * 100,
			lp = bl / bt * 100;
		
		self._totalTime = tt;
		self._currentTime = pt;
		self._notifyCrossFader( pt, tt );
		self.onprogress.call( self, lp, ppa, pt, tt, bl, bt );
		};
	},
	
	_jPlayerPollerCreate: function(){
	var self = this;
	
		return function(lp, ppr, ppa, pt, tt, bl, bt) {
		this.config.diag.totalTime = tt;
		self._notifyCrossFader( pt, tt );
		self.onprogress.call( self, lp, ppa, pt, tt, bl, bt);
		};
	
	},
		
	_playerError: function(){
	this.onerror.call( this, this._playlist._currentSong, this._playlist.getPositionByHash( this._playlist._currentSong ));
	this._cancelFadeOut();
	this._cancelFadeIn();
	this._noClear = false;
	this._playerModified = false;
	this._playlist.next();
	},
	
	_hardComplete: function(){
		if( !this._crossFadeInInProgress ) {
		this._playlist.next();
		}
	},
	
	_startFadeInTriggered: false,

	_notifyCrossFader: function( pt, tt ) {

		this._fadeInFn();
		this._fadeOutFn();
		
		if( !this._isPlaying || tt < 30000 || pt < 1000 ) {
		return;
		}
	
		/* Trigger preload to prepare fadein */

		if( this._crossFadeInEnabled &&
			this._allowPreloadTrigger &&
			tt - pt <= this._crossFadeInTime + this._preloadTime ) {
		this._allowPreloadTrigger = false;
		this._startPreload();
		}

		/* Notify the preloader to start fade in */

		else if( !this._startFadeInTriggered  &&
				this._crossFadeInEnabled &&
				tt - pt <= this._crossFadeInTime ) {
		this._startFadeInTriggered = true;
		}

		/* Start cross fade out */
		
		if( this._crossFadeOutEnabled &&
			!this._crossFadeOutInProgress &&
			tt - pt <= this._crossFadeOutTime ) {
		this._startFadeOut();	
		}
		

	},
	
	_getPlayerType: function( str ) {
	
		if( str.constructor === window.File ) {
		return "html5";
		}
		else if( Player.matchYoutube.test( str ) ) {
		return "youtube";
		}
		else {
		return "flash";
		}
	},
	
	_fadeInFn: jQuery.noop,
	_fadeOutFn: jQuery.noop,
			
	_startFadeOut: function(){
		if( this._crossFadeOutInProgress ) {
		return;
		}
	var self = this, ticks = 0, maxTicks = this._crossFadeOutTime / 50,
		player, type, level = this._crossFadeOutLevel;
	
	this._crossFadeOutInProgress = true;
	
		/* fadeOut triggered after fadeIn started, fade out previous player */
		if( this._playerModified) {
		player = this._previousPlayer.id;
		type = this._previousPlayer.type;
		}
		/* fadeOut triggered before fadeIn started, fade out current player */
		else {
		player = this._currentPlayer.id;
		type = this._currentPlayer.type;
		}
	
	this._playerModified = false;
	this._crossFadeOutType = type;
	this._crossFadeOutPlayer = player;
	
	self[ type ].setVolume( self._volume, player );
	var now = +new Date;

	this._fadeOutFn = function() {
			var curVol;
				if( self._isPlaying ) { 
				ticks = ( ( +new Date ) - now ) / 50;
				curVol = self._volume;
				
				var vol = curVol * ( 1 - crossfading.curves[ self._crossFadeOutCurve ]( ticks, maxTicks ) * level  );
				
				self[ type ].setVolume( vol, player );
				
					if( ticks >= maxTicks ) {
					self._fadeOutFn = jQuery.noop;
					self._crossFadeOutInProgress = false;
					self._allowPreloadTrigger = true;
					self._crossFadeOutPlayer = "";
					self._crossFadeOutType = "";
					self[ type ].clear( player );
						if( !self._crossFadeInEnabled &&
							jQuery.data( document.getElementById( player ), "changed") !== true  ) { /* Allow fade out to trigger next song as the updates are stopped and song end cannot be determined */

						self._playlist.next();
						}
					}
				}
			};
	},
	
	_startFadeIn: function( player, type ) {
	
		if( this._crossFadeInInProgress ) {
		return;
		}
	var ticks = 0, maxTicks = this._crossFadeInTime / 50, self = this,
		level = this._crossFadeInLevel;
		
		/* in case fadeIn triggers earlier than fadeout, the main player changes and cannot
		be used for triggering fade out */
	var ticksForFadeOut = this._crossFadeInTime >= this._crossFadeOutTime &&
		this._crossFadeOutEnabled ?
		( ( this._crossFadeInTime - this._crossFadeOutTime ) / 50 ) >> 0 :
		null;
		
	
	this._crossFader.type = type;
	this._crossFader.id = player;
	this._clearInterval();
	
	this._noClear = true;
	this._crossFadeInInProgress = true;
	this.onprogress.call( this, 0, 0, 0, 0, 0, 0 );
	this._preventClearFn();
	this._playlist.next();
	self._startFadeInTriggered = false;
		/* this flag tells whether fadeOut should use previous or current player */

	this[ type ].play( player );
	self[ type ].setVolume( level, player );
		if( ticksForFadeOut === 0 && !this._crossFadeOutInProgress ) {
		this._startFadeOut();
		}
	
	var now = +new Date;
	this._fadeInFn = function(){
			if( self._isPlaying ) {
			var curVol = self._volume;
			ticks = ( ( +new Date ) - now ) / 50;
			var vol = crossfading.curves[ self._crossFadeInCurve ]( ticks, maxTicks ) * ( 1-level ) * curVol + ( level * curVol );

			self[ type ].setVolume( vol, player );
			
				/* fadeOut needs to be triggered here because fadein changes the main player */
				if( ticksForFadeOut != null
					&& !self._crossFadeOutInProgress
					&& ticks >= ticksForFadeOut
					&& ticksForFadeOut > 0 ) {
				self._startFadeOut();
				}

				if( ticks >= maxTicks ) {
				self._fadeInFn = jQuery.noop;
				self._crossFadeInInProgress = false;
				self._allowPreloadTrigger = true;
				}
			}
		};
	},
	
	_cancelPreload: function(){
	window.clearInterval( this._preloadId );
	this._allowPreloadTrigger = true;	
	},
	
	_cancelFadeIn: function(){
	this._fadeInFn = jQuery.noop;
	this._startFadeInTriggered = false;
	this._crossFadeInInProgress = false;
	this._allowPreloadTrigger = true;
	},
	
	_cancelFadeOut: function( soft ){
	this._fadeOutFn = jQuery.noop;
	
		if( this._crossFadeOutInProgress ) {
			/* Hard cancel, used in errors and similar ( pressing stop button ) */
			if( !soft ) {
			this[ this._crossFadeOutType ].clear( this._crossFadeOutPlayer );
			this._crossFadeOutPlayer = "";
			this._crossFadeOutType = "";
			/* Soft cancel, used when seeking back during fade out */
			} else {
			this[ this._crossFadeOutType].setVolume( this.getVolume(), this._crossFadeOutPlayer );
			}
		}
	
	this._crossFadeOutInProgress = false;
	},
	
	_startPreload: function() {
	var next = this._playlist.__NEXT(), self = this, now, ticks = 0;
		if( !next ) {
		return;
		}
		
	var url = next.url, type = this._getPlayerType( url ),
		player = this._getPlayer( type );
				
		if( !player ) {
		return;
		}
		
		if( type == "html5" ) {
		url = this.ObjectURL.createObjectURL( url );
		
			if( url ) {
			this._revoke.push( url );
			}
		}


	this[type].loadSilent.call( this, url, player );
	this._preloadId = window.setInterval( function(){
			if( !self._isPaused && !self._isStopped ) {
			ticks++;	
				if( self._startFadeInTriggered || ticks >= self._crossFadeInTime / 500 ) {
				window.clearInterval( self._preloadId );
				self._startFadeIn( player, type );
					if( type == "youtube" ) {
					self.onyoutube( player );
					}
				}
			}
		}, 500 );
	
	},
	
	_getPlayer: function( type ) {
	var arr = this._players[type], tmp;
	
	
		if( !arr || arr.length !== 2 ) {
		this.onerror.call( this, this._playlist._currentSong, this._playlist.getPositionByHash( this._playlist._currentSong ));
		return false;
		}
	
	tmp = arr[1];
	arr[1] = arr[0];
	arr[0] = tmp;
	return tmp;
	},
	
	_clearInterval: function(){
	var jPlayerID;
	window.clearInterval( this._timerId );
	window.clearInterval( this._preloadId );
	this._cancelFadeIn();

		if( this._currentPlayer.type != "youtube" ) {
		this[this._currentPlayer.type].stopUpdates( this._currentPlayer.id );
		}
	
	},
	
	_setInterval: function( type, id ){
	
		if( type == "youtube" ) {
		this._timerId = window.setInterval( this._youtubePollerCreate( id ), 250 );
		}
		else {
		jQuery.jPlayer.prototype.jPlayerOnProgressChange = this._jPlayerPoller;
		}
	
	},
	
	"noop": {
		stopUpdates: jQuery.noop,
		loadSilent: jQuery.noop,
		load: jQuery.noop,
		play: jQuery.noop,
		pause: jQuery.noop,
		stop: jQuery.noop,
		setVolume: jQuery.noop,
		seekTo: jQuery.noop,
		clear: jQuery.noop
	},
	
	"youtube": {
		stopUpdates: function( player ){
		jQuery.data( document.getElementById( player ), "stopUpdates", true );
		},
		loadSilent: function( url, player ){
		url = url.substr( 7 ), elm = document.getElementById( player );
		elm.cueVideoById( url, 0, this._youtubeQuality );
		elm.setVolume( 0 );
		jQuery.data( elm, "stopUpdates", true );
		jQuery.data( elm, "changed", false );
		},
		load: function( url, player ) {
		url = url.substr( 7 ), elm = document.getElementById( player );
		
		elm.loadVideoById( url, 0, this._youtubeQuality );
		jQuery.data( elm, "loadingNew", true );
		jQuery.data( elm, "stopUpdates", false );
		jQuery.data( elm, "changed", false );
		
		},
		play: function( player ) {
		var elm = document.getElementById( player );
		jQuery.data( elm, "stopUpdates", false );
		elm.playVideo();
		},
		pause: function( player ){
		document.getElementById( player ).pauseVideo();
		},
		stop: function( player ){
		var elm = document.getElementById( player );
		elm.seekTo( 0, true );
		elm.pauseVideo();
		},
		setVolume: function( amount, player ){
		document.getElementById( player ).setVolume( amount );
		},
		seekTo: function( amount, player ) {
		var elm = document.getElementById( player );
		elm.seekTo( ( amount / 1000 ) >> 0, true );
			if( this._isPaused ) {
			elm.pauseVideo();
			}
		
		},
		duration: function( player ) {
		return document.getElementById( player ).getDuration() * 1000;
		},
		clear: function( player ) {
		var elm = document.getElementById( player );
		elm.stopVideo();
		elm.clearVideo();
		jQuery.data( elm, "stopUpdates", true );
		}
	},
	
	"flash": {
		stopUpdates: Player.jPlayerStopUpdates,
		loadSilent: Player.jPlayerLoadSilent,
		load: Player.jPlayerLoad,
		play: Player.jPlayerPlay,
		pause: Player.jPlayerPause,
		stop: Player.jPlayerStop,
		setVolume: Player.jPlayerSetVolume,
		seekTo: Player.jPlayerSeekTo,
		clear: Player.jPlayerClear,
		duration: Player.jPlayerDuration
	},
	
	"html5": {
		stopUpdates: Player.jPlayerStopUpdates,
		loadSilent: Player.jPlayerLoadSilent,
		load: Player.jPlayerLoad,
		play: Player.jPlayerPlay,
		pause: Player.jPlayerPause,
		stop: Player.jPlayerStop,
		setVolume: Player.jPlayerSetVolume,
		seekTo: Player.jPlayerSeekTo,
		clear: Player.jPlayerClear,
		duration: Player.jPlayerDuration
	},
	
	importCrossFade: function( opts ){
	var self = this;
	this._queueCrossFadeSettings = function(){
			var key;
				if( !self._crossFadeOutInProgress && !self._crossFadeInInProgress ) {				
					for( key in opts ) {
					self[ key ] = opts[ key ];
					}
				self._queueCrossFadeSettings = jQuery.noop;
				}
		
			};
			
		if( !this._crossFadeOutInProgress && !this._crossFadeInInProgress ) {
		this._queueCrossFadeSettings();
		}
	},
	
	addPlayer: function( type, id ) {
	this._players[type].push( id );
	return this;
	},
	
	loadSong: function( url ) {
	var i, l = this._revoke.length, type, player,
		crossFader, currentPlayer = this._currentPlayer,
		previousPlayer = this._previousPlayer;
		

	this[currentPlayer.type].stopUpdates( currentPlayer.id );
	
	
		if( !this._preventClear ) {
		this._clearInterval();
		this._cancelFadeOut();
		}
		else {
		this._preventClear = false;
		}
		
		while( l > 4) {
		this.ObjectURL.revokeObjectURL( this._revoke.shift() );
		l--;
		}
		
		if( !this._noClear ) {
		this._playerModified = false;
			if( !this._crossFadeOutPlayer || this._crossFadeOutPlayer !== currentPlayer.id ) {
			this[currentPlayer.type].clear( currentPlayer.id );
			}
			
		this.onprogress.call( this, 0, 0, 0, 0, 0, 0 );
		type = this._getPlayerType( url );
		player = this._getPlayer( type );
		
			if( !player ) {
			return;
			}
		
			if( type == "html5" ) {
			url = this.ObjectURL.createObjectURL( url );
				if( url ) {
				this._revoke.push( url );
				}

			}
			else if( type == "youtube") {
			this.onyoutube( player );
			}

		this[type].load.call( this, url, player );
		this[type].setVolume.call( this, this.getVolume(), player );
		this._allowPreloadTrigger = true;
		this._queueCrossFadeSettings();
		}
		else {
			if( this._crossFadeOutEnabled && !this._crossFadeOutInProgress ) {
			this._playerModified = true;
			}
		this._noClear = false;
		crossFader = this._crossFader;
		type = crossFader.type;
		player = crossFader.id;
		}
		

	
	this._setInterval( type, player );
	previousPlayer.id = currentPlayer.id;
	previousPlayer.type = currentPlayer.type;
	currentPlayer.id = player;
	currentPlayer.type = type;	
	this._isPaused = false;
	this._isStopped = false;
	this._isPlaying = true;	
	this.onplay.call( this );
	},
	
	play: function(){
	var success = true; 
		if( !this._playlist._currentSong ) {
		success = this._playlist.next();
		}
	
		if( !success || this._isPlaying ) {
		return this;
		}
	
	this._isPaused = false;
	this._isStopped = false;
	this._isPlaying = true;	
	this[this._currentPlayer.type].play( this._currentPlayer.id );
	this.onplay.call( this );
	
	},
	
	pause: function(){
	
		if( !this._isPlaying ) {
		return this;
		}
		

	this._isPlaying = false;
	this._isPaused = true;
	this._isStopped = false;
	this[this._currentPlayer.type].pause( this._currentPlayer.id );
	this.onpause.call( this );	
	},
	
	stop: function(){
	
		if( !this._isPlaying && !this._isPaused ) {
		return this;
		}

	this._isPlaying = false;
	this._isPaused = false;
	this._isStopped = true;	
	this[this._currentPlayer.type].stop( this._currentPlayer.id );
	this._cancelPreload();
	this._cancelFadeOut();
	this._cancelFadeIn();

	this.onstop.call( this );
	},

	
	seek: function( ms ){
	var dur = this.getDuration(), limit;
	
	
	
	
		if( this._crossFadeInEnabled || this._crossFadeOutEnabled ) {
		//Prevent seeking past cross fade trigger		
			if( dur - ms <= this._crossFadeInTime + 250 ) {
			ms = dur - this._crossFadeInTime - 250;
			}
			
			if( this._crossFadeInInProgress ) {
			this._cancelFadeIn();
			}
			
			if( this._crossFadeOutInProgress ) {
			this._cancelFadeOut();
			}

		}
	
		// Cancel preload if currently in progress and user suddenly seeks time before preload trigger
		if( !this._allowPreloadTrigger && ms < dur - this._preloadTime - this._crossFadeInTime ) {
		this._cancelFadeOut( true );
		this._cancelPreload();
		}
		

		
	this[this._currentPlayer.type].seekTo( ms, this._currentPlayer.id );
	},


	isMuted: function(){
	return this._isMuted;
	},
	
	getDuration: function(){
	return this[this._currentPlayer.type].duration( this._currentPlayer.id );
	},
		
	toggleMute: function(){
	this._isMuted = this._isMuted ? false : true;
		if( this._isMuted ) {
		this._mutedVolume = this._volume;
		this.setVolume( 0 );
		return 0;
		}
		else {
		this.setVolume( this._mutedVolume );
		return this._volume;
		}
	},
	getVolume: function(){
	return this._volume;
	},
	setVolume: function( val ) {	
	val = val < 0 ? 0 : val;
	val = val > 100 ? 100 : val;
	this._volume = val;
	
	this[this._currentPlayer.type].setVolume( val, this._currentPlayer.id );
	return this;
	}
});