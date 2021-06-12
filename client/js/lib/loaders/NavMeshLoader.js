// Loads NavMeshSet from https://github.com/recastnavigation/recastnavigation
var FileLoader = require('io/FileLoader');
var jBinary = require('jbinary');
var _ = require('util/util');

function Mask(nbits, shift) {
  this.nbits = nbits;
  this.shift = shift || 0;
  this.mask = (1 << this.nbits) -1;
}

Mask.prototype.decode = function(v) {
  if (this.shift) {
    return (v >>> this.shift) & this.mask;
  } else {
    return v & this.mask;
  }
};

function NavMesh(opts) {
  _.extend(this, opts);
  var nTileBits = Math.log2(THREE.MathUtils.nextPowerOfTwo(this.maxTiles));
  var nPolyBits = Math.log2(THREE.MathUtils.nextPowerOfTwo(this.maxPolys));
  // Only allow 31 salt bits, since the salt mask is calculated using 32bit uint and it will overflow.
  var nSaltBits = Math.min(31, 32 - nTileBits - nPolyBits);

  this.saltMask = new Mask(nSaltBits, nTileBits + nPolyBits);
  this.tileMask = new Mask(nTileBits, nPolyBits);
  this.polyMask = new Mask(nPolyBits, 0);

  //var scope = this;
  this.tiles = _.map(this.tiles, function(t) {
    //t.index = scope.tileMask.decode(t.tileRef);
    //t.salt = scope.saltMask.decode(t.tileRef);
    return new MeshTile(t);
  });
  this.tilesByPosition = _.groupBy(this.tiles, function(t) {
    return t.x + '-' + t.y;
  });
}

NavMesh.prototype.getTileAt = function(x,y,layer) {
  var tiles = this.tilesByPosition[x + '-' + y];
  if (tiles) {
    // filter to tile with layer
    return _.find(tiles, function(t) { return t.layer === layer; });
  }
};

NavMesh.prototype.getTilesAt = function(x,y) {
  var tiles = this.tilesByPosition[x + '-' + y];
  return tiles;
};

function MeshTile(opts) {
  _.extend(this, opts);
}

function NavMeshLoader() {

}

NavMeshLoader.prototype.load = function (path, callback) {
  var loader = new FileLoader();
  var scope = this;
  loader.load(path, 'arraybuffer', function(data) {
    scope.parse(path.name || path, data, callback);
  }, null, function(err) {
    callback(err);
  });
};

