var crossfading = crossfading || {};

crossfading.presets = {
	"Default": {
	_crossFadeOutEnabled: true,
	_crossFadeOutTime: 9000,
	_crossFadeOutLevel: 0.9,
	_crossFadeOutCurve: "sCurve",
	_crossFadeInTime: 6000,
	_crossFadeInEnabled: true,
	_crossFadeInLevel: 0.25,
	_crossFadeInCurve: "sCurve"
	},
	"Normal": {
	_crossFadeOutEnabled: true,
	_crossFadeOutTime: 5000,
	_crossFadeOutLevel: 1,
	_crossFadeOutCurve: "linear",
	_crossFadeInTime: 5000,
	_crossFadeInEnabled: true,
	_crossFadeInLevel: 0,
	_crossFadeInCurve: "linear"
	},
	"Sudden death": {
	_crossFadeOutEnabled: true,
	_crossFadeOutTime: 6000,
	_crossFadeOutLevel: 1,
	_crossFadeOutCurve: "exponentialFromStart",
	_crossFadeInTime: 7000,
	_crossFadeInEnabled: true,
	_crossFadeInLevel: 0.06,
	_crossFadeInCurve: "sCurve"
	},
	"Disabled": {
	_crossFadeOutEnabled: false,
	_crossFadeOutTime: 0,
	_crossFadeOutLevel: 1,
	_crossFadeOutCurve: "linear",
	_crossFadeInTime: 0,
	_crossFadeInEnabled: false,
	_crossFadeInLevel: 0,
	_crossFadeInCurve: "linear"
	}
};

crossfading.loadPreset = function( name ) {
var preset;
	if( typeof name == "string" ) {
	preset = crossfading.presets[ name ] || crossfading.presets[ "Default" ];
	return jQuery.extend( {}, preset );
	}
return name;
};

crossfading.curves = { /* Modified from jQuery easing plugin */
	cubicFromStart: function( ticks, maxTicks ) {
	return ( ticks = ticks / maxTicks - 1 ) * ticks * ticks + 1;
	},
	
	linear: function( ticks, maxTicks ) {
	return ticks / maxTicks;
	},
	
	sCurve: function( ticks, maxTicks ) {
	ticks = ticks / ( maxTicks / 2 );
	
		if( ticks < 1 ) {
		return 1 / 2 * ticks * ticks * ticks;
		}
	return 1 / 2 * ( ( ticks -= 2 ) * ticks * ticks + 2 );
	},
	
	exponentialFromStart: function( ticks, maxTicks ) {
	return ( ticks == maxTicks ) ? 1 : -Math.pow( 2, -10 * ticks / maxTicks ) + 1;
	},
	
	exponentialToEnd: function( ticks, maxTicks ) {
	return ( ticks == 0 ) ? 0 : Math.pow( 2, 10 * ( ticks / maxTicks - 1 ) );
	}
};

crossfading.setPresetToCustom = function(){
document.getElementById( "app-fade-presets" ).options[4].selected = true;
}

crossfading.onslide = function( p, type, key, canv ){
var val = p;
	if( type == "time" ) {
	val = p * 20000;
	}
	
canv.setValue( key, val );
canv.draw();
crossfading.setPresetToCustom();
return val;
};

crossfading.getPresetIndex = ( function() {
var presets = {
	"Default": 0,
	"Normal": 1,
	"Sudden death": 2,
	"Disabled": 3,
	"Custom": 4
};
	return function( presetName ) {
		if( presetName in presets ) {
		return presets[ presetName ];
		}
	return 4;
	};
})();

crossfading.getCurveIndex = ( function() {
var curves = {
	"linear": 0,
	"sCurve": 1,
	"cubicFromStart": 2,
	"exponentialFromStart": 3,
	"exponentioalToEnd": 4	
};
	return function( curve ) {
		if( curve in curves ) {
		return curves[curve];
		}
	return 1;
	};
})();


