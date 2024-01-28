const MeshHelpers = require("geo/MeshHelpers");
const Object3DUtil = require('geo/Object3DUtil');
const Materials = require('materials/Materials');

class PartVisualizer {
  constructor(scene, object3D, parts) {
    this.scene = scene;
    this.parts = parts;
    this.object3D = object3D;

    this.groupNode = new THREE.Group();
    this.scene.add(this.groupNode);
    // Debug node
    this.debugNode = new THREE.Group();
    this.groupNode.add(this.debugNode);
    // Visualization node
    this.vizNode = new THREE.Group();
    this.groupNode.add(this.vizNode);
    if (object3D) {
      this.groupNode.applyMatrix4(object3D.matrix);
    }

    // Create some groups for our obb nodes
    this.worldObbsNode = new THREE.Group();
    this.worldObbsNode.name = 'WorldOBBs';
    this.scene.add(this.worldObbsNode);
    this.localObbsNode = new THREE.Group();
    this.localObbsNode.name = 'LocalOBBs';
    this.groupNode.add(this.localObbsNode);
  }

  /* Functions to show part obbs */
  showPartObbs(useWorld) {
    const obbField = useWorld? 'obbWorld' : 'obb';
    const obbsNode = useWorld? this.worldObbsNode : this.localObbsNode;
    const color = useWorld? 'red' : 'blue';
    obbsNode.visible = true;
    //Object3DUtil.removeAllChildren(obbsNode);
    if (obbsNode.children.length === 0) {
      this.parts.forEach(p => {
        if (p) {
          const partObb = new MeshHelpers.OBB(p[obbField], color);
          if (partObb) {
            const partObbWf = partObb.toWireFrame(0.01, true, null, false, false);
            obbsNode.add(partObbWf);
          }
        }
      });
    }
  }

  hidePartObbs(useWorld) {
    const obbsNode = useWorld? this.worldObbsNode : this.localObbsNode;
    obbsNode.visible = false;
  }

  __traversePartMeshes(part, cb) {
    // Parts may have multiple meshes (e.g. generated geometry)
    Object3DUtil.traverse(part.object3D, function(p) {
      if (p.userData.pid != null && p.userData.pid !== part.pid && p !== part.object3D) {
        return false;
      } else if (p instanceof THREE.Mesh) {
        // Handle part meshes
        cb(p);
        return false;
      } else {
        return true;
      }
    });

  }

  /* Color parts */

  /**
   * Color part
   * @param part {parts.Part}
   * @param color Color to apply to the part
   * @param opacity opacity to apply to the part
   */
  colorPart(part, color, opacity = 1) {
    // Parts may have multiple meshes (e.g. generated geometry)
    this.__traversePartMeshes(part, (p) => {
      const materials = Object3DUtil.getMeshMaterials(p);
      materials.forEach(m => m.color.copy(color));
      materials.forEach(m => m.opacity = opacity);
      materials.forEach(m => m.transparent = (opacity < 1));
    });
  }

  setMaterialSide(side) {
    this.parts.forEach(p => Object3DUtil.setMaterialSide(p.object3D, side));
  }

  restorePartMaterial(part, matName, useDoubleSided) {
    // Parts may have multiple meshes (e.g. generated geometry)
    this.__traversePartMeshes(part, (p) => {
      if (p.cachedData && p.cachedData[matName]) {
        p.material = p.cachedData[matName];
      } else {
        console.log('Cannot find cached material', matName);
      }
    });
    this.setMaterialSide(useDoubleSided? THREE.DoubleSide : THREE.FrontSide);
  }

  restoreMaterial(matName) {
    this.parts.forEach((p) => this.restorePartMaterial(p, matName));
  }

  restorePartColor(part, opacity) {
    // Parts may have multiple meshes (e.g. generated geometry)
    this.__traversePartMeshes(part, (p) => {
      if (p.cachedData && p.cachedData.origMaterial) {
        const origMaterials = Materials.toMaterialArray(p.cachedData.origMaterial);
        const materials = Object3DUtil.getMeshMaterials(p);
        if (origMaterials.length === materials.length) {
          for (let i = 0; i < materials.length; i++) {
            materials[i].color.copy(origMaterials[i].color);
          }
        }
        materials.forEach(m => m.opacity = opacity);
        materials.forEach(m => m.transparent = (opacity < 1));
      }
    });
  }

  restoreColor(opacity) {
    this.parts.forEach((p) => this.restorePartColor(p, opacity));
  }

  static initObject3DMaterials(object3D, mat) {
    Object3DUtil.saveMaterials(object3D);
    Object3DUtil.traverse(object3D, function(p) {
      if (p instanceof THREE.Mesh) {
        p.material = Materials.cloneMaterial(p.material);
      }
      return true;
    });
    Object3DUtil.saveMaterials(object3D, false, 'texturedMaterial');
    Object3DUtil.applyMaterial(object3D, mat);
    Object3DUtil.saveMaterials(object3D, false, 'coloredMaterial');
 }

 static initPartMaterials(part, object3D, color, side) {
   const simpleMaterial = Object3DUtil.getSimpleFalseColorMaterial(part.pid, color, null, side);
   PartVisualizer.initObject3DMaterials(object3D || part.object3D, simpleMaterial);
 }
}

module.exports = PartVisualizer;