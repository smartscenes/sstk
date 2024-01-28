"use strict";

// NOTE: Currently uses RGB (24-bit) for indexing allowing up to ~16M vertices

var FaceIDShader = {
  vertexShader: [
    "attribute float id;",
    "",
    "uniform float size;",
    "uniform float scale;",
    "uniform float baseId;",
    "",
    "varying vec4 worldId;",
    "",
    "void main() {",
    "  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );",
    "  gl_PointSize = size * ( scale / length( mvPosition.xyz ) );",
    "  float i = baseId + id;",
    "  vec3 a = fract(vec3(1.0/255.0, 1.0/(255.0*255.0), 1.0/(255.0*255.0*255.0)) * i);",
    "  a -= a.xxy * vec3(0.0, 1.0/255.0, 1.0/255.0);",
    "  worldId = vec4(a,1);",
    "  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",
    "}"
  ].join("\n"),

  fragmentShader: [
    "#ifdef GL_ES\n",
    "precision highp float;\n",
    "#endif\n",
    "",
    "varying vec4 worldId;",
    "",
    "void main() {",
    "  gl_FragColor = worldId;",
    "}"
  ].join("\n")
};

class FaceIDMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      uniforms: {
        baseId: {type: "f", value: 0},
        size: {type: "f", value: 0.01},
        scale: {type: "f", value: 400}
      },
      vertexShader: FaceIDShader.vertexShader,
      fragmentShader: FaceIDShader.fragmentShader
    });
  }

  setBaseID(baseId) {
    this.uniforms.baseId.value = baseId;
  }

  setPointSize(size) {
    this.uniforms.size.value = size;
  }

  setPointScale(scale) {
    this.uniforms.scale.value = scale;
  }
}

// flag to override Object3D copy such that it keeps reference to original Object3D
THREE.Object3D.keepOriginalObjectReference = false;

//add a ref originalObject to Object3D
(function (copy) {
  THREE.Object3D.prototype.copy = function (src, recursive) {
    copy.call(this, src, recursive);
    if (THREE.Object3D.keepOriginalObjectReference) {
      // keep a ref to originalObject
      this.originalObject = src;
    }
    return this;
  };
}(THREE.Object3D.prototype.copy));

THREE.Mesh.prototype.raycastWithID = ( function () {
  var vA = new THREE.Vector3();
  var vB = new THREE.Vector3();
  var vC = new THREE.Vector3();
  var inverseMatrix = new THREE.Matrix4();
  var ray = new THREE.Ray();
  var triangle = new THREE.Triangle();
  var plane = new THREE.Plane();

  return function (elID, raycaster) {
    var geometry = this.geometry;
    var attributes = geometry.attributes;
    inverseMatrix.copy(this.matrixWorld).invert();
    ray.copy(raycaster.ray).applyMatrix4(inverseMatrix);
    var a, b, c;
    if (geometry.index != undefined) {
      console.log("WARNING: raycastWithID does not support indexed vertices");
    } else {
      var positions = attributes.position.array;
      var j = elID * 9;
      vA.fromArray(positions, j);
      vB.fromArray(positions, j + 3);
      vC.fromArray(positions, j + 6);
      a = elID * 3;
      b = a + 1;
      c = b + 1;
    }
    triangle.set(vA, vB, vC);
    var targetPoint = new THREE.Vector3();
    var intersectionPoint = ray.intersectPlane(triangle.getPlane(plane), targetPoint);

    if (intersectionPoint == null) {
      // console.log("WARNING: intersectionPoint missing");
      return;
    }

    intersectionPoint.applyMatrix4(this.matrixWorld);

    var distance = raycaster.ray.origin.distanceTo(intersectionPoint);

    if (distance < raycaster.near || distance > raycaster.far) { return; }

    var normal = new THREE.Vector3();
    THREE.Triangle.getNormal(vA, vB, vC, normal);
    var intersect = {
      distance: distance,
      point: intersectionPoint,
      face: new THREE.Face3(a, b, c, normal),
      index: elID, // triangle number in positions buffer semantics
      object: this
    };
    return intersect;
  };

}() );

