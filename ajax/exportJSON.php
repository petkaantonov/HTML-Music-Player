<?php


define( "PATH_TO_FILE", "../json/" );
define( "CHMOD_VALUE", 511 );
header( "Content-Type: application/json; charset=utf-8" );

	if( 	!isset( $_POST['filename'] )	||
		empty( $_POST['filename'] )	||
		!isset( $_POST['data'] )	||
		empty( $_POST['data'] ) ) {
	exit( json_encode( array( "error" => "No input" ) ) );		
	}

require( "../includes/function_rel2abs.php" );
require( "../includes/class_JsonSchema.php" );
require( "schema.php" );

Dbg::$quietMode = true;

$fname = preg_replace( '/[\/:*?"<>|\s]/', "", $_POST['filename'] );

$filename = basename( $fname . "_".time().".json" );
$data = $_POST['data'];
$json = json_decode( $data );

	if( !$json ) {
	exit( json_encode( array( "error" => "Could not parse JSON" ) ) );
	}
	
$result = JsonSchema::validate( $json, $schema );


	if( $result -> valid != 1 ) {
	exit(
		json_encode(
			array(
				"error" => 
					json_encode(
						array_map(
						"utf8_encode", $result -> errors
						)
					)
			)
		)
	);
	
	}

$data = '{"'.substr( $filename, 0, strlen( $filename ) - 5 ) .'":'.$data.'}';
$path = PATH_TO_FILE . $filename;
$success = @file_put_contents( $path, $data );
	if( !$success ) {
	exit( json_encode( array( "error" => "Could not create file" ) ) );
	}
	
@chmod( $path, CHMOD_VALUE );


echo json_encode( array ( "error" => false, "url" => rel2abs( $path ) ) );
?>