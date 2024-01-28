const UIUtil = require('ui/UIUtil');
const ConfigControls = require('ui/DatConfigControls');
const Dialog = require('./Dialog');
const PartGeoms = require('parts/PartGeoms');
const PartGeomsGen = require('parts/PartGeomsGen');
const _ = require('util/util');

class PartGeomUI extends Dialog {
  constructor(part, root, options) {
    super(options.container, true, false);
    this.part = part;
    this.root = root;
    this.maxGeoms = (options.maxGeoms != null)? options.maxGeoms : null;
    this.__addBtn = null;
    this.__geomSpecConfigs = {};
  }

  __getSpec(geomIndex, div) {
    const geomType = div.find('select').val();
    const key = geomIndex + '-' + geomType;
    const geomSpecConfig = this.__geomSpecConfigs[key];
    const geomSpec = { type: geomType };
    if (geomSpecConfig) {
      const fields = PartGeomsGen.GeomTypeParams[geomType];
      for (let k in fields) {
        const v = geomSpecConfig.config[k];
        if (geomSpecConfig.config['auto-' + k]) {
          // skip this field
        } else {
          geomSpec[k] = v;
        }
      }
    } else {
      _.merge(geomSpec, PartGeomsGen.GeomTypeParams[geomType]);
    }
    console.log('got geomSpec', geomSpec);
    return geomSpec;
  }

  __updateGeomSpecOptions(geomIndex, div, geomType) {
    const geomSpecDiv = div.find('.part-geom-options');
    const fields = PartGeomsGen.GeomTypeParams[geomType];
    const defaults = PartGeomsGen.DefaultGeomTypeParams[geomType];
    const key = geomIndex + '-' + geomType;
    geomSpecDiv.empty();
    if (this.__geomSpecConfigs[key]) {
      this.__geomSpecConfigs[key].reattach();
    } else {
      const options = [];
      for (let k in fields) {
        const v = fields[k];
        const defaultValue = (v != null)? v : defaults[k];
        if (v == null) {
          const name = 'auto-' + k;
          options.push({name: name, defaultValue: true});
        }
        options.push({name: k, defaultValue: defaultValue, disabled: true});
      }
      //console.log('geom spec config', options);
      this.__geomSpecConfigs[key] = new ConfigControls({
        container: geomSpecDiv,
        options: options
      });
    }
    return this.__geomSpecConfigs[key];
  }

  __createGeomOptions(geom, index, editable) {
    const sec = $('<div class="antn-dialog-section"></div>');
    const div = $('<div class="antn-dialog-option splay-option"></div>');
    div.append(`Geom ${index}`);
    div.append('<label>Type</label>');
    if (editable) {
      const geomOptions = $('<div class="part-geom-options"></div>');
      const select = UIUtil.createSelect(PartGeomsGen.GeomTypes, geom.type);
      div.append(select);
      div.append(geomOptions);
      this.__updateGeomSpecOptions(index, div, geom.type);
      select.change(() => this.__updateGeomSpecOptions(index, div, select.val()));
      const updateBtn = $('<button class="part-geom-button"><i class="fas fa-sync"></i></button>');
      updateBtn.click(() => {
        const spec = this.__getSpec(index, div);
        this.__updateGeom(geom, index, spec);
      });
      div.append(updateBtn);
      const deleteBtn = $('<button class="part-geom-button"><i class="fas fa-times-circle"></i></button>');
      deleteBtn.click(() => {
        this.__deleteGeom(geom, index);
      });
      div.append(deleteBtn);
    } else {
      div.append(geom.type);
    }
    sec.append(div);
    return sec;
  }

  __createMessage(message) {
    const sec = $('<div class="antn-dialog-section"></div>');
    const div = $('<div class="antn-dialog-option splay-option"></div>').append(message);
    sec.append(div);
    return sec;
  }

  __createAddGeomButton() {
    return $('<div class="antn-dialog-button add-btn">Add</div>');
  }

  __addGeom() {
    const defaultType = (this.part.label === 'drawer' || this.part.partLabel === 'drawer')? 'drawer' :  'panel';
    const geomSpec = { type: defaultType };
    _.merge(geomSpec, PartGeomsGen.GeomTypeParams[defaultType]);
    this.__createGeometry(geomSpec, null, (err, res) => {
      if (err) {
      } else {
        const content = this.getContentDiv();
        const numGeoms = this.part.geoms.length;
        if (numGeoms === 1) {
          content.empty();
        }
        const div = this.__createGeomOptions(geomSpec, this.part.geoms.length - 1, true);
        content.append(div);
        if (numGeoms >= this.maxGeoms) {
          this.__addBtn.hide();
        }
        this.Publish('addGeom', res);
      }
    });
  }

  __updateGeom(geom, index, spec) {
    this.__createGeometry(spec, index, (err, res) => {
      if (err) {

      } else {
        this.Publish('updateGeom', res, index);
      }
    });
  }

  __deleteGeom(geom, index) {
    PartGeoms.removeGeom(this.part, index);
    this.__refreshGeomPanel();
    if (this.part.geoms.length < this.maxGeoms) {
      this.__addBtn.show();
    }
    this.Publish('deleteGeom', geom);
  }

  __refreshGeomPanel() {
    const content = this.getContentDiv();
    content.empty();
    if (this.part.geoms.length) {
      for (let i = 0; i < this.part.geoms.length; i++) {
        // Show geom
        const geom = this.part.geoms[i];
        const div = this.__createGeomOptions(geom.spec, i, this.editable);
        content.append(div);
      }
    } else {
      content.append(this.__createMessage('No extra part geometry'));
    }
  }

  create() {
    const dialog = super.create(`Part: ${this.part.name}`);
    this.part.geoms = this.part.geoms || [];
    this.__refreshGeomPanel();
    if (this.editable) {
      const addbtn = this.__createAddGeomButton();
      addbtn.click(() => this.__addGeom());
      this.getButtonsDiv().prepend(addbtn);
      this.__addBtn = addbtn;
    }
    this.onCancel(() => this.close());
    return dialog;
  }

  getAddBtn() {
    return this.__addBtn;
  }

  // Geometry generation
  __createGeometry(geomSpec, index, cb) {
    if (!this.__shapeGenerator) {
      this.__shapeGenerator = PartGeomsGen.getShapeGenerator();
    }
    const part = this.part;
    console.log('generate geometry for part', part);
    console.log('got ', geomSpec);
    this.Publish('preGenerateGeometry', part);
    PartGeomsGen.generateGeometryFromSpecForPart(this.__shapeGenerator, this.root, part, geomSpec, index, (err, geom) => {
      this.Publish('postGenerateGeometry', part, geom);
      cb(err, geom);
    });
  }

}

module.exports = PartGeomUI;