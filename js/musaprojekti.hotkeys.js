(function(d){function h(g){if(typeof g.data==="string"){var h=g.handler,i=g.data.toLowerCase().split(" ");g.handler=function(a){if(!(this!==a.target&&(/textarea|select/i.test(a.target.nodeName)||a.target.type==="text"))){var b=a.type!=="keypress"&&d.hotkeys.specialKeys[a.which],e=String.fromCharCode(a.which).toLowerCase(),c="",f={};a.ctrlKey&&b!=="ctrl"&&(c+="ctrl+");a.altKey&&b!=="alt"&&(c+="alt+");a.metaKey&&!a.ctrlKey&&b!=="meta"&&(c+="meta+");a.shiftKey&&b!=="shift"&&(c+="shift+");b?f[c+b]=!0:
(f[c+e]=!0,f[c+d.hotkeys.shiftNums[e]]=!0,c==="shift+"&&(f[d.hotkeys.shiftNums[e]]=!0));b=0;for(e=i.length;b<e;b++)if(f[i[b]])return h.apply(this,arguments)}}}}d.hotkeys={version:"0.8",specialKeys:{8:"backspace",9:"tab",13:"enter",16:"shift",17:"ctrl",18:"alt",19:"pause",20:"capslock",27:"esc",32:"space",33:"pageup",34:"pagedown",35:"end",36:"home",37:"left",38:"up",39:"right",40:"down",45:"insert",46:"del",96:"0",97:"1",98:"2",99:"3",100:"4",101:"5",102:"6",103:"7",104:"8",105:"9",106:"*",107:"+",
109:"-",110:".",111:"/",112:"f1",113:"f2",114:"f3",115:"f4",116:"f5",117:"f6",118:"f7",119:"f8",120:"f9",121:"f10",122:"f11",123:"f12",144:"numlock",145:"scroll",191:"/",224:"meta"},shiftNums:{"`":"~",1:"!",2:"@",3:"#",4:"$",5:"%",6:"^",7:"&",8:"*",9:"(",0:")","-":"_","=":"+",";":": ","'":'"',",":"<",".":">","/":"?","\\":"|"}};d.each(["keydown","keyup","keypress"],function(){d.event.special[this]={add:h}})})(jQuery);

(function(f){function c(a){var b=a||window.event,d=[].slice.call(arguments,1),e=0,c=0,g=0,a=f.event.fix(b);a.type="mousewheel";a.wheelDelta&&(e=a.wheelDelta/120);a.detail&&(e=-a.detail/3);g=e;b.axis!==void 0&&b.axis===b.HORIZONTAL_AXIS&&(g=0,c=-1*e);b.wheelDeltaY!==void 0&&(g=b.wheelDeltaY/120);b.wheelDeltaX!==void 0&&(c=-1*b.wheelDeltaX/120);d.unshift(a,e,c,g);return f.event.handle.apply(this,d)}var d=["DOMMouseScroll","mousewheel"];f.event.special.mousewheel={setup:function(){if(this.addEventListener)for(var a=
d.length;a;)this.addEventListener(d[--a],c,!1);else this.onmousewheel=c},teardown:function(){if(this.removeEventListener)for(var a=d.length;a;)this.removeEventListener(d[--a],c,!1);else this.onmousewheel=null}};f.fn.extend({mousewheel:function(a){return a?this.bind("mousewheel",a):this.trigger("mousewheel")},unmousewheel:function(a){return this.unbind("mousewheel",a)}})})(jQuery);

function HotkeyManager( boundMap, bindings, descriptorMap, HTMLFn ){
var i, l, elm;
this._boundMap = boundMap || {};
this._bindings = bindings || {};
this._descriptorMap = descriptorMap || [];
this._handlers = {};
this._specialHandlers = {};
this._descriptions = {};
this._encodeMap = {};
this._persistentHandlers = {};
	for( i = 0, l = this._descriptorMap.length; i < l; ++i ) {
	elm = this._descriptorMap[i];
	this._handlers[ elm.code ] = elm.handler || HotkeyManager.returnFalse;
	this._descriptions[ elm.code ] = elm.description;
	}
	
	for( var key in boundMap ) {
	this._encodeMap[boundMap[key].toLowerCase()] = key;
	}

this.HTML = HTMLFn || this.HTML;
this.enable();
}