// NavMeshFile format
// navmeshset header:
//   int32_t magic;     // MSET (will indicate endianness)
//   int32_t version;   // 1
//   int32_t numTiles;  // number of tiles
// navmesh params:
//   float orig[3];			// The world space origin of the navigation mesh's tile space. [(x, y, z)]
//   float tileWidth;	  // The width of each tile. (Along the x-axis.)
//   float tileHeight;	// The height of each tile. (Along the z-axis.)
//   int32_t maxTiles;	// The maximum number of tiles the navigation mesh can contain.
//   int32_t maxPolys;	// The maximum number of polygons each tile can contain.
// array of navmesh tiles (numTiles), each consisting of a navmesh tile
//
// navmesh tile:
// navmeshtile header:
//   dtTileRef tileRef;  // reference to tile
//   int32_t  dataSize;  // number of bytes that follow that belongs to this tile
// navmeshtile data starts with
// dtMeshHeader
//   int32_t magic;				// Tile magic number. (Used to identify the data format.)
//   int32_t version;			// Tile data format version number.
//   int32_t x;					  // The x-position of the tile within the dtNavMesh tile grid. (x, y, layer)
//   int32_t y;					  // The y-position of the tile within the dtNavMesh tile grid. (x, y, layer)
//   int32_t layer;				// The layer of the tile within the dtNavMesh tile grid. (x, y, layer)
//   uint32_t userId;	    // The user defined id of the tile.
//   int32_t polyCount;		// The number of polygons in the tile.
//   int32_t vertCount;		// The number of vertices in the tile.
//   int32_t maxLinkCount;		// The number of allocated links.
//   int32_t detailMeshCount;	// The number of sub-meshes in the detail mesh.
//   int32_t detailVertCount; // The number of unique vertices in the detail mesh. (In addition to the polygon vertices.)
//   int32_t detailTriCount;	// The number of triangles in the detail mesh.
//   int32_t bvNodeCount;			// The number of bounding volume nodes. (Zero if bounding volumes are disabled.)
//   int32_t offMeshConCount;	// The number of off-mesh connections.
//   int32_t offMeshBase;			// The index of the first polygon which is an off-mesh connection.
//   float walkableHeight;		// The height of the agents using the tile.
//   float walkableRadius;		// The radius of the agents using the tile.
//   float walkableClimb;		  // The maximum climb height of the agents using the tile.
//   float bmin[3];				    // The minimum bounds of the tile's AABB. [(x, y, z)]
//   float bmax[3];				    // The maximum bounds of the tile's AABB. [(x, y, z)]
//   float bvQuantFactor;     // The bounding volume quantization factor.
// followed by (after 4 byte alignments):
//   float  verts[3*vertCount]   // The tile vertex positions
//   dtPoly polys[polyCount]     // The tile polygons
//   dtLink links[maxLinkCount]  // The tile links
//   dtPolyDetail detailMeshes[detailMeshCount]  // The tile detail submeshes
//   float  detailVerts[3*detailVertCount]       // The detail mesh's unique vertex positions (x,y,z)
//   uint8_t detailTris[4*detailTriCount]        // The detail mesh's triangle indices (vertA, vertB, vertC)
//   dtBVHNode bvTree[bvNodeCount]               // The tile bounding volume nodes
//   dtOffMeshConnection offMeshCons[offMeshConCount] // The tile off-mesh connections
// dtPoly (32 bytes with DT_VERTS_PER_POLYGON = 6)
//   uint32_t firstLink;                        // Index to first link in linked list. (Or #DT_NULL_LINK if there is no link.)
//   uint16_t verts[DT_VERTS_PER_POLYGON];      // The indices of the polygon's vertices (actual vertex positions in tile verts).
//   uint16_t neighbors[DT_VERTS_PER_POLYGON];  // Packed data representing neighbor polygons references and flags for each edge.
//   uint16_t flags;                            // The user defined polygon flags.
//   uint8_t  vertCount;                        // The number of vertices in the polygon.
//   uint8_t  areaAndType;                      // The bit packed area id and polygon type.
// dtLink (12 bytes with uint32_t dtPolyRef)
//   dtPolyRef ref;				// Neighbour reference. (The neighbor that is linked to)
//   uint32_t next;				// Index of the next link.
//   uint8_t edge;				// Index of the polygon edge that owns this link.
//   uint8_t side;				// If a boundary link, defines on which side the link is.
//   uint8_t bmin;				// If a boundary link, defines the minimum sub-edge area.
//   uint8_t bmax;				// If a boundary link, defines the maximum sub-edge area.
// dtPolyDetail (10 bytes, 12 aligned)
//   uint32_t vertBase;			// The offset of the vertices in the dtMeshTile::detailVerts array.
//   uint32_t triBase;			// The offset of the triangles in the dtMeshTile::detailTris array.
//   uint8_t  vertCount;		// The number of vertices in the sub-mesh.
//   uint8_t  triCount;			// The number of triangles in the sub-mesh.
// dtBVHNode (16 bytes)
//   uint16_t bmin[3];			// Minimum bounds of the node's AABB. [(x, y, z)]
//   uint16_t bmax[3];			// Maximum bounds of the node's AABB. [(x, y, z)]
//   uint32_t i;						// The node's index. (Negative for escape sequence.)
// dtOffMeshConnection (36 bytes)
//   float    pos[6];       // The endpoints of the connection. [(ax, ay, az, bx, by, bz)]
//   float    rad;          // The radius of the endpoints. [Limit: >= 0]
//   uint16_t poly;         // The polygon reference of the connection within the tile.
//   uint8_t  flags;        // Link flags (internal)
//   uint8_t  side;         // End point side.
//   uint32_t userId;       // The id of the offmesh connection. (User assigned when the navigation mesh is built.)
// NOTE: dtTileRef and dtPolyRef are either uint32_t (default) or uint64_t depending on the recast binary

