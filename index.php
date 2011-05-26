<?php
header('Content-Type: text/html; charset=iso-8859-1');
include 'tunnukset.php';
?>
<!DOCTYPE HTML>
<html manifest="cachecontrol/cache.manifest">
<head>
<link rel="shortcut icon" href="kivakuva3.png" />
<script type="text/javascript">
document.oncontextmenu = function(){return false;}
</script>
<link rel="stylesheet" href="css/main.css?v=0.34" />
<script type="text/javascript" src="js/libraries.js"></script>
<script type="text/javascript" src="js/adhd-0.9.9982.min.js?v=23"></script>
<meta http-equiv="X-UA-Compatible" content="chrome=1" />
<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1" />
<meta name="description" content="noindex, no follow" />
<meta name="robots" content="noindex, nofollow" />
<title>Theme: Talvinen</title>
</head>
<body>
<script type="text/javascript">	
<?php echo "findmusicphp.newPlaylistSetting(\"ipaddress\" , \"".$_SERVER['REMOTE_ADDR']."\");\n"; ?>
</script>
<script type="text/javascript" src="js/apicalls.js?v=32"></script>
<div id="noscript">
This page requires JavaScript to be enabled, <br />
enable javascript and <a href="">reload</a> the page. 
</div>
<div id="wrapper">
		<div id="maincontainer">
		<div id="barleft">
		
			<div id="dropdowncontainer" class="unselectable"></div>
			
			<div id="playercontainer" class="unselectable">
				<div id="cfadecon" class="crossfadeinact">
				<div id="crossfadetoggle" title="Toggle Crossfading" style="float:left;">crossfade</div>
					<div class="cfadeseconds" title="Crossfade time between tracks in seconds">
						<span id="lesscross">&#x25C0;</span> 
						<span id="crossfadeval"></span> 
						<span id="morecross">&#x25B6;</span>
					</div>
				</div>
				<div id="modescon">
				<div id="repeat" title="Repeat" class="modediv repeatinactive"></div>
				<div id="shuffle" title="Shuffle" class="modediv shuffleinactive"></div>
				<div id="normal" title="Normal" class="modediv normalinactive"></div>
				</div>
				<br class="clear" />
				<br class="clear" />
				<div id="curplaycontainer">
						<span id="curplaytime">00:00</span>
						<span style="font-weight:bold;font-size:13px;margin:0px 1px">/</span>
						<span id="totplaytime">00:00</span>
				</div>
				<div id="songstatuscontainer"><span id="songstatus"></span></div>
				<div id="timerscontainer" style="margin-top:10px;" class="unselectable">
					<div class="showvidact unselectable" id="vidtoggle">Show Video</div>
				</div>
				<div id="seektopointer" class="unselectable"></div>
				<div class="msgcontainer notextflow" id="msgcontainer">
					<div class="playpercentage unselectable" id="playper">
						<div id="seekbar2"></div>
						</div>
					<div id="playlistmessu" class="unselectable"></div>
				</div>
				<div id="playercontrols">
					<div style="float:left;width:115px;">
						<div title="Reset / Previous" class="bwpic blbuttonhov unselectable" id="prevbut"></div>
						<div title="Play / Begin" class="playpic blbuttonhov unselectable" id="playbut"></div>
						<div title="Pause" class="pausepic blbuttonhov unselectable" id="pausebut"></div>
						<div title="Stop" class="stoppic blbuttonhov unselectable" id="stopbut"></div>
						<div title="Skip / Next" class="fwpic blbuttonhov unselectable" id="skipbut"></div>
					</div>
					<div style="float:right;width: 143px; padding-top: 3px;">
						
						<span id="volcontrol"></span><div class="unselectable" id="volumewrap">
							<div id="volumeindex" class="unselectable" style="left: -100%; "></div>
						</div>
						
					</div>
				</div>
				<div id="qualitylistcontainer" class="unselectable"></div>
			</div>
			<div id="playlistcontainer" class="unselectable">
				<div id="searchresultswrapper">
						<div id="searchcontainer">
						<div id="search" class="notextflow"></div>
						<div id="moreinfo">
							<div id="thumbnail"></div>
							<div id="content" class="notextflow"></div>
							<div id="durationwrap">
								<span id="addslideshow"></span>
								<div id="duration">
								</div>
							</div>
						</div>
						<div id="searchresults"></div>
						</div>
				</div>
				<div id="searchwrapper">
					<div id="suggestionswrapper">
						<div id="suggestions"></div>
					</div>
					<div id="searchboxwrapper">
						<input type="text" id="searchbox" autocomplete="off" spellcheck="false" />
						<span id="searchclick"></span>
					</div>
				</div>
				<div class="plbgsize" id="playlist"></div>
			</div>
			<div id="containplayers">
				<div class="disable-youtube-watch"></div>
				<div id="sinatuubi" class="youtubehide"></div>
				<div id="sinatuubires" class="youtubehideres"></div>
				<div id="jplaycon"></div>
				<div id="jplayconres"></div>
				<div id="html5audio"></div>
				<div id="html5audiores"></div>		
			</div>
			
			<div id="bottomcontainer">
				<div id="goback">Back to playlist</div>
				<div id="msgdivbottom">
					<span id="msgspanbottom">Petkaaaa</span>
				</div>
				<div id="useractions">
					<div id="tooltip"></div>
					<div id="searchadd">
						<span class="searchtext" id="srchhover">Search...</span>
					</div>
					<div id="containadds">
						<div id="containfold" class="centered">
							<div id="folderadd"><span class="foldertext">Add a folder...</span></div>
						</div>
						<div id="containinput" class="centered">
							<input webkitdirectory directory type="file" id="file_input" />
						</div>
					</div>
					<div class="clear"></div>
				</div>
			</div>
		</div>
		</div>
</div>
<form id="youtubedl" enctype="application/x-www-form-urlencoded" method="post" action="http://www.listentoyoutube.com/process.php">
<div>
<input type="hidden" name="url" value="" id="urlofyt" />
<input type="hidden" name="quality" value="1" />
</div>
</form>

</body>
</html>