HotkeyManager.Includes({
	STATIC__decodeMap: {
	"c":"Ctrl",
	"C":"Ctrl",
	"a":"Alt",
	"A":"Alt",
	"s":"Shift",
	"S":"Shift"	
	},
	
	STATIC__encodeMap: {
	"Ctrl":"c",
	"ctrl":"c",
	"alt":"a",
	"Alt":"a",
	"Shift":"s",
	"shift":"s"
	},
	
	STATIC__returnFalse: function(){
	return false;
	},
	
	getCurrentBinds: function(){
	return this._bindings;
	},
	
	addException: function( val ) {
	this._persistentHandlers[val] = this._handlers[val];
	},
	
	exceptionUnBind: function(){
	var doc = $(document), key;
	
		for( key in this._persistentHandlers )  {
		doc.unbind( "keydown", this._persistentHandlers[key] );
			if( key in this._specialHandlers ) {
			doc.unbind("mousewheel", this._specialHandlers[key] );
			}
		}
	
	},
	exceptionBind: function(){
	var doc = $(document), key, mods, comb, mKey;
	
		for( key in this._persistentHandlers )  {
		comb = this._bindings[key];
		
			if( !comb ) {
			continue;
			}
			
		mods = comb.split("+");
		mKey = mods.pop();
		
			if( typeof this.special[ mKey ] == "function" ) {
				if( !this._specialHandlers[key] ) {
				this._specialHandlers[key] = this.special[ mKey ].call( this, this._persistentHandlers[key], mods );
				}
			doc.bind("mousewheel", this._specialHandlers[key] );
			}
			else {
			comb = this.__decode(comb).toLowerCase();		
			doc.bind("keydown", comb, this._persistentHandlers[key] );
			}		
		}	
	},
	
	HTML: function( action, boundto, code, index) {
	return "";
	},
	
	/*
	* Hacky solution that cancels the wheel hotkey if any elements under the mouse are scrollable.
	*/
	special: {
		mwdn: function( fn, mods ) {
		var modifiers = mods.length && mods.join( "+" )+"+" || "";
			return function( e, delta ){
			var modStr = "", node = e.target;
						
				if(delta < 0) {
					if( e.ctrlKey ) {
					modStr += "c+";
					}

					if( e.altKey ) {
					modStr += "a+";
					}

					if( e.shiftKey ) {
					modStr += "s+";
					}
					
					if( modStr != modifiers ) {
					return;
					}
					
					while( node && node != document.body ){

						if( node.clientHeight < node.scrollHeight) {
						return true;
						}
					node = node.parentNode;
					}

				fn(e);
				return true;
				}
			};
		},
		mwup: function( fn, mods ) {
		var modifiers = mods.length && mods.join( "+" )+"+" || "";
			return function( e, delta ) {
			var modStr = "", node = e.target;

				if( delta > 0 ) {
				
					if( e.ctrlKey ) {
					modStr += "c+";
					}

					if( e.altKey ) {
					modStr += "a+";
					}

					if( e.shiftKey ) {
					modStr += "s+";
					}
					
					if( modStr != modifiers ) {
					return;
					}
					
					while( node && node != document.body ){

						if( node.clientHeight < node.scrollHeight) {
						return true;
						}
					node = node.parentNode;
					}
				fn(e);
				return true;
				}
			};
		}
	},
	enable: function(){
	var key, comb, mods, mKey, doc = $(document);
		for( key in this._bindings ) {
		comb = this._bindings[key];
			
			if( !comb || ( key in this._persistentHandlers ) ) {
			continue;
			}
			
		mods = comb.split("+");
		mKey = mods.pop();
		
			if( typeof this.special[ mKey ] == "function" ) {
				if( !this._specialHandlers[key] ) {
				this._specialHandlers[key] = this.special[ mKey ].call( this, this._handlers[key], mods );
				}
			doc.bind("mousewheel", this._specialHandlers[key] );
			continue;
			}
			
		comb = this.__decode( comb ).toLowerCase();		
		doc.bind("keydown", comb, this._handlers[key] );
		}
	},
	disable: function(){
	var key, doc = $(document);
		for( key in this._handlers ) {
			if( ! ( key in this._persistentHandlers ) ) {
			doc.unbind( "keydown", this._handlers[key] );
				if( key in this._specialHandlers ) {
				doc.unbind( "mousewheel", this._specialHandlers[key] );
				}
			}
		}
	},
	getDescription: function( id ) {
	return this._descriptions[id] || null;
	},
	unBind: function( id ) {
	var doc = $(document);
		if( id in this._bindings ) {
		this._bindings[id] = "";
		}
		
		if( id in this._persistentHandlers ) {
		doc.unbind( "keydown", this._persistentHandlers[id] );
				if( id in this._specialHandlers ) {
				doc.unbind( "mousewheel", this._specialHandlers[id] );
				}
		}
	return this;
	},
	setBind: function( id, comb ) {
	var key, lookup = this.__encode(comb), doc, mods, mKey, doc = $(document);
	
		if( id in this._persistentHandlers ) {
		doc.unbind( "keydown", this._persistentHandlers[id] );
			if( id in this._specialHandlers ) {
			doc.unbind( "mousewheel", this._specialHandlers[id] );
			}
		}
		
		for( key in this._bindings ) {
			if( this._bindings[key] == lookup ) {
			this._bindings[key] = "";
			}
		}
		
	this._bindings[id] = lookup;
	},
	getBind: function( id ) {
	return this.__decode(this._bindings[id]) || "";
	},
	__encode: function( comb ){
	var modMap = HotkeyManager.encodeMap, map = this._encodeMap,
		arr = comb.split("+"), i, l = arr.length - 1, str = "";
		
		for( i = 0; i < l; ++i ) {
		str += ( modMap[arr[i]] + "+" );
		}
	return str + ( map[arr[i].toLowerCase()] || arr[i] ); 
	},
	__decode: function( comb ){
	var modMap = HotkeyManager.decodeMap, map = this._boundMap,
		arr = comb.split("+"), i, l = arr.length - 1, str = "";
		
		for( i = 0; i < l; ++i ) {
		str += ( modMap[arr[i]] + "+" );
		}
		
	return str + ( map[arr[i]] || arr[i] );
	},
	retrieveHTML: function(){
	var i, descriptorMap = this._descriptorMap, l = descriptorMap.length, descriptor, r = [],
		bindings = this._bindings, boundMap = this._boundMap, code;
	
		for( i = 0; i < l; ++i ) {
		descriptor = descriptorMap[i];
		code = bindings[descriptor.code] || "nocode";
		
			if( code != "nocode") {
			boundto = this.__decode( code );
			}
			else {
			boundto = "";
			}
		r.push( this.HTML( descriptor.action, boundto, descriptor.code, i ) );		
		}

	return r.join("");	
	}

});

