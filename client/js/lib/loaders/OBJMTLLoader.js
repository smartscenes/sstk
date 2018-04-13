/**
 * Modified version of THREE.OBJMTLLoader from three.js
 * Loads a Wavefront .obj file with materials
 *
 * @author mrdoob / http://mrdoob.com/
 * @author angelxuanchang
 * @license MIT License <http://www.opensource.org/licenses/mit-license.php>
 * @constructor
 * @memberOf loaders
 */

THREE.OBJMTLLoader = function ( manager ) {

	this.manager = ( manager !== undefined ) ? manager : THREE.DefaultLoadingManager;

};

Object.assign( THREE.OBJMTLLoader.prototype, THREE.EventDispatcher.prototype, {

	/**
	 * Load a Wavefront OBJ file with materials (MTL file)
	 *
	 * If the MTL file cannot be loaded, then a MeshLambertMaterial is used as a default
	 * @param url - Location of OBJ file to load
	 * @param mtlurl - MTL file to load (optional, if not specified, attempts to use MTL specified in OBJ file)
	 * @param options - Options on how to interpret the material (see THREE.MTLLoader.MaterialCreator )
	 * @private
	 */
	load: function ( url, mtlurl, options, onLoad, onProgress, onError ) {

		var scope = this;

		var mtlLoader = new THREE.MTLLoader( this.manager );
		mtlLoader.setBaseUrl( url.substr( 0, url.lastIndexOf( "/" ) + 1 ) );
		mtlLoader.setCrossOrigin( this.crossOrigin );
    // AXC: Set material options
    mtlLoader.setMaterialOptions( options );

		// AXC: Redo load so relative MTL references from OBJ file are okay
		function applyMaterials(object, materialsCreator) {
			object.traverse(function (object) {
				if (object instanceof THREE.Mesh) {
					if (object.material.name) {
						var material = materialsCreator.create(object.material.name);
						if (material) object.material = material;
					}
				}
			});
		}

		function loadObj(materialsCreator) {
			var loader = new THREE.FileLoader( scope.manager );
			//loader.setCrossOrigin( scope.crossOrigin );
			loader.load( url, function ( text ) {
				var object = scope.parse(text, undefined, options);
				applyMaterials(object, materialsCreator);
				onLoad( object );
			}, onProgress, onError );
		}

			function loadObjWithMTLCallback() {
				var hasMtl = false;
				var object = null;
				var materialsCreator = null;
				function mtllibCallback(mtlfile) {
					hasMtl = true;
					mtlLoader.load(mtlLoader.baseUrl + mtlfile, function (materials) {
						var mc = materials;
						mc.preload();
						if (object) {
							applyMaterials(object, mc);
							onLoad(object);
						}
						materialsCreator = mc;
					}, onProgress, onError);
				}
				var loader = new THREE.FileLoader(scope.manager);
				//loader.setCrossOrigin(scope.crossOrigin);
				loader.load(url, function (text) {
					object = scope.parse(text, mtllibCallback, options);
					if (hasMtl) {
						if (materialsCreator) {
							applyMaterials(object, materialsCreator);
							onLoad(object);
						}
					} else {
						onLoad(object);
					}
				}, onProgress, onError);
			}

			if (mtlurl) {
				mtlLoader.load(mtlurl, function (materials) {
					var materialsCreator = materials;
					materialsCreator.preload();
					loadObj(materialsCreator);
				}, onProgress, onError);
			} else {
				loadObjWithMTLCallback();
			}

	},

	setCrossOrigin: function ( value ) {

		this.crossOrigin = value;

	},

	/**
	 * Parses loaded .obj file
	 * @param data - content of .obj file
	 * @param mtllibCallback - callback to handle mtllib declaration (optional)
	 * @return {THREE.Object3D} - Object3D (with default material)
	 * @private
	 */

	parse: function ( data, mtllibCallback, options) {

		//console.log('options', options);
        function color( r, g, b ) {
            // NOTE: The THREE.Color constructor is buggy
            var c = new THREE.Color();
            c.setRGB( parseFloat( r ), parseFloat( g ), parseFloat( b ) );
            return c;
        }

		function vector( x, y, z ) {

			return new THREE.Vector3( x, y, z );

		}

		function uv( u, v ) {

			return new THREE.Vector2( isFinite(u) ? u : 0, isFinite(v) ? v : 0 );

		}

		function face3( a, b, c, normals ) {

			return new THREE.Face3( a, b, c, normals );

		}

		var face_offset = 0;

		function meshN( meshName, materialName ) {

			if ( vertices.length > 0 && geometry.faces.length > 0 ) {

				geometry.vertices = vertices;
                                geometry.colors = colors;

				geometry.mergeVertices();
				if (options.computeNormals) {
					geometry.computeVertexNormals();
				}
				geometry.computeFaceNormals();
				geometry.computeBoundingSphere();

                if (options.useBuffers) {
                    var bufferGeom = new THREE.BufferGeometry();
                    bufferGeom.fromGeometry(geometry);
                    mesh.geometry = bufferGeom;
                }

				object.add( mesh );

				geometry = new THREE.Geometry();
				if (options.smooth) {
					material.shading = THREE.SmoothShading;
				}
				mesh = new THREE.Mesh( geometry, material );
                meshCount++;
			}

			if ( meshName !== undefined ) mesh.name = meshName;
            else if (mesh.name === undefined) {
                mesh.name = 'mesh' + meshCount;
            }
            mesh.userData = {
                index: meshCount
            };

			if ( materialName !== undefined ) {

				material = new THREE.MeshLambertMaterial();
				material.name = materialName;

				mesh.material = material;

			}

		}

		var group = new THREE.Group();
		var object = group;

		var geometry = new THREE.Geometry();
		var material = new THREE.MeshLambertMaterial();
		var mesh = new THREE.Mesh( geometry, material );
        var meshCount = 0;

		var vertices = [];
		var normals = [];
		var uvs = [];
    var colors = [];

		function add_face( a, b, c, normals_inds ) {

			if ( normals_inds === undefined ) {

				geometry.faces.push( face3(
					parseInt( a ) - ( face_offset + 1 ),
					parseInt( b ) - ( face_offset + 1 ),
					parseInt( c ) - ( face_offset + 1 )
				) );

			} else {

				geometry.faces.push( face3(
					parseInt( a ) - ( face_offset + 1 ),
					parseInt( b ) - ( face_offset + 1 ),
					parseInt( c ) - ( face_offset + 1 ),
					[
						normals[ parseInt( normals_inds[ 0 ] ) - 1 ].clone(),
						normals[ parseInt( normals_inds[ 1 ] ) - 1 ].clone(),
						normals[ parseInt( normals_inds[ 2 ] ) - 1 ].clone()
					]
				) );

			}

			if (colors.length > 0) {
				var face = geometry.faces[geometry.faces.length - 1];
				var indices = [face.a, face.b, face.c];
				for (var j = 0; j < 3; j++) {
					var vertexIndex = indices[j];
					face.vertexColors[j] = colors[vertexIndex];
				}
			}
		}

		function add_uvs( a, b, c ) {

			var zero = new THREE.Vector2(0, 0);
			var uva = uvs[ parseInt( a ) - 1 ] || zero;
			var uvb = uvs[ parseInt( b ) - 1 ] || zero;
			var uvc = uvs[ parseInt( c ) - 1 ] || zero;
			geometry.faceVertexUvs[ 0 ].push( [
				uva.clone(),
				uvb.clone(),
				uvc.clone()
			] );

		}

		function handle_face_line( faces, uvs, normals_inds ) {

			if ( faces[ 3 ] === undefined ) {

				add_face( faces[ 0 ], faces[ 1 ], faces[ 2 ], normals_inds );

				if ( ! ( uvs === undefined ) && uvs.length > 3 ) {

					add_uvs( uvs[ 0 ], uvs[ 1 ], uvs[ 2 ] );

				}

			} else {

				if ( ! ( normals_inds === undefined ) && normals_inds.length > 0 ) {

					add_face( faces[ 0 ], faces[ 1 ], faces[ 3 ], [ normals_inds[ 0 ], normals_inds[ 1 ], normals_inds[ 3 ] ] );
					add_face( faces[ 1 ], faces[ 2 ], faces[ 3 ], [ normals_inds[ 1 ], normals_inds[ 2 ], normals_inds[ 3 ] ] );

				} else {

					add_face( faces[ 0 ], faces[ 1 ], faces[ 3 ] );
					add_face( faces[ 1 ], faces[ 2 ], faces[ 3 ] );

				}

				if ( ! ( uvs === undefined ) && uvs.length > 0 ) {

					add_uvs( uvs[ 0 ], uvs[ 1 ], uvs[ 3 ] );
					add_uvs( uvs[ 1 ], uvs[ 2 ], uvs[ 3 ] );

				}

			}

		}


		// v float float float

		var vertex_pattern = /v( +[\d|\.|\+|\-|e]+)( +[\d|\.|\+|\-|e]+)( +[\d|\.|\+|\-|e]+)/;

		// v float float float float float float

		var vertex_color_pattern = /v( +[\d|\.|\+|\-|e]+)( +[\d|\.|\+|\-|e]+)( +[\d|\.|\+|\-|e]+)( +[\d|\.|\+|\-|e]+)( +[\d|\.|\+|\-|e]+)( +[\d|\.|\+|\-|e]+)/;

		// vn float float float

		var normal_pattern = /vn( +[\d|\.|\+|\-|e]+)( +[\d|\.|\+|\-|e]+)( +[\d|\.|\+|\-|e]+)/;

		// vt float float

		var uv_pattern = /vt( +[\d|\.|\+|\-|e]+| NaN)( +[\d|\.|\+|\-|e]+)| NaN/;

		// f vertex vertex vertex ...

		var face_pattern1 = /f( +\d+)( +\d+)( +\d+)( +\d+)?/;

		// f vertex/uv vertex/uv vertex/uv ...

		var face_pattern2 = /f( +(\d+)\/(\d+))( +(\d+)\/(\d+))( +(\d+)\/(\d+))( +(\d+)\/(\d+))?/;

		// f vertex/uv/normal vertex/uv/normal vertex/uv/normal ...

		var face_pattern3 = /f( +(\d+)\/(\d+)\/(\d+))( +(\d+)\/(\d+)\/(\d+))( +(\d+)\/(\d+)\/(\d+))( +(\d+)\/(\d+)\/(\d+))?/;

		// f vertex//normal vertex//normal vertex//normal ...

		var face_pattern4 = /f( +(\d+)\/\/(\d+))( +(\d+)\/\/(\d+))( +(\d+)\/\/(\d+))( +(\d+)\/\/(\d+))?/;

		// AXC: Warn lines not handled just once
		// l vertex vertex ... (not currently handled)
		var line_pattern1 = /l( +\d+)( +\d+)/;

		var line_pattern2 = /l( +(\d+)\/(\d+))( +(\d+)\/(\d+))/;

		var line_warning_emitted = false;
		//

		var lines = data.split( "\n" );

		for ( var i = 0; i < lines.length; i ++ ) {

			var line = lines[ i ];
			line = line.trim();
			line = line.toLowerCase();

			// AXC: handle QNANs
			var newline = line.replace("1.#qnan", "0");
			if (newline !== line) {
				console.log("THREE.OBJMTLLoader: NAN encountered: " + line);
				line = newline;
			}

			var result;

			if ( line.length === 0 || line.charAt( 0 ) === '#' ) {

				continue;

			} else if (( result = vertex_color_pattern.exec(line) ) !== null) {
				vertices.push(
					vector(
						parseFloat(result[1]), parseFloat(result[2]), parseFloat(result[3])
					)
				);

				colors.push(
					color(
						result[4], result[5], result[6]
					)
				);
			} else if ( ( result = vertex_pattern.exec( line ) ) !== null ) {

				// ["v 1.0 2.0 3.0", "1.0", "2.0", "3.0"]

				vertices.push( vector(
					parseFloat( result[ 1 ] ),
					parseFloat( result[ 2 ] ),
					parseFloat( result[ 3 ] )
				) );

			} else if ( ( result = normal_pattern.exec( line ) ) !== null ) {

				// ["vn 1.0 2.0 3.0", "1.0", "2.0", "3.0"]

				normals.push( vector(
					parseFloat( result[ 1 ] ),
					parseFloat( result[ 2 ] ),
					parseFloat( result[ 3 ] )
				) );

			} else if ( ( result = uv_pattern.exec( line ) ) !== null ) {

				// ["vt 0.1 0.2", "0.1", "0.2"]

				uvs.push( uv(
					parseFloat( result[ 1 ] ),
					parseFloat( result[ 2 ] )
				) );

			} else if ( ( result = face_pattern1.exec( line ) ) !== null ) {

				// ["f 1 2 3", "1", "2", "3", undefined]

				handle_face_line( [ result[ 1 ], result[ 2 ], result[ 3 ], result[ 4 ] ] );

			} else if ( ( result = face_pattern2.exec( line ) ) !== null ) {

				// ["f 1/1 2/2 3/3", " 1/1", "1", "1", " 2/2", "2", "2", " 3/3", "3", "3", undefined, undefined, undefined]

				handle_face_line(
					[ result[ 2 ], result[ 5 ], result[ 8 ], result[ 11 ] ], //faces
					[ result[ 3 ], result[ 6 ], result[ 9 ], result[ 12 ] ] //uv
				);

			} else if ( ( result = face_pattern3.exec( line ) ) !== null ) {

				// ["f 1/1/1 2/2/2 3/3/3", " 1/1/1", "1", "1", "1", " 2/2/2", "2", "2", "2", " 3/3/3", "3", "3", "3", undefined, undefined, undefined, undefined]

				handle_face_line(
					[ result[ 2 ], result[ 6 ], result[ 10 ], result[ 14 ] ], //faces
					[ result[ 3 ], result[ 7 ], result[ 11 ], result[ 15 ] ], //uv
					[ result[ 4 ], result[ 8 ], result[ 12 ], result[ 16 ] ] //normal
				);

			} else if ( ( result = face_pattern4.exec( line ) ) !== null ) {

				// ["f 1//1 2//2 3//3", " 1//1", "1", "1", " 2//2", "2", "2", " 3//3", "3", "3", undefined, undefined, undefined]

				handle_face_line(
					[ result[ 2 ], result[ 5 ], result[ 8 ], result[ 11 ] ], //faces
					[ ], //uv
					[ result[ 3 ], result[ 6 ], result[ 9 ], result[ 12 ] ] //normal
				);

			} else if ( /^o /.test( line ) ) {

				// object

				meshN();
				face_offset = face_offset + vertices.length;
				vertices = [];
        colors = [];
				object = new THREE.Object3D();
				object.name = line.substring( 2 ).trim();
				group.add( object );

			} else if ( /^g /.test( line ) ) {

				// group

				meshN( line.substring( 2 ).trim(), undefined );

			} else if ( /^usemtl /.test( line ) ) {

				// material

				meshN( undefined, line.substring( 7 ).trim() );

			} else if ( /^mtllib /.test( line ) ) {

				// mtl file

				if ( mtllibCallback ) {

					var mtlfile = line.substring( 7 );
					mtlfile = mtlfile.trim();
					mtllibCallback( mtlfile );

				}

			} else if ( /^s /.test( line ) ) {

				// Smooth shading

			} else if ( ( result = line_pattern1.exec( line ) ) !== null ) {
				// AXC: Warn lines not handled just once
				if (!line_warning_emitted) {
					console.log( "THREE.OBJMTLLoader: Support for lines not implemented: " + line );
					line_warning_emitted = true;
				}
			} else if ( ( result = line_pattern2.exec( line ) ) !== null ) {
				// AXC: Warn lines not handled just once
				if (!line_warning_emitted) {
					console.log( "THREE.OBJMTLLoader: Support for lines not implemented: " + line );
					line_warning_emitted = true;
				}
			} else {

				console.log( "THREE.OBJMTLLoader: Unhandled line: " + line );

			}

		}

		//Add last object
		meshN( undefined, undefined );

		return group;

	}

} );