THREE.Line.prototype.raycastWithID = (function () {
  var inverseMatrix = new THREE.Matrix4();
  var ray = new THREE.Ray();

  var vStart = new THREE.Vector3();
  var vEnd = new THREE.Vector3();
  var interSegment = new THREE.Vector3();
  var interRay = new THREE.Vector3();
  return function (elID, raycaster) {
    inverseMatrix.copy(this.matrixWorld).invert();
    ray.copy(raycaster.ray).applyMatrix4(inverseMatrix);
    var geometry = this.geometry;
    if (geometry.isBufferGeometry) {

      var attributes = geometry.attributes;

      if (geometry.index != undefined) {
        console.log("WARNING: raycastWithID does not support indexed vertices");
      } else {
        var positions = attributes.position.array;
        var i = elID * 6;
        vStart.fromArray(positions, i);
        vEnd.fromArray(positions, i + 3);

        // var distSq = ray.distanceSqToSegment(vStart, vEnd, interRay, interSegment);
        var distance = ray.origin.distanceTo(interRay);

        if (distance < raycaster.near || distance > raycaster.far) return;

        var intersect = {
          distance: distance,
          // What do we want? intersection point on the ray or on the segment??
          // point: raycaster.ray.at( distance ),
          point: interSegment.clone().applyMatrix4(this.matrixWorld),
          index: i,
          face: null,
          faceIndex: null,
          object: this
        };
        return intersect;
      }

    }
  };

})();

THREE.Points.prototype.raycastWithID = ( function () {

  var inverseMatrix = new THREE.Matrix4();
  var ray = new THREE.Ray();

  return function (elID, raycaster) {
    var object = this;
    var geometry = object.geometry;

    inverseMatrix.copy(this.matrixWorld).invert();
    ray.copy(raycaster.ray).applyMatrix4(inverseMatrix);
    var position = new THREE.Vector3();

    var testPoint = function (point, index) {
      var rayPointDistance = ray.distanceToPoint(point);
      var intersectPoint = ray.closestPointToPoint(point);
      intersectPoint.applyMatrix4(object.matrixWorld);

      var distance = raycaster.ray.origin.distanceTo(intersectPoint);

      if (distance < raycaster.near || distance > raycaster.far) return;

      var intersect = {
        distance: distance,
        distanceToRay: rayPointDistance,
        point: intersectPoint.clone(),
        index: index,
        face: null,
        object: object
      };
      return intersect;
    };
    var attributes = geometry.attributes;
    var positions = attributes.position.array;
    position.fromArray(positions, elID * 3);

    return testPoint(position, elID);

  };

}() );

/**
 * GPUPicker (adapted from https://github.com/brianxu/GPUPicker) for triangle level picking offscreen
 * @license MIT License <https://github.com/brianxu/GPUPicker/blob/master/LICENSE>
 * @constructor
 * @memberOf controls
 */
THREE.GPUPicker = function (option) {
  if (option === undefined) {
    option = {};
  }
  this._tmpSize = new THREE.Vector2();
  this.pickingScene = new THREE.Scene();
  this.pickingTexture = new THREE.WebGLRenderTarget();
  this.pickingTexture.texture.minFilter = THREE.LinearFilter;
  this.pickingTexture.texture.generateMipmaps = false;
  this.lineShell = option.lineShell !== undefined ? option.lineShell : 4;
  this.pointShell = option.pointShell !== undefined ? option.pointShell : 0.1;
  this.debug = option.debug !== undefined ? option.debug : false;
  this.useFullBuffer = option !== undefined? option.useFullBuffer : false;
  this.needUpdate = true;
  if (option.renderer) {
    this.setRenderer(option.renderer);
  }

  // array of original objects
  this.container = [];
  this.objectsMap = {};
  //default filter
  this.setFilter();
};

THREE.GPUPicker.prototype.getRendererSize = function() {
  this.renderer.getSize(this._tmpSize);
  return this._tmpSize;
};

THREE.GPUPicker.prototype.setRenderer = function (renderer) {
  this.renderer = renderer;
  var size = this.getRendererSize();
  this.resizeTexture(size.width, size.height);
  this.needUpdate = true;
};

THREE.GPUPicker.prototype.resizeTexture = function (width, height) {
  this.pickingTexture.setSize(width, height);
  this.pixelBuffer = this.useFullBuffer? new Uint8Array(4*width*height) : new Uint8Array(4);
  this.needUpdate = true;
};

THREE.GPUPicker.prototype.setCamera = function (camera) {
  this.camera = camera;
  this.needUpdate = true;
};

