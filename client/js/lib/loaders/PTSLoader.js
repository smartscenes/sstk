const BasicLoader = require('loaders/BasicLoader');

/**
 * Loader for pts (Point cloud) files
 * @param params
 * @constructor
 * @memberOf loaders
 */
class PTSLoader extends BasicLoader {
  constructor(params) {
    super(params);
    this.computeNormals = params.computeNormals;
    this.fields = params.fields;
    this.contomVertexAttributes = this.fields.filter(x => ['red','blue','green','nx','ny','nz','x','y','z','s','t'].indexOf(x) < 0);
  }

  __createBuffer() {
    var buffer = {
      indices : [],
      vertices : [],
      normals : [],
      uvs : [],
      colors : []
    };

    // Additional attributes to keep
    if (this.customVertexAttributes) {
      const customVertexAttributes = this.customVertexAttributes;
      buffer.customVertexAttributes = {};
      for (let i = 0; i < customVertexAttributes.length; i++) {
        buffer.customVertexAttributes[customVertexAttributes[i]] = [];
      }
    }
    return buffer;
  }

  __postProcess(buffer, options) {
    console.time('postProcess');
    const geometry = new THREE.BufferGeometry();

    // mandatory buffer data
    if (buffer.indices.length > 0) {
      geometry.setIndex(buffer.indices);
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffer.vertices, 3));
    // optional buffer data
    if (options.computeNormals) {
      geometry.computeVertexNormals();
    } else {
      if (buffer.normals.length > 0) {
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buffer.normals, 3));
      }
    }

    if (buffer.uvs.length > 0) {
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buffer.uvs, 2));
    }

    if (buffer.colors.length > 0) {
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(buffer.colors, 3));
    }

    geometry.computeBoundingSphere();

    if (buffer.customVertexAttributes) {
      geometry.customVertexAttributes = buffer.customVertexAttributes;
    }

    console.timeEnd('postProcess');
    return geometry;
  }

  __handleVertex( buffer, element ) {
    buffer.vertices.push( element.x, element.y, element.z );
    if ( 'nx' in element && 'ny' in element && 'nz' in element ) {
      buffer.normals.push( element.nx, element.ny, element.nz );
    }
    if ( 's' in element && 't' in element ) {
      buffer.uvs.push( element.s, element.t );
    }
    if ( 'red' in element && 'green' in element && 'blue' in element ) {
      buffer.colors.push( element.red / 255.0, element.green / 255.0, element.blue / 255.0 );
    }
    if (buffer.customVertexAttributes) {
      for (let k in buffer.customVertexAttributes) {
        if (buffer.customVertexAttributes.hasOwnProperty(k) && k in element) {
          buffer.customVertexAttributes[k].push(element[k]);
        }
      }
    }
  }

  parse(data) {
    const ws = /\s+/;
    let lastIndex = 0;
    let lineno = 0;
    let npoints = -1;
    const buffer = this.__createBuffer();
    while (lastIndex < data.length) {
      const index = data.indexOf('\n', lastIndex);
      const eolIndex = (index >= 0)? index : data.length;
      const line = data.substring(lastIndex, eolIndex-1).trim();

      if (line.length > 0) {
        const parts = line.split(ws);
        if (lineno === 0 && parts.length === 1) {
          // number of points
          npoints = parseInt(line);
        } else {
          const vert = {};
          for (let i = 0; i < this.fields.length; i++) {
            vert[this.fields[i]] = parseFloat(parts[i]);
          }
          this.__handleVertex(buffer, vert);
        }
      }
      lastIndex = eolIndex+1;
      lineno++;
    }
    return this.__postProcess(buffer, this);
  }
}


module.exports = PTSLoader;