// TODO: Compress this into loops instead of shit ton of statements
crossfading.applyPresetUIValues = function( opts, presetName ) {
var fInEnabled = opts._crossFadeInEnabled,
	fOutEnabled = opts._crossFadeOutEnabled,
	fInLevel = opts._crossFadeInLevel,
	fOutLevel = opts._crossFadeOutLevel,
	fInCurve = crossfading.getCurveIndex( opts._crossFadeInCurve ),
	fOutCurve = crossfading.getCurveIndex( opts._crossFadeOutCurve ),
	fInTime = opts._crossFadeInTime,
	fOutTime = opts._crossFadeOutTime,
	fInLevelPercentage = fInLevel,
	fInTimePercentage = fInTime / 20000,
	fOutLevelPercentage = fOutLevel,
	fOutTimePercentage = fOutTime / 20000;

fInLevel = ( ( fInLevel * 100 ) >> 0 ) + "%",
fOutLevel = ( ( fOutLevel * 100 ) >> 0 ) + "%",
fInTime = ( fInTime / 1000 ).toPrecision(2) + "s";
fOutTime = ( fOutTime / 1000 ).toPrecision(2) + "s";

var fInDisabled = fOutDisabled = fInSectionDisabled = fOutSectionDisabled = "";
var fInInputChecked = fOutInputChecked = false;

	if( fInEnabled ) {
	fInInputChecked = true;
	}
	else {
	fInDisabled = " disabled";
	fInSectionDisabled = "app-section-disabled";
	}
	
	if( fOutEnabled ) {
	fOutInputChecked = true;
	}
	else {
	fOutDisabled = " disabled";
	fOutSectionDisabled = "app-section-disabled";
	}
	

	
document.getElementById( "app-fadein-enable" ).checked = fInInputChecked;
document.getElementById( "app-fadein-section" ).className = fInSectionDisabled;
document.getElementById( "app-fadein-level-value" ).innerHTML = fInLevel;
document.getElementById( "app-fadein-time-value").innerHTML = fInTime;
document.getElementById( "app-fadein-curve" ).options[ fInCurve].selected = true;
document.getElementById( "app-fadein-level-bg" ).style.width = ( fInLevelPercentage * 100 ) + "%";
document.getElementById( "app-fadein-level-knob" ).style.left = ( fInLevelPercentage * 105 - 5 ) + "px";
document.getElementById( "app-fadein-time-bg" ).style.width = ( fInTimePercentage * 100 ) + "%";
document.getElementById( "app-fadein-time-knob" ).style.left = ( fInTimePercentage * 105 - 5 ) + "px";

	if( fInDisabled ) {
	document.getElementById( "app-fadein-curve").setAttribute( "disabled", "disabled" );
	}
	else {
	document.getElementById( "app-fadein-curve").removeAttribute( "disabled" );
	}
	
document.getElementById( "app-fadeout-enable" ).checked = fOutInputChecked;
document.getElementById( "app-fadeout-section" ).className = fOutSectionDisabled;
document.getElementById( "app-fadeout-level-value" ).innerHTML = fOutLevel;
document.getElementById( "app-fadeout-time-value").innerHTML = fOutTime;
document.getElementById( "app-fadeout-curve" ).options[ fOutCurve].selected = true;
document.getElementById( "app-fadeout-level-bg" ).style.width = ( fOutLevelPercentage * 100 ) + "%";
document.getElementById( "app-fadeout-level-knob" ).style.left = ( fOutLevelPercentage * 105 - 5 ) + "px";
document.getElementById( "app-fadeout-time-bg" ).style.width = ( fOutTimePercentage * 100 ) + "%";
document.getElementById( "app-fadeout-time-knob" ).style.left = ( fOutTimePercentage * 105 - 5 ) + "px";

	if( fOutDisabled ) {
	document.getElementById( "app-fadeout-curve").setAttribute( "disabled", "disabled" );
	}
	else {
	document.getElementById( "app-fadeout-curve").removeAttribute( "disabled" );
	}
	

document.getElementById( "app-fade-presets").options[ crossfading.getPresetIndex( presetName ) ].selected = true;
	
};