THREE.GPUPicker.prototype.update = function (mouse, forceUpdate) {
  if (this.needUpdate || forceUpdate) {
    this.renderer.setRenderTarget(this.pickingTexture);
    this.renderer.clear();
    this.renderer.render(this.pickingScene, this.camera);
    //read the rendering texture
    if (this.useFullBuffer) {
      this.renderer.readRenderTargetPixels(this.pickingTexture, 0, 0, this.pickingTexture.width, this.pickingTexture.height, this.pixelBuffer);
    }
    this.needUpdate = false;
    if (this.debug) console.log("GPUPicker rendering updated");
  }
  if (!this.useFullBuffer) {
    this.renderer.readRenderTargetPixels(this.pickingTexture, mouse.x, mouse.y, 1, 1, this.pixelBuffer);
  }
};

THREE.GPUPicker.prototype.setFilter = function (func) {
  if (func instanceof Function) {
    this.filterFunc = func;
  } else {
    //default filter
    this.filterFunc = function (object) {
      return true;
    };
  }
};

THREE.GPUPicker.prototype.setScene = function (scene) {
  var oldKeepRef = THREE.Object3D.keepOriginalObjectReference;
  THREE.Object3D.keepOriginalObjectReference = true;
  this.pickingScene = scene.clone();
  THREE.Object3D.keepOriginalObjectReference = oldKeepRef;
  this._processObject(this.pickingScene, 0);
  this.needUpdate = true;
};

THREE.GPUPicker.prototype.pick = function (mouse, raycaster) {
  var m = { x: mouse.x, y: this.pickingTexture.height - mouse.y};
  this.update(m);

  var index = this.useFullBuffer? (m.x + m.y * this.pickingTexture.width) : 0;
  //interpret the pixel as an ID
  return this.__pickAt(index, raycaster);
};

THREE.GPUPicker.prototype.__pickAt = function(index, raycaster) {
  var id = (this.pixelBuffer[index * 4 + 2] * 255 * 255) + (this.pixelBuffer[index * 4 + 1] * 255) + (this.pixelBuffer[index * 4 + 0]);
  var alpha = this.pixelBuffer[index * 4 + 3];
  if (alpha === 0) {
    return null;  // no intersection
  }

  // get object with this id in range
  // var object = this._getObject(id);
  if (this.debug) console.log("pick id:", id);
  var result = this._getObject(this.pickingScene, 0, id);
  var object = result[1];
  var elementId = id - result[0];
  if (object) {
    if (!raycaster) {
      return { object: object.originalObject, faceIndex: elementId };  // No raycaster, just return object and faceIndex
    }
    if (object.raycastWithID) {
      var intersect = object.raycastWithID(elementId, raycaster);
      if (intersect) {
        intersect.object = object.originalObject;
        intersect.faceIndex = intersect.index;
        if (object.originalObject.geometry.index) {  // also revert face vertex indices
          var idx = object.originalObject.geometry.index.array;
          var offset = intersect.faceIndex * 3;
          intersect.face.a = idx[offset];
          intersect.face.b = idx[offset + 1];
          intersect.face.c = idx[offset + 2];
        }
        return intersect;
      }
    }
  }
};

/*
 * get object by id
 */
THREE.GPUPicker.prototype._getObject = function (object, baseId, id) {
  // if (this.debug) console.log("_getObject ",baseId);
  if (object.elementsCount !== undefined && id >= baseId && id < baseId + object.elementsCount) {
    return [baseId, object];
  }
  if (object.elementsCount !== undefined) {
    baseId += object.elementsCount;
  }
  var result = [baseId, undefined];
  for (var i = 0; i < object.children.length; i++) {
    result = this._getObject(object.children[i], result[0], id);
    if (result[1] !== undefined)
      break;
  }
  return result;
};

/*
 * process the object to add elementId information
 */
THREE.GPUPicker.prototype._processObject = function (object, baseId) {
  baseId += this._addElementID(object, baseId);
  for (var i = 0; i < object.children.length; i++) {
    baseId = this._processObject(object.children[i], baseId);
  }
  return baseId;
};