var hotkeys = hotkeys || {};

hotkeys.categories = {
	"0": "Music player",
	"9": "Playlist management",
	"17": "Search results management",
	"18": "General actions",
	"24": "Saving & loading"
};
hotkeys.currentBind = "";

hotkeys.codeMap = {
	"mwup": "Mousewheel up",
	"mwdn": "Mousewheel down",
	"up": "Up",
	"down": "Down",
	"left": "Left",
	"right": "Right",
	"del": "Del",
	"enter": "Enter"
};

hotkeys.defaults = {
	"ADD": "a",
	"ALL": "c+a",
	"ALP": "",
	"CLS": "esc",
	"CNE": "c+c",
	"INV": "a+a",
	"JFL": "j",
	"JSR": "s",
	"NXT": "right",
	"MPL": "enter",
	"PLP": "up",
	"PLN": "down",
	"PLY": "z",
	"PRV": "left",
	"PSE": "x",
	"QLD": "c+d",
	"QSF": "c+a+s",
	"QSM": "c+s",
	"REV": "",
	"RMV": "del",
	"RND": "",
	"SB1": "a+mwdn",
	"SF1": "a+mwup",
	"STP": "c",
	"TOG": "tab",
	"VDN": "mwdn",
	"VHD": "",
	"VLD": "",
	"VSD": "",
	"VUP": "mwup"
};

