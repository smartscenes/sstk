const BaseOBJPartLoader = require('loaders/OBJPartLoader');
const Part = require('parts/Part');
const PartHierarchy = require('parts/PartHierarchy');
const _ = require('util/util');

/**
 * Loader for part annotations that consists of a json file describing the part hierarchy with pointers to obj files
 * @param params
 * @constructor
 * @memberOf loaders
 */
function OBJPartLoader(params) {
  params.meshPath =  params.meshPath || 'part_objs/';
  BaseOBJPartLoader.call(this, params);
}

OBJPartLoader.prototype = Object.create(BaseOBJPartLoader.prototype);
OBJPartLoader.prototype.constructor = OBJPartLoader;

OBJPartLoader.prototype.parse = function(data) {
  const json = JSON.parse(data);
  const tree = new PartHierarchy(json);
  let index = 0;
  const partHierarchy = tree.convert(n => {
    const part = new Part(index, null, n.dof_name, null, null);
    part.filename = (n.dof_name === 'dof_rootd')? 'none_motion' : n.dof_name;
    // motion_type is translation, rotation, spiral, and none
    if (n.motion_type && n.motion_type !== 'none') {
      const articulation = {type: n.motion_type, axis: n.direction, origin: n.center};
      // AXS: Arbitrary ranges for shape2motion based on javascript code
      if (n.motion_type === 'translation') {
        articulation.rangeMin = 0;
        articulation.rangeMax = 0.005*60;
        part.articulation = [articulation];
      } else if (n.motion_type === 'rotation') {
        articulation.rangeMin = 0;
        articulation.rangeMax = 60*Math.PI/180;
        part.articulation = [articulation];
      } else if (n.motion_type === 'spiral') {
        const art2 = _.clone(articulation);
        articulation.type = 'translation';
        articulation.rangeMin = 0;
        articulation.rangeMax = 0.005*60;
        art2.type = 'rotation';
        art2.rangeMin = 0;
        art2.rangeMax = 60*Math.PI/180;
        part.articulation = [articulation, art2];
      }
    }
    index++;
    return part;
  });
  return partHierarchy;
};

module.exports = OBJPartLoader;