THREE.GPUPicker.prototype._addElementID = function (object, baseId) {
  if (!this.filterFunc(object) && object.geometry !== undefined) {
    object.visible = false;
    return 0;
  }

  if (object.geometry) {
    var __pickingGeometry;
    //check if geometry has cached geometry for picking
    if (object.geometry.__pickingGeometry) {
      __pickingGeometry = object.geometry.__pickingGeometry;
    } else {
      __pickingGeometry = object.geometry;
      var units = 1;
      if (object instanceof THREE.Points) {
        units = 1;
      } else if (object instanceof THREE.Line) {
        units = 2;
      } else if (object instanceof THREE.Mesh) {
        units = 3;
      }
      var el, el3, elementsCount, i, indices, positionBuffer, vertex3, verts, vertexIndex3;
      if (__pickingGeometry.index != undefined) {
        __pickingGeometry = __pickingGeometry.clone();
        if (this.debug) console.log("convert indexed geometry to non-indexed geometry");

        indices = __pickingGeometry.index.array;
        verts = __pickingGeometry.attributes.position.array;
        delete __pickingGeometry.attributes.position;
        __pickingGeometry.index = null;  // NOTE: THREE checks geometry.index !== null to determine if indexed
        delete __pickingGeometry.attributes.normal;
        elementsCount = indices.length / units;
        positionBuffer = new Float32Array(elementsCount * 3 * units);

        __pickingGeometry.setAttribute('position', new THREE.BufferAttribute(positionBuffer, 3));
        for (el = 0; el < elementsCount; ++el) {
          el3 = units * el;
          for (i = 0; i < units; ++i) {
            vertexIndex3 = 3 * indices[el3 + i];
            vertex3 = 3 * (el3 + i);
            positionBuffer[vertex3] = verts[vertexIndex3];
            positionBuffer[vertex3 + 1] = verts[vertexIndex3 + 1];
            positionBuffer[vertex3 + 2] = verts[vertexIndex3 + 2];
          }
        }
        __pickingGeometry.computeVertexNormals();
      }
      if (object instanceof THREE.Line && !(object instanceof THREE.LineSegments)) {
        if (this.debug) console.log("convert Line to LineSegments");
        verts = __pickingGeometry.attributes.position.array;
        delete __pickingGeometry.attributes.position;
        elementsCount = verts.length / 3 - 1;
        positionBuffer = new Float32Array(elementsCount * units * 3);

        __pickingGeometry.setAttribute('position', new THREE.BufferAttribute(positionBuffer, 3));
        for (el = 0; el < elementsCount; ++el) {
          el3 = 3 * el;
          vertexIndex3 = el3;
          vertex3 = el3 * 2;
          positionBuffer[vertex3] = verts[vertexIndex3];
          positionBuffer[vertex3 + 1] = verts[vertexIndex3 + 1];
          positionBuffer[vertex3 + 2] = verts[vertexIndex3 + 2];
          positionBuffer[vertex3 + 3] = verts[vertexIndex3 + 3];
          positionBuffer[vertex3 + 4] = verts[vertexIndex3 + 4];
          positionBuffer[vertex3 + 5] = verts[vertexIndex3 + 5];
        }

        __pickingGeometry.computeVertexNormals();
        object.__proto__ = THREE.LineSegments.prototype; //make the renderer render as line segments
      }
      var attributes = __pickingGeometry.attributes;
      var positions = attributes.position.array;
      var vertexCount = positions.length / 3;
      var ids = new THREE.Float32BufferAttribute(vertexCount, 1);
      //set vertex id color

      for (var i = 0, il = vertexCount / units; i < il; i++) {
        for (var j = 0; j < units; ++j) {
          ids.array[i * units + j] = i;
        }
      }
      __pickingGeometry.setAttribute('id', ids);
      __pickingGeometry.elementsCount = vertexCount / units;
      // console.log('elementsCount', __pickingGeometry.elementsCount, 'vertexCount', vertexCount);
      //cache __pickingGeometry inside geometry
      object.geometry.__pickingGeometry = __pickingGeometry;
    }

    //use __pickingGeometry in the picking mesh
    object.geometry = __pickingGeometry;
    object.elementsCount = __pickingGeometry.elementsCount;//elements count

    var pointSize = object.material.size || 0.01;
    var linewidth = object.material.linewidth || 1;
    var size = this.getRendererSize();
    object.material = new FaceIDMaterial();
    object.material.linewidth = linewidth + this.lineShell;//make the line a little wider to hit
    object.material.setBaseID(baseId);
    object.material.setPointSize(pointSize + this.pointShell);//make the point a little wider to hit
    object.material.setPointScale(size.height * this.renderer.getPixelRatio() / 2);
    return object.elementsCount;
  }
  return 0;
};