$.extend( hotkeys.defaults, storage.get( "hotkeys" ) );

(function(){
var timeoutid = 0, changesBegun = false;

hotkeys.volumeUp = function(){
		if( !changesBegun ) {
		player.volumeSlider.onslidebegin.call( player.slider );
		}
	window.clearTimeout( timeoutid );
	
	timeoutid = window.setTimeout( 
		function(){
		changesBegun = false;
		player.volumeSlider.onslideend.call( player.slider );
		},
		800
	);
	
	changesBegun = true;
	var curVol = player.main.getVolume() / 100 + 0.03;
	curVol = curVol > 1 ? 1 : curVol;
	player.volumeSlider.onslide( curVol );
};
hotkeys.volumeDown = function(){
		if( !changesBegun ) {
		player.volumeSlider.onslidebegin.call( player.slider );
		}
	window.clearTimeout( timeoutid );
	
	timeoutid = window.setTimeout( 
		function(){
		changesBegun = false;
		player.volumeSlider.onslideend.call( player.slider );
		},
		800
	);
	changesBegun = true;
	var curVol = player.main.getVolume() / 100 - 0.03;
	curVol = curVol < 0 ? 0 : curVol;
	player.volumeSlider.onslide( curVol );
};


})();

hotkeys.descriptorMap = [{
code: "VUP",
action: "Volume up",
description: "Increases volume by 3%.",
	handler: hotkeys.volumeUp
}, {
code: "VDN",
action: "Volume down",
description: "Decreases volume by 3%.",
	handler: hotkeys.volumeDown
}, {
code: "PRV",
action: "Previous track",
description: "Jumps to the previous track or, if no previous track is available, to the first track in the current playlist.",
	handler: throttle( player.methodPrev, 200 )
}, {
code: "NXT",
action: "Next track",
description: "Jumps to the next track.",
	handler: throttle( player.methodNext, 200 )
}, {
code: "PLY",
action: "Play",
description: "Start playback.",
	handler: player.methodPlay
}, {
code: "PSE",
action: "Pause",
description: "Pauses playback.",
	handler: player.methodPause
}, {
code: "STP",
action: "Stop",
description: "Stops playback.",
	handler: player.methodStop
}, {
code: "SB1",
action: "Seek back",
description: "Seeks back by 1%."
}, {
code: "SF1",
action: "Seek forward",
description: "Seeks forward by 1%."
}, {
code: "MPL",
action: "Play selected",
description: "Starts playing the selected track. If multiple tracks are selected, the first track of the selection is played." +
		"If search tab is active, all selected tracks are first added to playlist.",
	handler: function(){
		if( tabs.activeTab == tabs.playlist ) {
			playlist.selections.applyTo( playlist.main.getContainer(), function(songs){
			playlist.main.changeSong( songs[0] );
			});				
		}
		else if ( tabs.activeTab == tabs.search ) {	
			search.selections.applyTo( search.main.getContainer(), function(songs){
			var newSongs = playlist.main.add( songs );
			
				if( newSongs.length ) {
				playlist.main.changeSong( newSongs[0] );
				}

			});			
		}
	return false;
	}
}, {
code: "PLP",
action: "Move previous",
description: "Move to previous track playlist or search results.",
	handler: function(){
		if( tabs.activeTab == tabs.playlist ) {
		playlist.selections.prev();			
		}
		else if ( tabs.activeTab == tabs.search ) {	
		search.selections.prev();		
		}
	return false;
	}
}, {
code: "PLN",
action: "Move next",
description: "Move to next track playlist or search results.",
	handler: function(){
		if( tabs.activeTab == tabs.playlist ) {
		playlist.selections.next();					
		}
		else if ( tabs.activeTab == tabs.search ) {	
		search.selections.next();			
		}
	return false;
	}
}, {
code: "RMV",
action: "Remove",
description: "Shortcut for deleting selected items from playlist.",
	handler: function(){
		playlist.selections.applyTo( playlist.main.getContainer(), function(songs){
		playlist.main.remove(songs);
		});
		playlist.selections.clearSelection();
	return false;
	}
}, {
code: "CNE",
action: "Clone",
description: "Clones the selected tracks. The cloned tracks will be inserted after the originals.",
	handler: function(){
		playlist.selections.applyTo( playlist.main.getContainer(), function(songs){
		var lastHash = songs[songs.length-1],
				lastItem = playlist.main.getPositionByHash( lastHash );
		playlist.main.add( playlist.main.getSongByHash( songs ), lastItem+1 );
		});
	return false;
	}
}, {
code: "ALP",
action: "Sort by name",
description: "Sorts the selected tracks by name in alphabetical order",
	handler: function(){
	playlist.selections.applyTo(
		playlist.main.getContainer(), 
		playlist.createSorter( playlist.main._hashList, "sort", [SORT_ALPHA_ASC( playlist.main["_songList" ], "name" )], false, playlist.selections  )
	);
	playlist.main.render();
	return false;
	}
}, {
code: "REV",
action: "Sort by reverse",
description: "Sorts the selected tracks by reversing their current order.",
	handler: function(){
	playlist.selections.applyTo(
		playlist.main.getContainer(),
		playlist.createSorter( playlist.main._hashList, "reverse", [], false, playlist.selections )
	);
	playlist.main.render();
	return false;
	}
}, {
code: "RND",
action: "Sort by random",
description: "Shuffles the selected tracks. Select all before this action to shuffle the whole playlist.",
	handler: function(){
	playlist.selections.applyTo(
		playlist.main.getContainer(),
		playlist.createSorter( playlist.main._hashList, "shuffle", [], false, playlist.selections )
	);
	playlist.main.render();
	return false;
	}
}, {
code: "ADD",
action: "Add to playlist",
description: "Adds the selected search results to playlist",
	handler: function(){
		if( tabs.activeTab == tabs.search  ) {
			search.selections.applyTo( search.main.getContainer(),
				function(songs ) {
				playlist.main.add( songs );
				}
			);
		}
	return false;
	}
}, {
code: "JSR",
action: "Search",
description: "Shortcut for activating search.",
	handler: function(){
	$( "#app-search-box")[0].focus();
	return false;
	}
}, {
code: "JFL",
action: "Filter",
description: "Shortcut for activating filter.",
	handler: filter.show
}, {
code: "ALL",
action: "Select all",
description: "Selects all tracks in current screen.",
	handler: tabs.selectAllFromCurrent
}, {
code: "INV",
action: "Invert selection",
description: "Inverts current selection.",
	handler: tabs.selectInverseFromCurrent
}, {
code: "CLS",
action: "Close popup",
description: "Closes all active popups.",
	handler: function(){
		if( popup.length ) {
		popup.closeAll();
		}
	return false;
	}
}, {
code: "TOG",
action: "Toggle view",
description: "Toggles view between playlist and search result",
	handler: function(){
		if( tabs.activeTab == tabs.search ) {
		tabs.selectTab( tabs.getTab( tabs.playlist ) );
		} else {
		tabs.selectTab( tabs.getTab( tabs.search ) );		
		}
	return false;
	}
},  {
code: "QSM",
action: "Quicksave memory",
description: "Saves the current playlist in browser memory. Name of the last saved playlist will be used.",
	handler: function(e){
	
		if( features.localStorage ) {
		var appDataSave = storage.get("appData") || {};
		var name = appDataSave.playlistName || "Playlist Name";
		playlist.saver.save( name, playlist.main.toArray() );
	
		}
	return false;
	}
}, {
code: "QSF",
action: "Quicksave file",
description: "Saves the current playlist as a file. Name of the last saved playlist will be used.",
	handler: function(){
	var appDataSave = storage.get("appData") || {};
	var name = appDataSave.playlistName || "Playlist Name";
	playlist.saver["export"]( name, playlist.main.toArray() );
	return false;
	}
}, {
code: "QLD",
action: "Quickload",
description: "Loads the most recently saved playlist from browser memory. Quickloading from a file is not supported due to security restrictions.",
	handler: function(){
		if( features.localStorage ) {
		var plists = storage.get( "PlaylistJSON" ), key;
			for( key in plists ) {
			playlist.loader.load( key );
			break;
			}
		}
	return false;
	}
}];

