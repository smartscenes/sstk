/**
 * @author Garrett Johnson / http://gkjohnson.github.io/
 * https://github.com/gkjohnson/urdf-exporter
 */

const ColladaExporter = require('exporters/ColladaExporter');
const GLTFExporter = require('exporters/GLTFExporter');
const OBJExporter = require('exporters/OBJMTLExporter');
const WaitPubSubMultiQueue = require('util/WaitPubSubMultiQueue');
const _ = require('util/util');

// THREE.js URDF Exporter
// http://wiki.ros.org/urdf/XML/

// export default
class URDFExporter {

  /**
   * Create a new URDFExporter
   * @param options {Object}
   * @param [options.fs] File system interface (specify if exporting to file system)
   */
  constructor(options) {
    options = options || {};
    this.__fs = options.fs;
    this.__waitPubSub = new WaitPubSubMultiQueue();
  }

  // joint func returns
  // {
  //   name
  //   type
  //   limit: { lower, upper, velocity, effort }
  //   axis
  //   isLeaf
  // }

  // mesh func returns
  // {
  //   name,
  //   ext,
  //   data
  // }

  get OBJExporter() {
    return this._objExporter = this._objExporter || new OBJExporter({ fs: this.__fs });
  }

  get GLTFExporter() {
    return this._gltfExporter = this._gltfExporter || new GLTFExporter({ fs: this.__fs });
  }

  get ColladaExporter() {
    return this._colladaExporter = this._colladaExporter || new ColladaExporter({ fs: this.__fs});
  }

  getMeshExporter(meshFormat, exportOpts) {
    if (meshFormat === 'obj') {
      return this.OBJExporter;
    } else if (meshFormat === 'dae') {
      exportOpts.textureDirectory = 'textures';
      return this.ColladaExporter;
    } else if (meshFormat === 'gltf' || meshFormat === 'glb') {
      exportOpts.binary = meshFormat === 'glb';
      exportOpts.embedImages = true;
      return this.GLTFExporter;
    }
  }

  // Makes the provided name unique.
  // 'map' is an object with keys of already taken names
  _makeNameUnique(name, map, appendNum = 0) {
    const normalized_name = name.replaceAll(':', '-').replaceAll('.', '_');
    const appendSuffix = (appendNum)? ('-' + appendNum) : '';
    const newName = `${ normalized_name }${ appendSuffix }`;
    return newName in map ? this._makeNameUnique(name, map, appendNum + 1) : newName;
  }