crossfading.getHTML = function( opts ){
var presets = crossfading.presets, preset, presetHTMLStr = "";

	for( preset in presets ) {
	presetHTMLStr += "<option value=\""+preset+"\">"+preset+"</option>";
	}
	
	presetHTMLStr += "<option value=\"Custom\">Custom</option>";

return "<h2 class=\"app-header-2\">Crossfading</h2>" +
"<div class=\"left\" style=\"width: 294px;\">" +
"<div style=\"margin-bottom: 10px;\">" +
"<input type=\"checkbox\" id=\"app-fadein-enable\">" +
"<label for=\"app-fadein-enable\">Enable fade in</label>" +
"<div class=\"fade-indicator\" id=\"fadein-color\"></div>" +
"</div>" +
"<div id=\"app-fadein-section\">" +
"<div class=\"fade-inputs-container\">" +
"<div class=\"normal-fade-label\">Level</div>" +
"<div id=\"app-fadein-level-slider\" class=\"app-general-slider-wrap left\" style=\"top: 6px;\">" +
"<div id=\"app-fadein-level-knob\" class=\"app-general-slider-knob\"></div>" +
"<div id=\"app-fadein-level-bg\" class=\"app-general-slider-bg\"></div>" +
"</div>" +
"<div class=\"normal-fade-value\"\" id=\"app-fadein-level-value\"></div>" +
"<br class=\"clear\" />" +
"</div>" +
"<div class=\"fade-inputs-container\">" +
"<div class=\"normal-fade-label\">Time</div>" +
"<div id=\"app-fadein-time-slider\" class=\"app-general-slider-wrap left\" style=\"top: 6px;\">" +
"<div id=\"app-fadein-time-knob\" class=\"app-general-slider-knob\"></div>" +
"<div id=\"app-fadein-time-bg\" class=\"app-general-slider-bg\"></div>" +
"</div>" +
"<div class=\"normal-fade-value\" id=\"app-fadein-time-value\"></div>" +
"<br class=\"clear\" />" +
"</div>" +
"<div class=\"fade-inputs-container\">" +
"<div class=\"fade-curve-label\">Curve</div>" +
"<select class=\"fade-curve-select\" id=\"app-fadein-curve\">" +
"<option value=\"linear\">Linear</option>" +
"<option value=\"sCurve\">S-Curve</option>" +
"<option value=\"cubicFromStart\">Cubic</option>" +
"<option value=\"exponentialFromStart\">Exponential start</option>" +
"<option value=\"exponentialToEnd\">Exponential end</option>" +
"</select>" +
"<br class=\"clear\" />" +
"</div>" +
"</div>" +
"</div>" +
"<div class=\"left\">" +
"<div style=\"margin-bottom: 10px;\">" +
"<input type=\"checkbox\" id=\"app-fadeout-enable\">" +
"<label for=\"app-fadeout-enable\">Enable fade out</label>" +
"<div class=\"fade-indicator\" id=\"fadeout-color\"></div>" +
"</div>" +
"<div id=\"app-fadeout-section\">" +
"<div class=\"fade-inputs-container\">" +
"<div class=\"normal-fade-label\">Level</div>" +
"<div id=\"app-fadeout-level-slider\" class=\"app-general-slider-wrap left\" style=\"top: 6px;\">" +
"<div id=\"app-fadeout-level-knob\" class=\"app-general-slider-knob\"></div>" +
"<div id=\"app-fadeout-level-bg\" class=\"app-general-slider-bg\"></div>" +
"</div>" +
"<div class=\"normal-fade-value\" id=\"app-fadeout-level-value\"></div>" +
"<br class=\"clear\" />" +
"</div>" +
"<div class=\"fade-inputs-container\">" +
"<div class=\"normal-fade-label\">Time</div>" +
"<div id=\"app-fadeout-time-slider\" class=\"app-general-slider-wrap left\" style=\"top: 6px;\">" +
"<div id=\"app-fadeout-time-knob\" class=\"app-general-slider-knob\"></div>" +
"<div id=\"app-fadeout-time-bg\" class=\"app-general-slider-bg\"></div>" +
"</div>" +
"<div class=\"normal-fade-value\" id=\"app-fadeout-time-value\"></div>" +
"<br class=\"clear\" />" +
"</div>" +
"<div class=\"fade-inputs-container\">" +
"<div class=\"fade-curve-label\">Curve</div>" +
"<select class=\"fade-curve-select\" id=\"app-fadeout-curve\">" +
"<option value=\"linear\">Linear</option>" +
"<option value=\"sCurve\">S-Curve</option>" +
"<option value=\"cubicFromStart\">Cubic</option>" +
"<option value=\"exponentialFromStart\">Exponential start</option>" +
"<option value=\"exponentialToEnd\">Exponential end</option>" +
"</select>" +
"<br class=\"clear\" />" +
"</div>" +
"</div>" +
"</div>" +
"<div class=\"clear\"></div>" +
"<div class=\"app-presets-container\">" +
"<div style=\"margin-bottom:8px;\">Presets:</div>" +
"<select id=\"app-fade-presets\" class=\"fade-curve-select\">" +
presetHTMLStr +
"</select>" +
"</div>" +
"<canvas width=\"380\" height=\"230\" id=\"app-crossfade-canvas\"></canvas>" +
"<div class=\"app-fade-solution\">" +
"<div id=\"accept-fade\" class=\"app-popup-button\" style=\"float: left;\">OK</div>" +
"<div id=\"deny-fade\" class=\"app-popup-button\" style=\"float: left;\">Cancel</div>" +
"</div>";
};



