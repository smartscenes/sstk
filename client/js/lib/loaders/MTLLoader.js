var Materials = require('materials/Materials');

/**
 * Modified version of THREE.MTLLoader from three.js
 * Loads a Wavefront .mtl file specifying materials
 *
 * @author angelxuanchang
 * @license MIT License <http://www.opensource.org/licenses/mit-license.php>
 * @constructor
 * @memberOf loaders
 */
THREE.MTLLoader = function( manager ) {

	this.manager = ( manager !== undefined ) ? manager : THREE.DefaultLoadingManager;

};

Object.assign( THREE.MTLLoader.prototype, THREE.EventDispatcher.prototype, {

	load: function ( url, onLoad, onProgress, onError ) {

		var scope = this;

		var loader = new THREE.FileLoader( this.manager );
		//loader.setCrossOrigin( this.crossOrigin );
		loader.load( url, function ( text ) {

			onLoad( scope.parse( text ) );

		}, onProgress, onError );

	},

	setBaseUrl: function( value ) {

		this.baseUrl = value;

	},

	setCrossOrigin: function ( value ) {

		this.crossOrigin = value;

	},

	setMaterialOptions: function ( value ) {

		this.materialOptions = value;

	},

	/**
	 * Parses loaded MTL file
	 * @param text - Content of MTL file
	 * @return {THREE.MTLLoader.MaterialCreator}
	 * @private
	 */
	parse: function ( text ) {

		var lines = text.split( "\n" );
		var info = {};
		var delimiter_pattern = /\s+/;
		var materialInfos = [];

		for ( var i = 0; i < lines.length; i ++ ) {

			var line = lines[ i ];
			line = line.trim();

			if ( line.length === 0 || line.charAt( 0 ) === '#' ) {

				// Blank line or comment ignore
				continue;

			}

			var pos = line.indexOf( ' ' );

			var key = ( pos >= 0 ) ? line.substring( 0, pos ) : line;
			key = key.toLowerCase();

			var value = ( pos >= 0 ) ? line.substring( pos + 1 ) : "";
			value = value.trim();

			if ( key === "newmtl" ) {

				// New material

				info = { name: value, index: materialInfos.length };
				materialInfos.push(info);

			} else if ( info ) {

				if ( key === "ka" || key === "kd" || key === "ks" ) {

					var ss = value.split( delimiter_pattern, 3 );
					info[ key ] = [ parseFloat( ss[ 0 ] ), parseFloat( ss[ 1 ] ), parseFloat( ss[ 2 ] ) ];

				} else {

					info[ key ] = value;

				}

			}

		}

		var materialCreator = new THREE.MTLLoader.MaterialCreator( this.baseUrl, this.materialOptions );
		materialCreator.setCrossOrigin( this.crossOrigin );
		materialCreator.setManager( this.manager );
		materialCreator.setMaterials( materialInfos );
		return materialCreator;

	}

} );

/**
 * Create a new THREE-MTLLoader.MaterialCreator
 * @param baseUrl - Url relative to which textures are loaded
 * @param options - Set of options on how to construct the materials
 *                  side: Which side to apply the material
 *                        THREE.FrontSide (default), THREE.BackSide, THREE.DoubleSide
 *                  wrap: What type of wrapping to apply for textures
 *                        THREE.RepeatWrapping (default), THREE.ClampToEdgeWrapping, THREE.MirroredRepeatWrapping
 *                  normalizeRGB: RGBs need to be normalized to 0-1 from 0-255
 *                                Default: false, assumed to be already normalized
 *                  ignoreZeroRGBs: Ignore values of RGBs (Ka,Kd,Ks) that are all 0's
 *                                  Default: false
 *                  invertTransparency: If transparency need to be inverted (inversion is needed if d = 0 is fully opaque)
 *                                      Default: false (d = 1 is fully opaque)
 *                  useRelativeTexturePath: If true ignores materialBase and resolves texture path relative to MTL file
 * @constructor
 */