  // Fix duplicate slashes in a file path
  _normalizePackagePath(path) {
    return path
      .replace(/[\\/]+/g, '/')
      .replace(/^package:\/*/i, 'package://');
  }

  // The default callback for generating mesh data from a link
  _defaultMeshCallback(o, linkName, meshFormat, queue) {
    const id = _.generateRandomId();
    this.__waitPubSub.addWaiting(id, linkName, queue);
    const exportOpts = {
      name: linkName,
      // dir: 'meshes',  // AXC: TODO: put into meshes if not from web
      callback: () => {
        this.__waitPubSub.removeWaiting(id, queue);
      }
    };

    console.log('exporting mesh', linkName, meshFormat);
    const exporter = this.getMeshExporter(meshFormat, exportOpts);
    const res = exporter.export(o, exportOpts) || {};
    if (res.textures) {
      res.textures.forEach((tex, i) => {
        const newname = `${ linkName }-${ i }`;
        const nameregex = new RegExp(`${ tex.name }\\.${ tex.ext }`, 'g');
        if (res.data) {
          res.data = res.data.replace(nameregex, `${newname}.${tex.ext}`);
        }
        tex.name = newname;
      });
    }
    return {
      name: linkName,
      ext: meshFormat,
      data: res.data,
      textures: res.textures || []
    };
  }

  _base64ToBuffer(str) {

    const b = atob(str);
    const buf = new Uint8Array(b.length);

    for (var i = 0, l = buf.length; i < l; i++) {

      buf[i] = b.charCodeAt(i);

    }

    return buf;

  }

  // Convert a texture to png image data
  _imageToData(image, ext) {

    this._canvas = this._canvas || document.createElement('canvas');
    this._ctx = this._ctx || this._canvas.getContext('2d');

    const canvas = this._canvas;
    const ctx = this._ctx;

    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    ctx.drawImage(image, 0, 0);

    // Get the base64 encoded data
    const base64data = canvas
      .toDataURL(`image/${ ext }`, 1)
      .replace(/^data:image\/(png|jpg);base64,/, '');

    // Convert to a uint8 array
    return this._base64ToBuffer(base64data);

  }

  // Convert the urdf xml into a well-formatted, indented format
  _format(urdf) {

    const IS_END_TAG = /^<\//;
    const IS_SELF_CLOSING = /(\?>$)|(\/>$)/;
    const HAS_TEXT = /<[^>]+>[^<]*<\/[^<]+>/;

    const pad = (ch, num) => (num > 0 ? ch + pad(ch, num - 1) : '');

    let tagnum = 0;
    return urdf
      .match(/(<[^>]+>[^<]+<\/[^<]+>)|(<[^>]+>)/g)
      .map(tag => {

        if (!HAS_TEXT.test(tag) && !IS_SELF_CLOSING.test(tag) && IS_END_TAG.test(tag)) {

          tagnum--;

        }

        const res = `${ pad('  ', tagnum) }${ tag }`;
        if (!HAS_TEXT.test(tag) && !IS_SELF_CLOSING.test(tag) && !IS_END_TAG.test(tag)) {

          tagnum++;

        }

        return res;

      })
      .join('\n');

  }

  // Remove any unnecessary joints and links that fixed and have identity transforms
  _collapseLinks(urdf) {

    console.warn('URDFExporter : The "collapse" functionality isn\'t stable and my corrupt the structure of the URDF');

    const xmlDoc = (new DOMParser()).parseFromString(urdf, 'text/xml');
    const robottag = xmlDoc.children[0];

    // cache the children as an array
    const children = [...robottag.children];

    // get the list of links indexed by name
    const links = children.filter(t => t.tagName.toLowerCase() === 'link');
    const joints = children.filter(t => t.tagName.toLowerCase() === 'joint');

    // find the link
    const root = links
      .map(l => l.getAttribute('name'))
      .filter(linkName => {

        const childReferences = joints.filter(j => j.querySelector('child').getAttribute('link') === linkName);
        return childReferences.length === 0;

      })[0];

    const linksMap = {};
    links.forEach(l => linksMap[l.getAttribute('name')] = l);

    // TODO: Do we need to traverse in reverse so as nodes are removed, they're taken into
    // account in subsequent collapses? Order is important here.
    joints.forEach(j => {

      const origin = [...j.children].filter(t => t.tagName.toLowerCase() === 'origin')[0];
      const type = j.getAttribute('type') || 'fixed';

      // if the node is fixed and has an identity transform then we can remove it
      const xyz = origin.getAttribute('xyz') || '0 0 0';
      const rpy = origin.getAttribute('rpy') || '0 0 0';
      if (type === 'fixed' && (!origin || (xyz === '0 0 0' && rpy === '0 0 0'))) {

        const childName =
          [...j.children]
            .filter(t => t.tagName.toLowerCase() === 'child')[0]
            .getAttribute('link');

        const parentName =
          [...j.children]
            .filter(t => t.tagName.toLowerCase() === 'parent')[0]
            .getAttribute('link');

        // how many child joints reference the same joint as this parent
        const parentsChildren =
          joints.filter(j2 =>
            [...j.children]
              .filter(t => t.tagName.toLowerCase() === 'parent')
              .filter(t => t.getAttribute('link') === parentName)
              .length !== 0
          ).length;

        // collapse the node if
        // 1. The link we'll be removing has no children so there will be no effect
        // 2. The link has children (like a visual node) making it meaningful AND there are
        // no other joints that reference this parent link, so we can move the meaningful
        // information into there

        // TODO: Consider just removing the parent node instead of the child node if the child
        // node has children. We should just remove the least complicated link.
        if (linksMap[parentName].children.length === 0 || (linksMap[childName].children.length !== 0 && parentsChildren === 1)) {

          if (linksMap[childName].children.length) {

            [...linksMap[childName].children].forEach(c => linksMap[parentName].appendChild(c));

          }

          // find joints that have this joint as the parent and move it to the parent
          joints.forEach(j2 =>
            [...j2.children]
              .filter(t => t.tagName.toLowerCase() === 'parent')
              .filter(t => t.getAttribute('link') === childName)
              .forEach(t => t.setAttribute('link', parentName))
          );

          // remove this joint from the robot
          robottag.removeChild(j);

        }

      }

    });

    // remove any links that arent referenced by the existing joints
    [...robottag.children]
      .filter(t => t.tagName.toLowerCase() === 'joint')
      .forEach(j => {

        const childName =
          [...j.children]
            .filter(t => t.tagName.toLowerCase() === 'child')[0]
            .getAttribute('link');

        const parentName =
          [...j.children]
            .filter(t => t.tagName.toLowerCase() === 'parent')[0]
            .getAttribute('link');

        delete linksMap[childName];
        delete linksMap[parentName];

      });

    // the links remaining aren't being referenced by any
    // joints and can be removed
    Object
      .keys(linksMap)
      .filter(n => n !== root)
      .forEach(n => robottag.removeChild(linksMap[n]));

    return new XMLSerializer().serializeToString(xmlDoc.documentElement);

  }

  // AXC: export to file
  _outputFile(fs, outdir, relname, result, onDoneCallback) {
    if (fs) {
      const name = (relname != undefined)? relname : 'scene';
      const dir = (outdir != undefined)? outdir + '/' : '';
      const filename = dir + name + '.urdf';
      fs.writeToFile(filename, result.data, function (err, res) {
        fs.fsExportFile(filename, filename);
        if (onDoneCallback) onDoneCallback(result);
      });
    } else {
      if (onDoneCallback) onDoneCallback(result);
    }
  }

  // Convert the object into a urdf and get the associated
  // mesh and texture data
  parse(object, jointfunc, onComplete, options = {}) {

    options = Object.assign({

      createMeshCb: this._defaultMeshCallback.bind(this),
      pathPrefix: './',
      collapse: false,
      meshFormat: 'glb',
      robotName: object.name,

    }, options);

    const queue = _.generateRandomId(); // AXC: task queue id for callbacks
    const linksMap = new WeakMap(); // object > name
    const texMap = new WeakMap(); // texture > image data
    const meshes = []; // array of meshes info to save
    const textures = []; // array of texture info to save

    // used link and joint names
    const linksNameMap = {};
    const jointsNameMap = {};

    // file contents
    let urdf = `<robot name="${ options.robotName }">`;
    const jointPosition = new THREE.Vector3();

    // use a custom travers function instead of Object3D.traverse so we
    // can stop the traversal early if we have to.
    const traverse = child => {

      const linkName = this._makeNameUnique(child.name || `_link_`, linksNameMap);
      linksNameMap[linkName] = true;
      linksMap.set(child, linkName);

      // Create the link tag
      let joint = '';
      let link = `<link name="${ linkName }">`;
      let isLeaf = false;
      let origin;

      // Create the joint tag if it's not the root object that we're exporting
      if (child !== object) {

        const parentName = linksMap.get(child.parent);
        const jointInfo = jointfunc(child, linkName, parentName) || {};
        const { axis, type, name, limit } = jointInfo;
        origin = jointInfo.origin;
        const jointType = type || 'fixed';
        isLeaf = !!jointInfo.isLeaf;

        const jointName = this._makeNameUnique(name || (jointType + '_joint'), jointsNameMap);
        jointsNameMap[jointName] = true;

        joint = `<joint name="${ jointName }" type="${jointType}">`;
        {
          //const pos = child.position.toArray().join(' ');
          jointPosition.copy(child.position);
          if (origin) {
            jointPosition.add(origin);
          }
          const pos = jointPosition.toArray().join(' ');

          // URDF uses fixed-axis rotations, while THREE uses moving-axis rotations
          const euler = child.rotation.clone();
          euler.reorder('ZYX');

          // The last field of the array is the rotation order 'ZYX', so
          // remove that before saving
          const array = euler.toArray();
          array.pop();

          const rot = array.join(' ');

          joint += `<origin xyz="${ pos }" rpy="${ rot }" />`;

          joint += `<parent link="${ parentName }" />`;

          joint += `<child link="${ linkName }" />`;

          if (axis) {

            joint += `<axis xyz="${ axis.x } ${ axis.y } ${ axis.z }" />`;

          }

          if (limit) {

            let limitNode = `<limit velocity="${ limit.velocity || 0 }" effort="${ limit.effort || 0 }"`;
            if (limit.lower != null) {

              limitNode += ` lower="${ limit.lower }"`;

            }

            if (limit.upper != null) {

              limitNode += ` upper="${ limit.upper }"`;

            }

            limitNode += ' ></limit>';
            joint += limitNode;

          }

        }
        joint += '</joint>';

      }

      // Try to add a mesh if this node is a mesh or the current
      // link should be considered a leaf and traversal is stopped
      if (child instanceof THREE.Mesh || isLeaf) {

        // TODO: Some deduping should be happening here
        // Issue #9
        const meshInfo = options.createMeshCb(child, linkName, options.meshFormat, queue);

        if (meshInfo != null) {

          // put the meshes in the `mesh` directory and the
          // textures in the same directory.
          meshInfo.directory = 'meshes/';
          meshInfo.textures.forEach(t => {

            t.directory =
              `${ meshInfo.directory }${ t.directory || '' }`
                .replace(/\\/g, '/')
                .replace(/\/+/g, '/');

          });

          meshes.push(meshInfo);
          if (meshInfo.textures) {

            textures.push(...meshInfo.textures);

          }

          // Create the visual node based on the meshInfo
          link += '<visual>';
          {

            const vorigin = origin? origin.clone().negate().toArray().join(' ') : "0 0 0";

            link += `<origin xyz="${vorigin}" rpy="0 0 0" />`;

            link += '<geometry>';
            {

              const meshpath = this._normalizePackagePath(`${ options.pathPrefix }${ meshInfo.directory }${ meshInfo.name }.${ meshInfo.ext }`);
              link += `<mesh filename="${ meshpath }" scale="${ child.scale.toArray().join(' ') }" />`;

            }
            link += '</geometry>';

            if (meshInfo.material) {

              link += '<material name="">';
              {

                if (meshInfo.material.color || meshInfo.material.opacity != null) {

                  const col = meshInfo.material.color;
                  const opacity = meshInfo.material.opacity;

                  const colStr = col ? `${ col.r } ${ col.g } ${ col.b }` : '1 1 1';
                  const opacityStr = opacity != null ? opacity : 1;

                  const rgba = `${ colStr } ${ opacityStr }`;

                  link += `<color rgba="${ rgba }" />`;

                }

                if (meshInfo.material.texture) {

                  let texInfo = texMap.get(meshInfo.material.texture);
                  if (!texInfo) {

                    const ext = 'png';
                    texInfo = {
                      directory: 'textures/',
                      name: meshInfo.name,
                      ext,
                      data: this._imageToData(meshInfo.material.texture.image, ext),
                      original: meshInfo.material.texture,
                    };
                    texMap.set(meshInfo.material.texture, texInfo);
                    textures.push(texInfo);

                  }

                  const texpath = this._normalizePackagePath(`${ options.pathPrefix }textures/${ texInfo.name }.${ texInfo.ext }`);
                  link += `<texture filename="${ texpath }" />`;

                }

              }
              link += '</material>';

            }

          }
          link += '</visual>';

        }

        // TODO: add matching collision

      }

      link += '</link>';

      urdf += link;
      urdf += joint;

      // traverse all the children if this link
      // isn't considered a leaf
      if (!isLeaf) {
        child.children.forEach(c => traverse(c));
      }
    };

    // traverse the object
    traverse(object);

    urdf += '</robot>';

    // format the final output
    const finalurdf = this._format(options.collapse ? this._collapseLinks(urdf) : urdf);

    const result = { data: finalurdf, meshes, textures };

    // AXC: export to file
    const onAllDone = (result) => {
      this.__waitPubSub.waitQueueEmpty(queue,() => {
        if (onComplete) onComplete(result);
      });
    }
    this._outputFile(this.__fs, options.dir, options.name, result, onAllDone);

    return result;
  }

  // AXC: added export
  /**
   * Export object as URDF
   * @param input {THREE.Object3D}
   * @param options {Object} Options on how to export the object
   * @param [options.meshFormat='glb'] {string}
   * @param [options.pathPrefix='./'] {string}
   * @param [options.collapse=false] {boolean}
   * @param [options.robotName=input.name] {string}
   * @param [options.jointFunc] {function}
   * @param [options.createMeshCb] {function}
   * @param [options.callback] {function}
   */
  export(input, options) {
    // Assumes one joint per child / parent
    // NOTE: assume origin is position (so may need to do some shifting)
    const defaultJointFunc = (child, linkName, parentName) => {
      if (child.userData.articulation) {
        const art = child.userData.articulation;
        const limit = (art.rangeMin != null || art.rangeMax != null)?
          { upper: art.rangeMax, lower: art.rangeMin } : undefined;
        let origin;
        let artType = null;
        if (art.type === 'translation') {
          artType = 'prismatic';
        } else if (art.type === 'rotation') {
          artType = limit? 'continuous' : 'revolute';
          origin = new THREE.Vector3(...art.origin)
        }
        if (artType) {
          return {
            name: linkName,
            type: artType,
            axis: new THREE.Vector3(...art.axis),
            origin: origin,
            limit: limit
          };
        } else {
          console.warn('Ignore articulation with unsupported type', art);
        }
      }
    }
    const jointFunc = (options && options.jointFunc)? options.jointFunc : defaultJointFunc;
    const onComplete = (options && options.callback)? (res) => options.callback(null, res) : null;
    this.parse(input, jointFunc, onComplete, options);
  }
}

module.exports = URDFExporter;