// NavMesh Header constants
var __NMS_MAGIC_STRING = 'MSET';
var __NMS_MAGIC_BE = _.toCharCodes(__NMS_MAGIC_STRING);
var __NMS_MAGIC_LE = _.clone(__NMS_MAGIC_BE).reverse();
var __NMS_VERSION = 1;

// NavMesh constants
var __NM_MAGIC_STRING = 'DNAV';
var __NM_MAGIC = _.strToInt32(__NM_MAGIC_STRING);
var __NM_VERSION = 7;

// Tile constants
var __DT_VERTS_PER_POLYGON = 6;

var __NMS_BINARY_DEF = {
  'jBinary.all': 'NavMeshSet',
  'jBinary.littleEndian': true,

  Vector3f: ['array', 'float32', 3],
  // dtPoly (32 bytes with DT_VERTS_PER_POLYGON = 6)
  Poly: {
    firstLink: 'uint32',                                     // Index to first link in linked list. (Or #DT_NULL_LINK if there is no link.)
    verts: ['array', 'uint16', __DT_VERTS_PER_POLYGON],      // The indices of the polygon's vertices (actual vertex positions in tile verts).
    neighbors: ['array', 'uint16', __DT_VERTS_PER_POLYGON],  // Packed data representing neighbor polygons references and flags for each edge.
    flags:  'uint16',                                        // The user defined polygon flags.
    vertCount: 'uint8',                                      // The number of vertices in the polygon.
    areaAndType: 'uint8'                                     // The bit packed area id and polygon type.
  },
  // dtLink (12 bytes with uint32_t dtPolyRef)
  Link: {
    ref:  'uint32',   			// Neighbour reference (dtPolyRef) giving the neighbor that is linked to.
    next: 'uint32',   			// Index of the next link.
    edge: 'uint8',    			// Index of the polygon edge that owns this link.
    side: 'uint8',    			// If a boundary link, defines on which side the link is.
    bmin: 'uint8',    			// If a boundary link, defines the minimum sub-edge area.
    bmax: 'uint8'     			// If a boundary link, defines the maximum sub-edge area.
  },
  // dtPolyDetail (10 bytes, 12 aligned)
  PolyDetail: {
    vertBase: 'uint32',			// The offset of the vertices in the dtMeshTile::detailVerts array.
    triBase: 'uint32',			// The offset of the triangles in the dtMeshTile::detailTris array.
    vertCount: 'uint8',		  // The number of vertices in the sub-mesh.
    triCount: 'uint8',			  // The number of triangles in the sub-mesh.
    pad1: 'uint8',
    pad2: 'uint8'
  },
  // dtBVHNode (16 bytes)
  BVHNode: {
    bmin: ['array', 'uint16', 3],			// Minimum bounds of the node's AABB. [(x, y, z)]
    bmax: ['array', 'uint16', 3],			// Maximum bounds of the node's AABB. [(x, y, z)]
    index: 'uint32'						// The node's index. (Negative for escape sequence.)
  },
  // dtOffMeshConnection (36 bytes)
  OffMeshConnection: {
    position: ['array', 'Vector3f', 2],    // The endpoints of the connection. [(ax, ay, az, bx, by, bz)]
    rad: 'float32',                        // The radius of the endpoints. [Limit: >= 0]
    poly: 'uint16',                        // The polygon reference of the connection within the tile.
    flags: 'uint8',                        // Link flags (internal)
    side: 'uint8',                         // End point side.
    userId: 'uint32'                       // The id of the offmesh connection. (User assigned when the navigation mesh is built.)
  },
  NavMeshTile: {
    tileRef:  'int32',         // reference to tile (dtTileRef)
    dataSize: 'int32',         // number of bytes that follow that belongs to this tile
    // NavMeshTile header
    magic: 'int32',            // Tile magic number. (Used to identify the data format.)
    version: 'int32',          // Tile data format version number.
    x: 'int32',                // The x-position of the tile within the dtNavMesh tile grid. (x, y, layer)
    y: 'int32',                // The y-position of the tile within the dtNavMesh tile grid. (x, y, layer)
    layer: 'int32',            // The layer of the tile within the dtNavMesh tile grid. (x, y, layer)
    userId: 'uint32',          // The user defined id of the tile.
    polyCount: 'int32',        // The number of polygons in the tile.
    vertCount: 'int32',        // The number of vertices in the tile.
    maxLinkCount: 'int32',     // The number of allocated links.
    detailMeshCount: 'int32',  // The number of sub-meshes in the detail mesh.
    detailVertCount: 'int32',  // The number of unique vertices in the detail mesh. (In addition to the polygon vertices.)
    detailTriCount: 'int32',   // The number of triangles in the detail mesh.
    bvNodeCount: 'int32',      // The number of bounding volume nodes. (Zero if bounding volumes are disabled.)
    offMeshConCount: 'int32',  // The number of off-mesh connections.
    offMeshBase: 'int32',      // The index of the first polygon which is an off-mesh connection.
    walkableHeight: 'float32', // The height of the agents using the tile.
    walkableRadius: 'float32', // The radius of the agents using the tile.
    walkableClimb: 'float32',  // The maximum climb height of the agents using the tile.
    bmin: 'Vector3f',          // The minimum bounds of the tile's AABB. [(x, y, z)]
    bmax: 'Vector3f',          // The maximum bounds of the tile's AABB. [(x, y, z)]
    bvQuatFactor: 'float32',   // The bounding volume quantization factor.
    // Variable length data (each are 4 byte aligned)
    verts: ['array', 'Vector3f', 'vertCount'],   // The tile vertex positions
    polys: ['array', 'Poly', 'polyCount'],       // The tile polygons
    links: ['array', 'Link', 'maxLinkCount'],    // The tile links
    detailMeshes: ['array',  'PolyDetail', 'detailMeshCount'],  // The tile detail submeshes
    detailVerts: ['array', 'Vector3f', 'detailVertCount'],      // The detail mesh's unique vertex positions (x,y,z)
    detailTris: ['array', 'uint8', function(context)            // The detail mesh's triangle indices (vertA, vertB, vertC)
      { return context.detailTriCount * 4; }],
    btTree: ['array', 'BVHNode', 'bvNodeCount'],                // The tile bounding volume nodes
    offMeshConnections: ['array', 'OffMeshConnection', 'offMeshConCount']  // The tile off-mesh connections
  },
  NavMeshSet: {
    // NavMeshSet header
    magic: 'int32',            // NavMeshSet magic number  (MSET encoded as integer, can be used to determine endianness)
    version: 'int32',          // NavMeshSet version (1)
    numTiles: 'int32',         // number of tiles
    // NavMeshParams
    origin: 'Vector3f',        // The world space origin of the navigation mesh's tile space. [(x, y, z)]
    tileWidth: 'float32',      // The width of each tile. (Along the x-axis.)
    tileHeight: 'float32',     // The height of each tile. (Along the z-axis.)
    maxTiles: 'int32',         // The maximum number of tiles the navigation mesh can contain.
    maxPolys: 'int32',         // The maximum number of polygons each tile can contain.
    tiles: ['array', 'NavMeshTile', 'numTiles']  // Array of tiles follows
  }
};

NavMeshLoader.prototype.parse = function (filename, data, callback) {
  // Parse navmeshset file
  // Check endianness
  var magic = Array.from(new Uint8Array(data, 0, 4));
  var littleEndian;
  if (_.isEqual(magic, __NMS_MAGIC_BE)) {
    littleEndian = false;
  } else if (_.isEqual(magic, __NMS_MAGIC_LE)) {
    littleEndian = true;
  } else {
    callback('Invalid NavMesh file', null);
    return;
  }
  // Okay, we know our endianness.  Let's parse!
  __NMS_BINARY_DEF['jbinary.littleEndian'] = littleEndian;
  var binary = new jBinary(data, __NMS_BINARY_DEF);
  var parsed = binary.read('NavMeshSet');
  // Check the navMeshSet
  if (parsed.version !== __NMS_VERSION) {
    callback('Unsupported NavMeshSet version: ' + parsed.version, null);
    return;
  }
  var navMesh = new NavMesh(parsed);
  console.log('navMeshSet', navMesh);
  callback(null, navMesh);
};

module.exports = NavMeshLoader;