THREE.MTLLoader.MaterialCreator = function( baseUrl, options ) {

	this.baseUrl = baseUrl;
	this.options = options;
	this.materialsInfo = {}; // Material Infos keyed by name
	this.materialInfosArray = []; // Array of material infos
	this.materials = {};
	this.materialsArray = [];
	this.nameLookup = {};
	this.defaultMaterialType = options.defaultMaterialType || THREE.MeshPhongMaterial; // AXC: Set default material
	//console.log('got defaultMaterialType', this.defaultMaterialType);

	this.side = ( this.options && this.options.side ) ? this.options.side : THREE.FrontSide;
	this.wrap = ( this.options && this.options.wrap ) ? this.options.wrap : THREE.RepeatWrapping;

	// AXC: Allow for different url for textures than baseUrl
	this.textureUrl = baseUrl;
	if (options && options.materialBase && !options.useRelativeTexturePath) {
		this.textureUrl = options.materialBase;
	}
	if (this.textureUrl && this.textureUrl.charAt(this.textureUrl.length-1) != '/') {
		this.textureUrl = this.textureUrl + "/";
	}
};

THREE.MTLLoader.MaterialCreator.prototype = {

	constructor: THREE.MTLLoader.MaterialCreator,

	setCrossOrigin: function ( value ) {

		this.crossOrigin = value;

	},

	setManager: function ( value ) {

		this.manager = value;

	},

	setMaterials: function( materialInfos ) {
		if (Array.isArray(materialInfos)) {
      this.materialInfosArray = this.convert(materialInfos);
      this.materialsInfo = {};
      this.nameLookup = {};
      for (var i = 0; i < this.materialInfosArray.length; i++) {
        var m = this.materialInfosArray[i];
        this.materialsInfo[m.name] = m;
        this.nameLookup[m.name] = i;
      }
    } else {
      this.materialInfosArray = [];
      this.materialsInfo = this.convert(materialInfos);
      this.nameLookup = {};
      for (var k in this.materialsInfo) {
      	if (this.materialsInfo.hasOwnProperty(k)) {
          var m = this.materialsInfo[k];
          this.nameLookup[m.name] = this.materialInfosArray.length;
          this.materialInfosArray.push(m);
        }
      }
		}
		this.materials = {};
		this.materialsArray = null;

	},

	convert: function( materialsInfo ) {

		if ( ! this.options ) return materialsInfo;

		var converted = Array.isArray(materialsInfo)? [] : {};

		var hasKd = false; // AXC: for defaultColor
		for ( var mn in materialsInfo ) {
			if (!materialsInfo.hasOwnProperty(mn)) continue; // skip

			// Convert materials info into normalized form based on options

			var mat = materialsInfo[ mn ];

			var covmat = {};

			converted[ mn ] = covmat;

			for ( var prop in mat ) {

				var save = true;
				var value = mat[ prop ];
				var lprop = prop.toLowerCase();

				switch ( lprop ) {

					case 'kd':
						hasKd = true; // AXC: for defaultColor
					case 'ka':
					case 'ks':

						// Diffuse color (color under white light) using RGB values

						if ( this.options && this.options.normalizeRGB ) {

							value = [ value[ 0 ] / 255, value[ 1 ] / 255, value[ 2 ] / 255 ];

						}

						if ( this.options && this.options.ignoreZeroRGBs ) {

							if ( value[ 0 ] === 0 && value[ 1 ] === 0 && value[ 1 ] === 0 ) {

								// ignore

								save = false;

							}

						}

						break;

					case 'd':

						// According to MTL format (http://paulbourke.net/dataformats/mtl/):
						//   d is dissolve for current material
						//   factor of 1.0 is fully opaque, a factor of 0 is fully dissolved (completely transparent)

						if ( this.options && this.options.invertTransparency ) {

							value = 1 - value;

						}

						break;

					default:

						break;
				}

				if ( save ) {

					covmat[ lprop ] = value;

				}

			}

			// AXC: Handle options.defaultColor
			// Set if we haven't set any material/color but saw a kd that was ignored...
			// Needed for wss models that have kd set to 0 but actually has a material...
			if (this.options && this.options.defaultColor ) {
				var hasColorOrMaterial = covmat['map_kd'] || covmat['kd'];
				if (!hasColorOrMaterial && hasKd) {
					covmat['kd'] = this.options.defaultColor;
				}
			}
		}

		return converted;

	},

	preload: function () {

		for ( var mn in this.materialsInfo ) {

			this.create( mn );

		}

	},

	getIndex: function( materialName ) {

		return this.nameLookup[ materialName ];

	},

	getAsArray: function() {

		if  (!this.materialsArray) {
			var scope = this;
			this.materialsArray = this.materialInfosArray.map( function(m) {
				return scope.create(m);
			});
		}

		return this.materialsArray;

	},

	create: function ( materialName ) {

		if ( this.materials[ materialName ] === undefined ) {

			this.createMaterial_( materialName );

		}

		return this.materials[ materialName ];

	},

	createMaterial_: function ( materialName ) {

		// Create material

		var mat = this.materialsInfo[ materialName ];
		var params = {

			name: materialName,
			side: this.side

		};

		for ( var prop in mat ) {

			var value = mat[ prop ];

			switch ( prop.toLowerCase() ) {

				// Ns is material specular exponent

				case 'kd':

					// Diffuse color (color under white light) using RGB values

					params[ 'diffuse' ] = new THREE.Color().fromArray( value );

					break;

				case 'ka':

					// Ambient color (color under shadow) using RGB values

					break;

				case 'ks':

					// Specular color (color when light is reflected from shiny surface) using RGB values
					params[ 'specular' ] = new THREE.Color().fromArray( value );

					break;

				case 'map_kd':

					// Diffuse texture map
					// AXC: Allow for different url for textures than baseUrl
					params[ 'map' ] = this.loadTexture( this.textureUrl + value );
					params[ 'map' ].wrapS = this.wrap;
					params[ 'map' ].wrapT = this.wrap;

					break;

				case 'ns':

					// The specular exponent (defines the focus of the specular highlight)
					// A high exponent results in a tight, concentrated highlight. Ns values normally range from 0 to 1000.

					params[ 'shininess' ] = value;

					break;

				case 'd':

					// According to MTL format (http://paulbourke.net/dataformats/mtl/):
					//   d is dissolve for current material
					//   factor of 1.0 is fully opaque, a factor of 0 is fully dissolved (completely transparent)

					if ( value < 1 ) {

						params[ 'transparent' ] = true;
						params[ 'opacity' ] = value;

					}

					break;

				case 'map_bump':
				case 'bump':

					// Bump texture map

					if ( params[ 'bumpMap' ] ) break; // Avoid loading twice.
                                        // AXC: Allow for different url for textures than baseUrl
					params[ 'bumpMap' ] = this.loadTexture( this.textureUrl + value );
					params[ 'bumpMap' ].wrapS = this.wrap;
					params[ 'bumpMap' ].wrapT = this.wrap;

					break;

				default:
					break;

			}

		}

		if ( params[ 'diffuse' ] ) {

			params[ 'color' ] = params[ 'diffuse' ];

		}

		delete params.ambient;  // AXC: THREE.js now warns about extra params, ambient is no longer supported
		delete params.diffuse;  // AXC: THREE.js now warns about extra params, diffuse is mapped to color

		params = Materials.updateMaterialParams(this.defaultMaterialType, params);
		// AXC: Use defaultMaterial
		this.materials[ materialName ] = new this.defaultMaterialType( params );
		if (mat) {  // AXC: Add index
			this.materials[materialName].index = mat.index;
		}
		return this.materials[ materialName ];

	},


	loadTexture: function ( url, mapping, onLoad, onProgress, onError ) {
		//console.log('loadTexture',this.options);
		// AXC: custom loadTexture
		if (this.options.loadTexture) {
			return this.options.loadTexture(url,mapping,onLoad,onProgress,onError);
		}
		return Materials.loadTexture({ url: url, mapping: mapping,
			onLoad: onLoad, onProgress: onProgress, onError: onError,
			manager: this.manager, crossOrigin: this.crossOrigin,
			isDataTexture: this.options.isDataTexture });
	}

};
