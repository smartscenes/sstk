class InstancePoints {
  constructor(pointSize, parent) {
    this.pointSize = pointSize;
    // Geometry for point based instances
    this.pointInstancesGroup = parent || new THREE.Group();
    this.pointInstancesMap = new Map();
  }

  __createPointInstance(pointInstance) {
    const sphereGeometry = new THREE.SphereGeometry(this.pointSize, 100, 80, 0, 2 * Math.PI);
    const material = InstancePoints.MATERIALS.HOVER;
    const sphereMesh = new THREE.Mesh(sphereGeometry, material);
    sphereMesh.position.copy(pointInstance.point3d);
    sphereMesh.name = 'ObjectInstance-' + pointInstance.id;
    sphereMesh.userData.id = pointInstance.id;
    sphereMesh.userData.type = pointInstance.type;
    return sphereMesh;
  }

  highlight(pointInstanceIds, maskAnnotations) {
    //console.log('highlightPointInstances', pointInstanceIds);
    pointInstanceIds = (pointInstanceIds == null)? [] : (Array.isArray(pointInstanceIds)? pointInstanceIds : [pointInstanceIds]);
    let hovered = 0;
    this.pointInstancesMap.forEach((object3d, id) => {
      if (pointInstanceIds.indexOf(id) >= 0) {
        object3d.material = InstancePoints.MATERIALS.SELECTED;
        hovered++;
      } else {
        // TODO: deduplicate logic here and in InstanceMasks
        const hasAssignedObjects = maskAnnotations? maskAnnotations.hasAssignedObjects(id) : false;
        //const hasComments = maskAnnotations.hasComment(id);
        if (object3d.userData.isSelected) {
          object3d.material = InstancePoints.MATERIALS.SELECTED;
        } else if (hasAssignedObjects) {
          object3d.material = InstancePoints.MATERIALS.ASSIGNED;
        // } else if (hasComments) {
        //   object3d.material = InstancePoints.MATERIALS.COMMENTED;
        } else {
          object3d.material = InstancePoints.MATERIALS.UNANNOTATED;
        }
      }
    });
    return hovered;
  }

  select(pointInstanceIds) {
    console.log('selectPointInstances', pointInstanceIds);
    pointInstanceIds = (pointInstanceIds == null)? [] : (Array.isArray(pointInstanceIds)? pointInstanceIds : [pointInstanceIds]);
    let selected = 0;
    this.pointInstancesMap.forEach((object3d, id) => {
      object3d.userData.isSelected = pointInstanceIds.indexOf(id) >= 0;
      if (object3d.userData.isSelected) {
        selected++;
      }
    });
    return selected;
  }

  update(pointInstancesArray) {
    const oldPointIds = [...this.pointInstancesMap.keys()];
    const newPointIds = new Set();
    const pointInstancesMap = this.pointInstancesMap;
    for (let pointInstance of pointInstancesArray) {
      newPointIds.add(pointInstance.id);
      if (!pointInstancesMap.has(pointInstance.id)) {
        const p = this.__createPointInstance(pointInstance);
        pointInstancesMap.set(pointInstance.id, p);
        this.pointInstancesGroup.add(p);
      } else {
        const p = pointInstancesMap.get(pointInstance.id);
        if (!p.position.equals(pointInstance)) {
          p.position.copy(pointInstance.point3d);
          p.updateMatrix();
        }
      }
    }
    for (let id of oldPointIds) {
      if (!newPointIds.has(id)) {
        const p = pointInstancesMap.get(id);
        pointInstancesMap.delete(id);
        this.pointInstancesGroup.remove(p);
        p.geometry.dispose();
      }
    }
    // console.log('got points', pointInstancesArray, this.pointInstancesMap, this.pointInstancesGroup);
  }
}

InstancePoints.MATERIALS = {
  UNANNOTATED: new THREE.MeshBasicMaterial( { color: new THREE.Color('red'), opacity: 0.8, transparent: true,
    side: THREE.DoubleSide, blending: THREE.CustomBlending, depthFunc: THREE.AlwaysDepth }),
  ASSIGNED: new THREE.MeshBasicMaterial( { color: new THREE.Color('green'), opacity: 0.8, transparent: true,
    side: THREE.DoubleSide, blending: THREE.CustomBlending, depthFunc: THREE.AlwaysDepth }),
  // Note used: no need to have a point with a comment
  // COMMENTED: new THREE.MeshBasicMaterial( { color: new THREE.Color('blue'), opacity: 0.8, transparent: true,
  //   side: THREE.DoubleSide, blending: THREE.CustomBlending, depthFunc: THREE.AlwaysDepth }),
  HOVER: new THREE.MeshBasicMaterial( { color: new THREE.Color('yellow'), opacity: 0.8, transparent: true,
    side: THREE.DoubleSide, blending: THREE.CustomBlending, depthFunc: THREE.AlwaysDepth }),
  SELECTED: new THREE.MeshBasicMaterial( { color: new THREE.Color('orange'), opacity: 0.8, transparent: true,
    side: THREE.DoubleSide, blending: THREE.CustomBlending, depthFunc: THREE.AlwaysDepth })
};

module.exports = InstancePoints;
