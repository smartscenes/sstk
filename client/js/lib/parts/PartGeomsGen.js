const PartGeoms = require('parts/PartGeoms');
const MissingGeometryGenerator = require('shape/MissingGeometryGenerator');
const async = require('async');
const _ = require('util/util');

const GeomTypes = ['panel', 'drawer'];
// Parameters are in meters
const GeomTypeParams = {
  'panel': {
    thickness: 0.025
  },
  'drawer': {
    allowNonRectangular: true,
    thickness: 0.0125,
    wgap: 0.02,
    hgap: 0.02,
    depth: null
  }
};

/** Generation utilities for PartGeoms */
class PartGeomsGen {

  static getShapeGenerator() {
    return new MissingGeometryGenerator(
      {
        inferMaterial: { name: 'getColorMaterialAtIntersectedPoint' },
        obbField: 'obbWorld',
        checkBounds: true,
        checkReverseDirection: true
      }
    );
  }

  static addGeneratedGeomObject3D(root, part, index, geomSpec, geomObject3D) {
    let geom;
    // compensate for obj transform
    const parent = part.object3D.parent;
    root.updateMatrixWorld();
    const worldToObject = parent.matrixWorld.clone().invert();
    geomObject3D.applyMatrix4(worldToObject);
    if (index != null) {
      geom = PartGeoms.replaceGeom(root, part, index, geomSpec, geomObject3D);
    } else {
      geom = PartGeoms.addGeom(root, part, geomSpec, geomObject3D);
    }
    return geom;
  }

  static generateGeometryFromSpecForPart(shapeGenerator, root, part, geomSpec, geomSpecIndex, cb) {
    const geometryInfo = {
      label: part.label,
      partMesh: part.object3D,
      object3D: root
    };
    geometryInfo[shapeGenerator.obbField] = part[shapeGenerator.obbField];
    PartGeoms.restoreOriginal(part);
    shapeGenerator.generateMissingGeometryForPart(geometryInfo, geomSpec,(err, obj) => {
      PartGeoms.restoreEnhanced(part);
      if (err) {
        console.error('Error generating shape', err);
        cb('Error generating shape');
      } else if (obj) {
        const geom = PartGeomsGen.addGeneratedGeomObject3D(root, part, geomSpecIndex, geomSpec, obj);
        console.log('generated', geom);
        cb(null, geom);
      } else {
        console.log('no missing geometry to generate');
        cb('No missing geometry to generate');
      }
    });
  }

  static generateGeometryFromShapeParamsForPart(shapeGenerator, root, part, shapeParams, geomSpec, geomSpecIndex, cb) {
    // Still need the geomSpec because that's what we keep
    const baseShapeGenerator = shapeGenerator.__shapeGenerator;
    baseShapeGenerator.generate(shapeParams, (err, obj) => {
      if (err) {
        console.error('Error generating shape', err);
        cb('Error generating shape');
      } else if (obj) {
        const geom = PartGeomsGen.addGeneratedGeomObject3D(root, part, geomSpecIndex, geomSpec, obj);
        console.log('generated', geom);
        cb(null, geom);
      } else {
        console.log('no missing geometry to generate');
        cb('No missing geometry to generate');
      }
    });
  }

  static generateGeometriesFromSpecForPart(shapeGenerator, root, part, geomSpecs, callback) {
    async.eachOfSeries(geomSpecs, function (geomSpec, index, cb) {
      const geomType = geomSpec.partType;
      const fullGeomSpec = _.merge({}, geomSpec, GeomTypeParams[geomType]);
      PartGeomsGen.generateGeometryFromSpecForPart(shapeGenerator, root, part, fullGeomSpec, index, (err, geom) => {
        cb(err, geom);
      });
    }, callback);
  }

  static generateGeometriesFromShapeParameters(shapeGenerator, root, part, geomSpecsAndShapeParams, callback) {
    async.eachOfSeries(geomSpecsAndShapeParams, function (g, index, cb) {
      PartGeomsGen.generateGeometryFromShapeParamsForPart(shapeGenerator, root, part, g.shape, g.spec, index, (err, geom) => {
        cb(err, geom);
      });
    }, callback);
  }

  static generateGeometries(shapeGenerator, root, parts, useShapeParameters, callback) {
    async.eachOfSeries(parts, function (part, iPart, cb) {
      if (part && part.geoms && part.geoms.length) {
        if (useShapeParameters) {
          PartGeomsGen.generateGeometriesFromShapeParameters(shapeGenerator, root, part, part.geoms, cb);
        } else {
          const geomSpecs = part.geoms.map(x => x.spec);
          PartGeomsGen.generateGeometriesFromSpecForPart(shapeGenerator, root, part, geomSpecs, cb);
        }
      } else {
        cb();
      }
    }, callback);
  }
}

PartGeomsGen.GeomTypes = GeomTypes;
PartGeomsGen.GeomTypeParams = GeomTypeParams;
PartGeomsGen.DefaultGeomTypeParams = MissingGeometryGenerator.DEFAULT_OPTIONS;

module.exports = PartGeomsGen;
