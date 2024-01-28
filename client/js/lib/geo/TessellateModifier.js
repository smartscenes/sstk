/**
 * Modified version of THREE.TessellateModifier
 * Break faces with edges longer than maxEdgeLength
 *
 * @author angelx
 * @memberOf geo
 */

const GeometryUtil = require('geo/GeometryUtil');

// temporary variables
const va = new THREE.Vector3();
const vb  = new THREE.Vector3();
const vc = new THREE.Vector3();
const vm = new THREE.Vector3();
const va2 = new THREE.Vector2();
const vb2  = new THREE.Vector2();
const vc2 = new THREE.Vector2();
const vm2 = new THREE.Vector2();

function __lerpVec3Attr(array, a, b) {
  va.fromArray(array, a*3);
  vb.fromArray(array, b*3);
  vm.copy(va).lerp(vb, 0.5);
  array.push(vm.x, vm.y, vm.z);
}

function __lerpVec2Attr(array, a, b) {
  va2.fromArray(array, a*2);
  vb2.fromArray(array, b*2);
  vm2.copy(va2).lerp(vb2, 0.5);
  array.push(vm2.x, vm2.y);
}

function __lerpAttr(attributes, a, b) {
  __lerpVec3Attr(attributes.position, a, b);
  if (attributes.normal) {
    __lerpVec3Attr(attributes.normal, a, b);
  }
  if (attributes.color) {
    __lerpVec3Attr(attributes.color, a, b);
  }
  if (attributes.uv) {
    __lerpVec2Attr(attributes.uv, a, b);
  }
  if (attributes.uv2) {
    __lerpVec2Attr(attributes.uv2, a, b);
  }
}

class TessellateModifier {
  constructor(maxEdgeLength) {
    this.maxEdgeLength = maxEdgeLength;
  }

  modify(geometry) {
    if ( geometry.isGeometry === true ) {
      console.error( 'THREE.TessellateModifier no longer supports Geometry. Use THREE.BufferGeometry instead.' );
      return geometry;
    }

    GeometryUtil.toIndexedBufferGeometry(geometry);

    const maxEdgeLengthSquared = this.maxEdgeLength * this.maxEdgeLength;

    const attributes = geometry.attributes;

    const options = {
      maxEdgeLengthSquared: maxEdgeLengthSquared,
      index: Array.from(geometry.index.array),
      position: Array.from(attributes.position.array),
      normal: attributes.normal? Array.from(attributes.normal.array) : null,
      color: attributes.color? Array.from(attributes.color.array) : null,
      uv: attributes.uv? Array.from(attributes.uv.array) : null,
      uv2: attributes.uv2? Array.from(attributes.uv2.array) : null,
      cached: new Map()
    };
    this.__tesselateFaces(null, options);
    const geometry2 = this.__createBufferGeometry(options);
    return geometry2;
  }

  __tesselateFaces(indices, options) {
    if (indices) {
      for (let i = 0; i < indices.length; i++) {
        const iFace = indices[i];
        this.__tesselateFace(iFace, options);
      }
    } else {
      // Note: number of faces will increase (only want to do the originals)
      const nFaces = options.index.length / 3;
      for (let i = 0; i < nFaces; i++) {
        this.__tesselateFace(i, options);
      }
    }
  }
  __createBufferGeometry(opts) {
    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(opts.index);
    geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( opts.position, 3 ) );

    if ( opts.normal ) {
      geometry.setAttribute( 'normal', new THREE.Float32BufferAttribute( opts.normal, 3 ) );
    }

    if ( opts.color ) {
      geometry.setAttribute( 'color', new THREE.Float32BufferAttribute( opts.color, 3 ) );
    }

    if ( opts.uv ) {
      geometry.setAttribute( 'uv', new THREE.Float32BufferAttribute( opts.uv, 2 ) );
    }

    if ( opts.uv2 ) {
      geometry.setAttribute( 'uv2', new THREE.Float32BufferAttribute( opts.uv2, 2 ) );
    }

    return geometry;
  }

  __tesselateFace(iFace, options) {
    // TODO: consider improved tesselating where we make some triangles better
    return this.__tesselateFace4(iFace, options);
  }

  // Takes one triangle and replace it with 4 smaller triangles
  __tesselateFace4(iFace, options) {
    const maxEdgeLengthSquared = options.maxEdgeLengthSquared;
    const index = options.index;
    const nFaces = index.length / 3;
    const iFaces = [iFace, nFaces, nFaces + 1, nFaces + 2];

    const iFaceIndexOffset = iFace * 3;
    const a = index[iFaceIndexOffset];
    const b = index[iFaceIndexOffset + 1];
    const c = index[iFaceIndexOffset + 2];

    va.fromArray(options.position, a*3);
    vb.fromArray(options.position, b*3);
    vc.fromArray(options.position, c*3);

    // Cache of midpoints - v1_v2 => vertex.
    const cached = options.cached;

    function getCachedIndex(a, b) {
      const key = (a > b) ? (b + '_' + a) : (a + '_' + b);
      if (!cached.has(key)) {
        cached.set(key, {});
      }
      return cached.get(key);
    }

    const dab = va.distanceToSquared(vb);
    const dbc = vb.distanceToSquared(vc);
    const dac = va.distanceToSquared(vc);

    if (dab > maxEdgeLengthSquared || dbc > maxEdgeLengthSquared || dac > maxEdgeLengthSquared) {
      // console.log('tessellate ' + iFace, dab, dbc, dac, options, va, vb, vc);
      // Takes one triangle and create four triangles
      const cab = getCachedIndex(a, b);
      if (cab.index == undefined) {
        cab.index = options.position.length / 3;
        __lerpAttr(options, a, b);
      }
      const cbc = getCachedIndex(b, c);
      if (cbc.index == undefined) {
        cbc.index = options.position.length / 3;
        __lerpAttr(options, b, c);
      }
      const cac = getCachedIndex(a, c);
      if (cac.index == undefined) {
        cac.index = options.position.length / 3;
        __lerpAttr(options, a, c);
      }

      const mab = cab.index;
      const mbc = cbc.index;
      const mac = cac.index;

      index[iFaceIndexOffset] = mab;
      index[iFaceIndexOffset + 1] = mbc;
      index[iFaceIndexOffset + 2] = mac;

      index.push(a);
      index.push(mab);
      index.push(mac);

      index.push(mab);
      index.push(b);
      index.push(mbc);

      index.push(mac);
      index.push(mbc);
      index.push(c);

      this.__tesselateFaces(iFaces, options);
    }
  }
}

module.exports = TessellateModifier;