hotkeys.mouseWheel = false;


hotkeys.manager = new HotkeyManager( hotkeys.codeMap, hotkeys.defaults, hotkeys.descriptorMap, function( action, boundto, code, index ){
var r = '<div class="clear app-hotkey-container" id="'+code+'-'+index+'">' +
	'<div class="app-hotkey-name">'+action+'</div>' +
	'<div class="app-hotkey-binding">'+boundto+'</div>' +
	'</div>';
	
	if( hotkeys.categories[index] ) {
	r = '<div class="app-hotkey-category">'+hotkeys.categories[index]+'</div>' + r;
	}
return r;
});

hotkeys.manager.addException( "CLS" );

hotkeys.listenUserHotkeys = function( e, delta, deltaY, deltaX ) {
var str = "", key = e.which, wheel;

	if( e.ctrlKey ) {
	str += "Ctrl+";
	}

	if( e.altKey ) {
	str += "Alt+";
	}

	if( e.shiftKey ) {
	str += "Shift+";
	}
	
	if( e.type == "keydown" && !hotkeys.mouseWheel ) {

		if( key != 16 &&
			key != 17 &&
			key != 18 ) {
		str += $.hotkeys.specialKeys[key] || String.fromCharCode(key).toLowerCase();
		}
		
	hotkeys.currentBind = str;
	$( "#app-keybind-input").html(str);
	return false;
	}
	
	if( e.type == "keyup" ) {
	hotkeys.mouseWheel = false;
		switch( key ) {
		case 16:
		case 17:
		case 18:
		return false;
		}
		
	$( "#app-keybind-input").html( hotkeys.currentBind  );
	hotkeys.currentBind = "";
	
	return false;	
	}
	
	
	if( e.type == "mousewheel" ) {
	
		if(delta > 0) {
		wheel = "Mousewheel up";
		}
		else{
		wheel = "Mousewheel down";
		}

	$( "#app-keybind-input").html( str+wheel );
	hotkeys.currentBind = str + wheel;
	hotkeys.mouseWheel = true;
	return false;
	}
	
return false;
}

