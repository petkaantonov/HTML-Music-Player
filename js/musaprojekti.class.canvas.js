function CrossfadeCanvas( target, opts ){
opts = opts || {};
this._totalTime = 0;
this._pxPerSecond = 0;
this._target = target;
this._config = jQuery.extend({}, this._defaults, opts );
};

CrossfadeCanvas.Includes({
	_defaults: {
	_crossFadeOutEnabled: true,
	_crossFadeOutTime: 5000,
	_crossFadeOutLevel: 1,
	_crossFadeOutId: 0,
	_crossFadeOutPlayer: "",
	_crossFadeOutType: "",
	_crossFadeOutCurve: "sCurve",
	_crossFadeInTime: 5000,
	_crossFadeInEnabled: true,
	_crossFadeInLevel: 0,
	_crossFadeInId: 0,
	_crossFadeInCurve: "sCurve"
	},
	
	setValue: function( key, value ) {
	
		if( key in this._config ) {
		this._config[key] = value;
		}
	},
	

	_drawFadeOut: function( ctx, width, height ){
	//start left = 55, max left = width - 60, max top = 35, min top = height - 25
	var curveFn = crossfading.curves[ this._config._crossFadeOutCurve],
		time = this._pxPerSecond,
		i, l = width - 60, level = this._config._crossFadeOutLevel,
		start = ( this._totalTime - this._config._crossFadeOutTime ) / 1000 * this._pxPerSecond + 55,
		ticks = 0, maxTicks = l - start;

	
		if( isNaN ( 25 + ( curveFn( ticks, maxTicks ) * level  )  * ( height - 51 ) ) ) {
		return;
		}
		
	ctx.beginPath();
	ctx.lineWidth = 2;
		ctx.moveTo( start, height - 25 );
		ctx.lineTo( start, 25 + ( curveFn( ticks, maxTicks ) * level  )  * ( height - 51) );
		ticks++;
		for( i = start + 1; i <= l; ++i ) {
		ctx.lineTo( i, 25 + ( curveFn( ticks, maxTicks ) * level  )  * ( height - 51 ) );
		ticks++;
		}
	
	
	ctx.strokeStyle = "rgb(0, 100, 0)";
	ctx.stroke();
	ctx.lineTo( l, height - 25 );
	ctx.lineTo( start, height - 25 );
	ctx.lineTo( start, 25 + ( curveFn( 0, maxTicks ) * level  ) * ( height - 51 ) );
	ctx.fillStyle =  "rgba(0, 100, 0, 0.45)";
	ctx.fill();
	ctx.closePath();
	//start left = 55, max left = width - 60, max top = 35, min top = height - 25
	},
	
	_drawFadeIn: function( ctx, width, height ){
	var curveFn = crossfading.curves[ this._config._crossFadeInCurve],
		time = this._pxPerSecond,
		i, l = width - 60, level = this._config._crossFadeInLevel,
		start = ( this._totalTime - this._config._crossFadeInTime ) / 1000 * this._pxPerSecond + 55,
		ticks = 0, maxTicks = l - start;
		
	ctx.beginPath();
	ctx.lineWidth = 2;
	ctx.moveTo( start, height - 25 );
	ctx.lineTo( start, 25 + ( 1 - ( curveFn( ticks, maxTicks ) * ( 1-level ) + level ) )  * ( height - 51 ) );
	ticks++;
		for( i = start + 1; i <= l; ++i ) {
		ctx.lineTo( i, 25 + ( 1 - ( curveFn( ticks, maxTicks ) * ( 1-level ) + level ) )  * ( height - 51 ) );
		ticks++;
		}
	ctx.strokeStyle = "rgb(0, 0, 128)";
	ctx.stroke();
	ctx.lineTo( l, height - 25 );
	ctx.lineTo( start, height - 25 );
	ctx.lineTo( start, 25 + ( 1 - ( curveFn( 0, maxTicks ) * ( 1-level ) + level ) )  * ( height - 51 ) );
	ctx.fillStyle = "rgba(0, 0, 128, 0.45)";
	ctx.fill();
	ctx.closePath();
	//start left = 55, max left = width - 60, max top = 35, min top = height - 25
	},
	
	draw: function(){
	var elm = document.getElementById( this._target ),
		ctx = elm.getContext("2d"),
		width = elm.width,
		height = elm.height, i, l, c = 0, j,
		percentageInterval;
		
	ctx.clearRect( 0, 0, width, height );
	
	this._totalTime = this._config._crossFadeInTime > this._config._crossFadeOutTime ? 
		this._config._crossFadeInTime :
		this._config._crossFadeOutTime;
		
	this._pxPerSecond = ( width - 115 ) / ( ( this._totalTime ) / 1000 );
	
	percentageInterval = ( height - 51 ) / 5;
	
	ctx.font = "11px helvetica";
	ctx.fillStyle = "#444444";
	ctx.fillText( "Relative volume", 0, 15 );
	
		for(i = 35; i <= height - 15; i += percentageInterval ) {
		ctx.fillText( ( (5-c) * 20 ) + " %", 5, i - 6 );
		c++;
		}
	c = 0;
	if( this._totalTime > 10000 ) {
	ctx.font = "9px helvetica";
	}
		
		for( i = 55; i <= width - 60; i+= this._pxPerSecond ) {
		
		ctx.fillText( c + "s", i, height - 15 );
		c++
		}
	ctx.fillText( "Time", width - 30, height - 15 );
	
		if( this._config._crossFadeOutEnabled ) {
		this._drawFadeOut( ctx, width, height );
		}
		
		if( this._config._crossFadeInEnabled ) {
		this._drawFadeIn( ctx, width, height );
		}
	return this;
	}
});