'use strict';

//var BinaryView = require('util/BinaryView');
var zlib = require('pako');
var Grid = require('geo/Grid');
var _ = require('util/util');

/**
 * NRRDLoader
 * @constructor
 * @memberof loaders
 */
var NRRDLoader = function (params) {
  this.GridType = params.GridType || Grid;
};

/**
 * Parses an nrrd file
 * @param filename Name of file (used for debug messages)
 * @param binary {jbinary} jbinary object containing the data of the file
 * @returns {*}
 */
NRRDLoader.prototype.parse = function (filename, binary) {
  // here you can use `binary` instance to parse data
  //console.log(binary);
  //! Read NRRD file
  //! NRRD0005
  //! # STK.NRRDExporter
  //! type: uint32
  //! dimension: 3
  //! sizes: 128 128 128
  //! encoding: raw
  //! endian: little
  //! content: wss.4b3a74dafc46557febd9519cf318fef5_rgba.vox
  //! space: 3D-right-handed
  //! space dimension: 3
  //! space origin: (69.08380126953125,194.42100524902344,0.3859890103340149)
  //! space directions: (0,0.32062655687332153,0) (0,0,0.32062655687332153) (0.32062655687332153,0,0)
  //!
  //! Binary section follows with stored data

  //var voxData = binary.view;
  return this.__parse(filename, binary.view.buffer);
};

// Move to NRRD Loader
NRRDLoader.GridToNRRDTypes = Object.freeze({
  'int8': [ 'int8', 'int8_t', 'signed char'],
  'uint8': [ 'uint8', 'uint8_t' ],
  'uchar': [ 'uchar', 'unsigned char' ],
  'int16': [ 'int16', 'int16_t', 'short', 'short int', 'signed short', 'signed short int' ],
  'uint16': [ 'uint16', 'uint16_t', 'ushort', 'unsigned short', 'unsigned short int' ],
  'int32': [ 'int32', 'int32_t', 'int', 'signed int' ],
  'uint32': [ 'uint32', 'uint32_t', 'uint', 'unsigned int'],
  'int64': [ 'int64', 'int64_t', 'longlong', 'long long', 'long long int', 'signed long long', 'signed long long int' ],
  'uint64': [ 'uint64', 'uint64_t', 'ulonglong', 'unsigned long long', 'unsigned long long int'],
  'float32': ['float32', 'float32_t', 'float'],
  'float64': ['float64', 'float64_t', 'double']
});

NRRDLoader.NRRDToGridDataType = Object.freeze(_.invertMulti(NRRDLoader.GridToNRRDTypes));

NRRDLoader.prototype.load = function ( url, onLoad, onProgress, onError ) {
  var scope = this;
  var loader = new THREE.XHRLoader( scope.manager );
  loader.setResponseType( 'arraybuffer' );
  loader.load( url, function ( data ) {
    onLoad( scope.__parse( url, data ) );
  }, onProgress, onError );
};