crossfading.openFadeEditor = function (){
var canv, opts, key,
	holdOutTime, holdInTime, presetName, loadingPreset = false;

	
popup.open( crossfading.getHTML(), 530, 435 );

presetName = storage.get( "crossFadePreset" ) || "Default";
opts = crossfading.loadPreset( presetName );

holdOutTime = opts._crossFadeOutTime.valueOf();
holdInTime = opts._crossFadeInTime.valueOf();
crossfading.applyPresetUIValues( opts, presetName );

	if( !features.canvas ) {
	canv = new CrossfadeCanvas( "app-crossfade-canvas", opts );
	canv.draw();
	}else {
	canv = {setValue: jQuery.noop, draw: jQuery.noop};
	}
	
var sliders = {
	"app-fadeout-time": {
		slider: new Slider( "app-fadeout-time-slider" ),
		type: "time",
		holderKey: "_crossFadeOutTime"
	},
	"app-fadeout-level": {
		slider: new Slider( "app-fadeout-level-slider" ),
		type: "level",
		holderKey: "_crossFadeOutLevel"
	},
	"app-fadein-time": {
		slider: new Slider( "app-fadein-time-slider" ),
		type: "time",
		holderKey: "_crossFadeInTime"
	},
	"app-fadein-level": {
		slider: new Slider( "app-fadein-level-slider" ),
		type: "level",
		holderKey: "_crossFadeInLevel"
	}
};

	for( key in sliders ) {
	var value = sliders[key], knob, bg, indicator, type = value.type;
	
	knob = document.getElementById( key + "-knob" );
	bg = document.getElementById( key + "-bg" );
	indicator = document.getElementById( key + "-value" );
		
		value.slider.onslide = (function( bg, knob, indicator, value, type ){ 
		
			return function( p ){
			var hKey = value.holderKey;
				if( hKey.indexOf( "Out" ) > -1 ) {
					if( !opts._crossFadeOutEnabled ) {
					return false;
					}
				} else {
					if( !opts._crossFadeInEnabled ) {
					return false;
					}
				}

				if( type == "time" ) {
				indicator.innerHTML = ( p * 20 ).toPrecision(2) + "s";
				}
				else {
				indicator.innerHTML = ( ( p * 100 ) >> 0 ) + "%";
				}
		
			bg.style.width = ( p * 100 ) + "%";
			knob.style.left =  ( p * 105 - 5 ) + "px";
			opts[hKey] = crossfading.onslide.call( this, p, type, hKey, canv );
			};
		
		})( bg, knob, indicator, value, type);
	
	}
	
	jQuery( "#app-fadeout-curve" ).add( "#app-fadein-curve" ).bind( "change",
		function( e ) {
			if( loadingPreset ) {
			return true;
			}
		var curve = this.value;
			if( curve in crossfading.curves ) {
				if( this.id.indexOf( "out" ) > -1 ) {
				canv.setValue( "_crossFadeOutCurve", curve );
				opts["_crossFadeOutCurve"] = curve;
				} else {
				canv.setValue( "_crossFadeInCurve", curve );
				opts["_crossFadeInCurve"] = curve;
				}
			crossfading.setPresetToCustom();
			canv.draw();
			}
			
		}
	);
	jQuery( "#app-fadeout-enable" ).add( "#app-fadein-enable" ).bind( "change",
		function( e ) {
			if( loadingPreset ) {
			return true;
			}
		var bool = !!this.checked,
			value = bool ? "removeClass" : "addClass";
			
			if( this.id.indexOf( "out" ) > -1 ) {
			jQuery( "#app-fadeout-section" )[value]( "app-section-disabled" );
			canv.setValue( "_crossFadeOutEnabled", bool );
			opts["_crossFadeOutEnabled"] = bool;
			
				if( !bool ) {
				holdOutTime = opts._crossFadeOutTime;
				$( "#app-fadeout-curve")[0].setAttribute("disabled", "disabled" );
				canv.setValue( "_crossFadeOutTime", 0 );
				opts["_crossFadeOutTime"] = 0;
				}
				else {
				$( "#app-fadeout-curve")[0].removeAttribute( "disabled" );
				canv.setValue( "_crossFadeOutTime", holdOutTime );
				opts["_crossFadeOutTime"] = holdOutTime;			
				}
			
			}
			else {
			jQuery( "#app-fadein-section" )[value]( "app-section-disabled" );
			canv.setValue( "_crossFadeInEnabled", bool );
			opts["_crossFadeInEnabled"] = bool;
			
				if( !bool ) {
				$( "#app-fadein-curve")[0].setAttribute("disabled", "disabled" );
				holdInTime = opts._crossFadeInTime;
				canv.setValue( "_crossFadeInTime", 0 );
				opts["_crossFadeInTime"] = 0;
				}
				else {
			
				$( "#app-fadein-curve")[0].removeAttribute( "disabled" );
				canv.setValue( "_crossFadeInTime", holdInTime );
				opts["_crossFadeInTime"] = holdInTime;			
				}
			
			}
		crossfading.setPresetToCustom();
		canv.draw();
		}
	);
	
	jQuery( "#app-fade-presets" ).bind( "change",
		function(e){
		var presetName, key;
			if( this.value == "Custom" ) {
			return true;
			}
		presetName = this.value;
		loadingPreset = true;
		opts = crossfading.loadPreset( presetName );
		crossfading.applyPresetUIValues( opts, presetName );
		
			for( key in opts ) {
			canv.setValue( key, opts[key] );
			}
			
		canv.draw();
		loadingPreset = false;
		}
	);
	
	jQuery( "#accept-fade").click( 
		function(e){
		var name = document.getElementById( "app-fade-presets" ).value;
			if( name !== "Custom" ) {
			storage.set( "crossFadePreset", name );
			}
			else {
			storage.set( "crossFadePreset", opts );
			}
			
		window.player.main.importCrossFade( opts );
		popup.close( this );
		}
	);
	
	jQuery( "#deny-fade").click(
		function(e){
		popup.close( this );
		}
	);
};

jQuery( ".menul-crossfade").click( crossfading.openFadeEditor );




