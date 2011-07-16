var tooltip = tooltip || {};

tooltip.enabled = true;

tooltip.modesX = function(){
return document.getElementById( "app-playlist-modes-container" ).offsetLeft + 82;
}

tooltip.modesY = function(){
return 17;
}

tooltip.classes = {
	"app-mode-repeat": {
		"type":"left",
		"x":tooltip.modesX,
		"y":tooltip.modesY,
		"msg":"Repeat mode"
	},
	"app-mode-shuffle": {
		"type":"left",
		"x":tooltip.modesX,
		"y":tooltip.modesY,
		"msg":"Shuffle mode"
	},
	"app-mode-normal": {
		"type":"left",
		"x":tooltip.modesX,
		"y":tooltip.modesY,
		"msg":"Normal mode"
	},
	"tooltip-view": {
		"type":"right",
		"x":function(){ return document.getElementById("tooltip-view").offsetLeft - 180;},
		"y":function(){ return document.getElementById("tooltip-view").offsetTop - 6;},
		"msg":function(){ return "Switch between views by pressing the <b>"+hotkeys.manager.getBind( "TOG" )+"</b> key"; }
	},
	"tooltip-selection": {
		"type":"right",
		"x":function(){return document.getElementById("tooltip-selection").offsetLeft - 180;},
		"y":function(){return document.getElementById("tooltip-selection").offsetTop - 6;},
		"msg":"Do something with the selected tracks"
	}

};

tooltip.mainHandler = function(e){
var msg;
	if( !tooltip.enabled ) {
	return true;
	}

	if( e.type == "mouseleave" ) {
	tooltip.left.hide();
	tooltip.right.hide();
	return;
	}
	
var target = e.target.id.toString(), prop = tooltip.classes[target];
	
	if( prop ) {
	msg = prop.msg;
		if( typeof msg == "function" ) {
		msg = msg();
		}
	tooltip[prop.type].show( msg, prop.x(), prop.y() );
	}

};

tooltip.left = new Tooltip({
	transition: "fadeIn",
	delay: 260,
	arrowBorder: "1px #999",
	arrowOffset: "5px",
	arrowDirection:"left",
	arrowSize:"7px",
	arrowBackgroundColor: "#F5FCFF",
	classPrefix: "app-tooltip"
});

tooltip.right = new Tooltip({
	transition: "fadeIn",
	delay: 260,
	arrowBorder: "1px #999",
	arrowOffset: "5px",
	arrowDirection:"right",
	arrowSize:"7px",
	arrowBackgroundColor: "#F5FCFF",
	classPrefix: "app-tooltip"
});

tooltip.emptyPlaylist = new Tooltip({
	transition: "fadeIn",
	delay: 260,
	arrowBorder: "1px #999",
	arrowOffset: "5px",
	arrowDirection:"top",
	arrowSize:"7px",
	arrowBackgroundColor: "#F5FCFF",
	appendTo: "app-playlist-container",
	classPrefix: "app-tooltip-playlist-empty"
});


tooltip.emptyPlaylist.message = "You can add tracks to playlist by:<ul class=\"menulist app-empty-playlist-ul\">" +
				"<li class=\"app-empty-playlist-suggest\">- Searching</li> " +
				"<li class=\"app-empty-playlist-suggest\">- Pressing ctrl+v ( copy paste ), if you happen to have a youtube url in clipboard </li> " +
				"<li class=\"app-empty-playlist-suggest" +
				( !features.localStorage && !features.readFiles ? " app-feature-disabled" : "" ) +
				"\">- Loading a playlist</li>" +
				"<li class=\"app-empty-playlist-suggest" +
				( !features.readFiles || !features.mp3 || !features.dragFiles ? " app-feature-disabled" : "" ) +
				"\">- Dragging & Dropping mp3 files from your desktop</li>" +
				"<li class=\"app-empty-playlist-suggest" +
				( !features.directories || !features.mp3 ? " app-feature-disabled" : "" ) +
				"\">- Using \"Add a folder\" to add whole folders of mp3 files at once</li></ul>";
				


$( ".app-playlist-mode", document.getElementById( "app-playlist-modes-container" ) ).bind("mouseenter mouseleave", tooltip.mainHandler );
$( "#tooltip-view").add("#tooltip-selection").bind("mouseenter mouseleave", tooltip.mainHandler );

$( "#app-playlist-container").delegate( "#playlist-empty-hover", "mouseenter mouseleave",
	function(e){
	
		if( !tooltip.enabled ) {
		return true;
		}
		if( e.type=="mouseleave" ) {
		return tooltip.emptyPlaylist.hide();
		}
				
	tooltip.emptyPlaylist.show( tooltip.emptyPlaylist.message,
					this.offsetLeft + 15,
					this.offsetTop + 45);
	}
);