// Parser taken from THREE.js example NRRDLoader
NRRDLoader.prototype.__parse = function ( filename, data ) {
  // this parser is largely inspired from the XTK NRRD parser : https://github.com/xtk/X
  var _data = data;
  var _dataPointer = 0;
  var _nativeLittleEndian = new Int8Array( new Int16Array( [ 1 ] ).buffer )[ 0 ] > 0;
  var _littleEndian = true;
  var headerObject = {};

  function scan( type, chunks ) {
    if ( chunks === undefined || chunks === null ) {
      chunks = 1;
    }

    var _chunkSize = 1;
    var _array_type = Uint8Array;
    switch ( type ) {
      // 1 byte data types
      case 'uchar':
        break;
      case 'schar':
        _array_type = Int8Array;
        break;
      // 2 byte data types
      case 'ushort':
        _array_type = Uint16Array;
        _chunkSize = 2;
        break;
      case 'sshort':
        _array_type = Int16Array;
        _chunkSize = 2;
        break;
      // 4 byte data types
      case 'uint':
        _array_type = Uint32Array;
        _chunkSize = 4;
        break;
      case 'sint':
        _array_type = Int32Array;
        _chunkSize = 4;
        break;
      case 'float':
        _array_type = Float32Array;
        _chunkSize = 4;
        break;
      case 'complex':
        _array_type = Float64Array;
        _chunkSize = 8;
        break;
      case 'double':
        _array_type = Float64Array;
        _chunkSize = 8;
        break;

    }

    // increase the data pointer in-place
    var _bytes = new _array_type( _data.slice( _dataPointer,
      _dataPointer += chunks * _chunkSize ) );

    // if required, flip the endianness of the bytes
    if ( _nativeLittleEndian != _littleEndian ) {
      // we need to flip here since the format doesn't match the native endianness
      _bytes = flipEndianness( _bytes, _chunkSize );
    }

    if ( chunks == 1 ) {
      // if only one chunk was requested, just return one value
      return _bytes[ 0 ];
    }

    // return the byte array
    return _bytes;
  }

  //Flips typed array endianness in-place. Based on https://github.com/kig/DataStream.js/blob/master/DataStream.js.
  function flipEndianness( array, chunkSize ) {
    var u8 = new Uint8Array( array.buffer, array.byteOffset, array.byteLength );
    for ( var i = 0; i < array.byteLength; i += chunkSize ) {
      for ( var j = i + chunkSize - 1, k = i; j > k; j --, k ++ ) {
        var tmp = u8[ k ];
        u8[ k ] = u8[ j ];
        u8[ j ] = tmp;
      }
    }
    return array;
  }

  //parse the header
  function parseHeader( header ) {
    var data, field, fn, i, l, lines, m, _i, _len;
    lines = header.split( /\r?\n/ );
    for ( _i = 0, _len = lines.length; _i < _len; _i ++ ) {
      l = lines[ _i ];
      if ( l.match( /NRRD\d+/ ) ) {
        headerObject.isNrrd = true;
      } else if ( l.match( /^#/ ) ) {
      } else if ( m = l.match( /(.*):(.*)/ ) ) {
        field = m[1].trim();
        data = m[2].trim();
        fn = __parseFieldFunctions[ field ];
        if ( fn ) {
          fn.call( headerObject, data );
        } else {
          headerObject[ field ] = data;
        }
      }
    }
    if (!headerObject.isNrrd) {
      throw new Error( 'Not an NRRD file' );
    }
    if ( headerObject.encoding === 'bz2' || headerObject.encoding === 'bzip2' ) {
      throw new Error( 'Bzip is not supported' );
    }
    if (!headerObject.space_directions) {
      //if no space direction is set, let's use the identity for the last three dimensions
      headerObject.space_directions = headerObject.sizes.map(function() { return null; });
      var start = headerObject.sizes.length - 3;
      headerObject.space_directions[start] = [1,0,0];
      headerObject.space_directions[start+1] = [0,1,0];
      headerObject.space_directions[start+2] = [0,0,1];
    }
    headerObject.space_dimensions = headerObject.sizes.filter(function(x, i) {
      return headerObject.space_directions[i];
    });
    headerObject.space_vectors = headerObject.space_directions.filter(function(x) {
      return x;
    });
    // //apply spacing if defined
    // if (headerObject.spacings) {
    //   for ( i = 0; i <= 2; i ++ ) {
    //     if (!isNaN(headerObject.spacings[i])) {
    //       headerObject.vectors[ i ].multiplyScalar( headerObject.spacings[ i ] );
    //     }
    //   }
    // }

  }

  //parse the data when registered as one of this type : 'text', 'ascii', 'txt'
  function parseDataAsText( data, start, end ) {
    var number = '';
    start = start || 0;
    end = end || data.length;
    var value;
    //length of the result is the product of the sizes
    var lengthOfTheResult = headerObject.sizes.reduce( function ( previous, current ) {
      return previous * current;
    }, 1 );

    var base = 10;
    if ( headerObject.encoding === 'hex' ) {
      base = 16;
    }

    var result = new headerObject.__array( lengthOfTheResult );
    var resultIndex = 0;
    var parsingFunction = parseInt;
    if (headerObject.__array === Float32Array || headerObject.__array === Float64Array) {
      parsingFunction = parseFloat;
    }
    for (var i = start; i < end; i++) {
      value = data[ i ];
      //if value is not a space
      if ((value < 9 || value > 13) && value !== 32) {
        number += String.fromCharCode( value );
      } else {
        if (number !== '') {
          result[ resultIndex ] = parsingFunction( number, base );
          resultIndex ++;
        }
        number = '';
      }
    }
    if (number !== '') {
      result[ resultIndex ] = parsingFunction( number, base );
      resultIndex ++;
    }
    return result;
  }

  var _bytes = scan( 'uchar', data.byteLength );
  var _length = _bytes.length;
  var _header = null;
  var _data_start = 0;
  for (var i = 1; i < _length; i++ ) {
    // TODO: Handle \r\n
    if ( _bytes[i - 1] === 10 && _bytes[i] === 10) {
      // we found two line breaks in a row
      // now we know what the header is
      _header = __parseChars(_bytes, 0, i - 1);
      // this is where the data starts
      _data_start = i + 1;
      break;
    }
  }
  // parse the header
  parseHeader( _header );

  var _data = _bytes.subarray(_data_start); // the data without header
  if ( headerObject.encoding === 'gzip' || headerObject.encoding === 'gz' ) {
    // we need to decompress the datastream
    // here we start the unzipping and get a typed Uint8Array back
    //var inflate = new Zlib.Gunzip( new Uint8Array( _data ) );
    //_data = inflate.decompress();
    _data = zlib.ungzip(new Uint8Array(_data));
  } else if ( headerObject.encoding === 'ascii' || headerObject.encoding === 'text' || headerObject.encoding === 'txt' || headerObject.encoding === 'hex' ) {
    _data = parseDataAsText( _data );
  } else if ( headerObject.encoding === 'raw' ) {
    //we need to copy the array to create a new array buffer, else we retrieve the original arraybuffer with the header
    var _copy = new Uint8Array( _data.length );
    for (var i = 0; i < _data.length; i++) {
      _copy[i] = _data[i];
    }
    _data = _copy;
  }
  // .. let's use the underlying array buffer
  _data = _data.buffer;

  var volume = new this.GridType({ dataType: headerObject.dataType });
  volume.init({ orderedDims: headerObject.space_dimensions, data: _data });
  volume.header = headerObject;

  // spacing
  // var spacingX = ( new THREE.Vector3( headerObject.vectors[ 0 ][ 0 ], headerObject.vectors[ 0 ][ 1 ],
  //   headerObject.vectors[ 0 ][ 2 ] ) ).length();
  // var spacingY = ( new THREE.Vector3( headerObject.vectors[ 1 ][ 0 ], headerObject.vectors[ 1 ][ 1 ],
  //   headerObject.vectors[ 1 ][ 2 ] ) ).length();
  // var spacingZ = ( new THREE.Vector3( headerObject.vectors[ 2 ][ 0 ], headerObject.vectors[ 2 ][ 1 ],
  //   headerObject.vectors[ 2 ][ 2 ] ) ).length();
  // volume.spacing = [ spacingX, spacingY, spacingZ ];

  // Create gridToWorld (IJKtoRAS) matrix
  var _spaceX = 1;
  var _spaceY = 1;
  var _spaceZ = 1;

  if ( headerObject.space == "left-posterior-superior" ) {
    _spaceX = - 1;
    _spaceY = - 1;
  } else if ( headerObject.space === 'left-anterior-superior' ) {
    _spaceX = - 1;
  }

  var origin = headerObject.space_origin;
  if ( ! origin ) {
    origin = [ 0, 0, 0 ];
  }
  if ( ! headerObject.space_vectors ) {
    volume.gridToWorld.set(
      _spaceX, 0, 0, origin[0],
      0, _spaceY, 0, origin[1],
      0, 0, _spaceZ, origin[2],
      0, 0, 0, 1 );
  } else {
    var v = headerObject.space_vectors;
    // NOTE: Weird ordering of z, x, y
    volume.gridToWorld.set(
      _spaceX * v[ 2 ][ 0 ], _spaceX * v[ 0 ][ 0 ], _spaceX * v[ 1 ][ 0 ], origin[0],
      _spaceY * v[ 2 ][ 1 ], _spaceY * v[ 0 ][ 1 ], _spaceY * v[ 1 ][ 1 ], origin[1],
      _spaceZ * v[ 2 ][ 2 ], _spaceZ * v[ 0 ][ 2 ], _spaceZ * v[ 1 ][ 2 ], origin[2],
      0, 0, 0, 1 );
  }

  volume.worldToGrid = new THREE.Matrix4();
  volume.worldToGrid.getInverse( volume.gridToWorld );
  //volume.RASDimensions = ( new THREE.Vector3( volume.xLength, volume.yLength, volume.zLength ) ).applyMatrix4( volume.matrix ).round().toArray().map( Math.abs );
  return volume;
};

function __parseChars ( array, start, end ) {
  // without borders, use the whole array
  if ( start === undefined ) {
    start = 0;
  }
  if ( end === undefined ) {
    end = array.length;
  }

  var output = '';
  // create and append the chars
  for (var i = start; i < end; ++ i ) {
    output += String.fromCharCode( array[ i ] );
  }
  return output;
}

var __parseFieldFunctions = {
  type: function ( data ) {
    this.dataType = NRRDLoader.NRRDToGridDataType[data];
    if (!this.dataType) {
        throw new Error( 'Unsupported NRRD data type: ' + data );
    }
    this.__array = Grid.Types[this.dataType].array;
    if (!this.__array) {
      throw new Error( 'Unsupported grid data type: ' + this.dataType );
    }
    return this.type = data;
  },

  endian: function ( data ) {
    return this.endian = data;
  },

  encoding: function ( data ) {
    return this.encoding = data;
  },

  dimension: function ( data ) {
    return this.dim = parseInt( data, 10 );
  },

  sizes: function ( data ) {
    var parsed = data.split(/\s+/).map(function(x) { return parseInt(x, 10); });
    return this.sizes = parsed;
  },

  space: function ( data ) {
    return this.space = data;
  },

  'space origin': function ( data ) {
    return this.space_origin = data.split('(')[ 1 ].split(')')[ 0 ].split(',');
  },

  'space directions': function ( data ) {
    var parts = data.match( /\(.*?\)|none/g );
    var parsed = parts.map(function(v) {
      if (v === 'none') {
        return null;
      } else {
        return v.slice(1, -1).split(/,/).map(function (x) {
          return parseFloat(x);
        });
      }
    });
    return this.space_directions = parsed;
  },

  spacings: function ( data ) {
    var parsed = data.split(/\s+/).map(function(x) { return parseFloat(x); });
    return this.spacings = parsed;
  }
};

module.exports = NRRDLoader;