hotkeys.show = function( popup ){


popup.open( "<h2 class=\"app-header-2\">Hotkey setup</h2>" +
		"<div class=\"app-bread-text\">" +
		"Boost your <a href=\"http://www.youtube.com/watch?v=YbpCLqryN-Q\" target=\"_blank_\">APM</a> " +
		"by binding various shortcuts to keyboard buttons. If a hotkey is bound to a native browser action," +
		" that action will be overridden. For example, binding \"Ctrl+S\" will disable the default browser action " +
		"(save page) as long as it is bound. Overriding also applies to application bound hotkeys. " +
		"<span style=\"color:#D60024;\">Most hotkeys are disabled when a popup is open.</span></div><div style=\"margin-top: 15px; height: 300px;\">" +
		"<div id=\"app-hotkeys-wrapper\">" +
		"<div style=\"float:left;width:130px;height:15px;padding-left:5px;\" class=\"app-hotkey-header\">Action</div>" +
		"<div style=\"float:left;width:130px;height:15px;\" class=\"app-hotkey-header\">Bound to</div>" +
		"<div class=\"clear\"></div><div id=\"app-hotkeys-container\">"+hotkeys.manager.retrieveHTML()+"</div>" +
		"</div>" +
		"<div style=\"padding-left:9px;width:301px;height:300px;float:left;\">" +
		"<div style=\"height:20px;border-bottom:1px dotted #333333;\" class=\"app-hotkey-header\">Description</div>" +
		"<div id=\"app-describe-action\"></div>" +
		"</div><div class=\"clear\"></div>"+
		"</div>" +
		"<div style=\"height:40px;\">" +
		"<div id=\"app-hotkey-bind-container\"> " +
		"<div style=\"margin:4px 7px;width:80px;height:12px;\" class=\"left\">Binding to:</div>" +
		"<div id=\"app-keybind-input\" class=\"app-stealth-input left\" style=\"margin:4px 7px;width:200px;\"></div>" +
		"<div id=\"app-accept-bind\" class=\"app-popup-button left\">Apply</div>" +
		"<div id=\"app-deny-bind\" class=\"app-popup-button left\">Cancel</div>" +
		"<div id=\"app-hotkey-unbind\" class=\"app-popup-button left\">Unbind</div>" +
		"<div class=\"clear\"></div>" +
		"</div>",
		600,
		450 );
	
popup.closeEvent( function() {

	storage.set( "hotkeys", hotkeys.manager.getCurrentBinds() );
	$(document).unbind("keydown keyup mousewheel", hotkeys.listenUserHotkeys );
	}
);
			
var selections = new SingleSelectable( "app-hotkeys-container", ".app-hotkey-container", {activeClass: "app-hotkey-selected"} );

	selections.onselect = function( idx ) {
	var doc = $(document);
		doc.unbind("keydown keyup mousewheel", hotkeys.listenUserHotkeys );

			if( idx === null ) {
			$( "#app-hotkeys-container" )[0].style.overflowY = "scroll";
			return $( "#app-hotkey-bind-container").hide();
			}
		var id = $(".app-hotkey-container")[idx].id.substr(0, 3), desc;
		desc = hotkeys.manager.getDescription( id );
		$( "#app-keybind-input" ).html(hotkeys.manager.getBind( id ));
		$( "#app-describe-action" ).html(desc);
		$( "#app-hotkey-bind-container").slideDown( 350 );
		$("#app-hotkeys-container")[0].style.overflowY = "hidden";
		doc.bind("keydown keyup mousewheel", hotkeys.listenUserHotkeys );
		hotkeys.manager.exceptionUnBind();
	};

	$( "#app-hotkeys-container" ).delegate( ".app-hotkey-container", "mouseenter",
		function(e){
			if( selections.getSelection() !== null ) {
			return true;
			}
			
		var id = this.id.substr(0, 3), desc;
		desc = hotkeys.manager.getDescription( id );
		$( "#app-describe-action" ).hide().html(desc).fadeIn(150);	
		}
	);

	$( "#app-accept-bind" ).click(
		function(e){
		var elm = $("#app-keybind-input"), val = elm.text(), oldcss;
		
			if( !val || !val.split("+").pop() ) {
			oldcss = elm.css("backgroundColor");
			elm.css("backgroundColor","#E60000").fadeTo( 350, 0, function(){elm.css("backgroundColor", oldcss).fadeTo(0,1);});
			return false;
			}
		
		var id = $(".app-hotkey-container")[ selections.getSelection() ].id.substr(0, 3);
		selections.clear();
		$( "#app-hotkey-bind-container").hide();
		$( "#app-hotkeys-container" )[0].style.overflowY = "scroll";
		hotkeys.manager.setBind( id, val );
		hotkeys.manager.exceptionBind();
		$( "#app-hotkeys-container" ).html( hotkeys.manager.retrieveHTML() );
		}
	);

	$( "#app-deny-bind" ).click(
		function(e){
		selections.clear();
		$( "#app-hotkeys-container" )[0].style.overflowY = "scroll";
		$( "#app-hotkey-bind-container" ).hide();
		hotkeys.manager.exceptionBind();
		}
	);
	
	$( "#app-hotkey-unbind" ).click(
		function(){
		var id = $(".app-hotkey-container")[ selections.getSelection() ].id.substr(0, 3);
		hotkeys.manager.unBind( id );
		selections.clear();
		$("#app-hotkeys-container")[0].style.overflowY = "scroll";
		$( "#app-hotkey-bind-container").hide();
		$( "#app-hotkeys-container" ).html( hotkeys.manager.retrieveHTML() );
		hotkeys.manager.exceptionBind();
		}
	);
};

$( ".menul-hotkeys" ).click(
	function(){
	hotkeys.show( popup );
	}
);