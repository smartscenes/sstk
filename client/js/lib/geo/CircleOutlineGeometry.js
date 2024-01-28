// CircleOutlineGeometry for use with LineLoop to create circle (without fill)

class CircleOutlineGeometry extends THREE.BufferGeometry {
  constructor(radius = 1, segments = 8, thetaStart = 0, thetaLength = Math.PI * 2) {
    super();
    this.type = 'CircleOutlineGeometry';
    this.parameters = {
      radius: radius,
      segments: segments,
      thetaStart: thetaStart,
      thetaLength: thetaLength
    };
    segments = Math.max(3, segments); // buffers

    const vertices = [];

    const vertex = new THREE.Vector3();
    vertices.push(0, 0, 0);

    for (let s = 0, i = 3; s <= segments; s++, i += 3) {
      const segment = thetaStart + s / segments * thetaLength; // vertex

      vertex.x = radius * Math.cos(segment);
      vertex.y = radius * Math.sin(segment);
      vertices.push(vertex.x, vertex.y, vertex.z);
    }

    this.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  }

  static fromJSON(data) {
    return new CircleOutlineGeometry(data.radius, data.segments, data.thetaStart, data.thetaLength);
  }

}

module.exports = CircleOutlineGeometry;
