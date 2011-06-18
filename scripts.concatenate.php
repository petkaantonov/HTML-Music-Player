<pre>
<?php
require("scripts.dev.php");
require("includes/class_PhpClosure.php");
$scriptName;
$readHandle;
$failures = array();
$outputScript = "js/compiled-min.js";

$closureCompiler = new PhpClosure();

$closureCompiler ->
	simpleMode() ->
	verbose() ->
	setOutputFile( $outputScript );


	foreach( $scripts as $script ) {
	
	preg_match( '/src="([^"]+)"/i', $script, $scriptName );
	
		if( $scriptName[1] && strlen( $scriptName[1] ) ) {
		$closureCompiler -> add( $scriptName[1] );
		echo "Concatenating {$scriptName[1]}...\n";
		}
		else {
		array_push( $failures, $script );
		}
	}
	
$success = $closureCompiler -> write();

	
	if( $success ) {
	echo "Concatenated to <a href=\"{$outputScript}\">{$outputScript}</a>\n\n";
	}
	else {
	echo "Failed to concatenate\n";
	}
	

	if( count( $failures ) > 0 ) {
	echo "Script concatenation failed for:\n";
		foreach( $failures as $key => $failure ) {
		echo $key + 1 . ". {$failure}\n";
		}
	}
	
	

?>
</pre>