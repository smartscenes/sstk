class RefAxisSelectWidget {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.displayRadar = null;
    this.enabled = true;

    this.__raycaster = new THREE.Raycaster();
    this.__originalColor = null;
    this.__highlightColor = new THREE.Color('yellow');

    const scope = this;
    function onPointerDown(event) { return scope.onPointerDown(event); }
    function onPointerMove(event) { return scope.onPointerMove(event); }
    function onPointerUp(event) { return scope.onPointerUp(event); }

    function addEventListeners(element) {
      element.addEventListener('pointermove', onPointerMove, false);
      element.addEventListener('pointerdown', onPointerDown, false);
      element.ownerDocument.addEventListener( 'pointerup', onPointerUp, false );
    }

    function removeEventListeners(element) {
      element.addEventListener('pointermove', onPointerMove);
      element.addEventListener('pointerdown', onPointerDown);
      element.ownerDocument.removeEventListener( 'pointerup', onPointerUp );
    }

    // Expose functions
    this.addEventListeners = addEventListeners;
    this.removeEventListeners = removeEventListeners;
  }

  __getIntersected(event) {
    const rect = this.domElement.getBoundingClientRect();
    const pointer = event.changedTouches ? event.changedTouches[ 0 ] :  event;
    const pos = {
      x: (pointer.clientX - rect.left) / rect.width * 2 - 1,
      y: -(pointer.clientY - rect.top) / rect.height * 2 + 1
    }

    const raycaster = this.__raycaster;
    raycaster.setFromCamera(pos, this.camera);

    const intersects = raycaster.intersectObject(this.displayRadar.radarCircle, false );
    if (intersects && intersects.length) {
      return intersects[0];
    }
  }

  onPointerDown(event) {
    if (!this.enabled || !this.displayRadar) return;

    // move refline of displayRadar
    const intersected = this.__getIntersected(event);
    if (intersected) {
      const refDir = this.displayRadar.getRefAxisFromRadarCirclePoint(intersected.point);
      this.displayRadar.articulation.ref.copy(refDir);
      this.displayRadar.update();
      this.__highlightRadar(true);
    }
  }

  onPointerMove(event) {
    if (!this.enabled || !this.displayRadar) return;

    const intersected = this.__getIntersected(event);
    this.__highlightRadar(intersected && intersected.object === this.displayRadar.radarCircle);
  }

  onPointerUp(event) {

  }

  __highlightRadar(flag) {
    if (flag) {
      this.displayRadar.radarCircle.material.color.copy(this.__highlightColor);
    } else {
      this.displayRadar.radarCircle.material.color.copy(this.__originalColor);
    }

  }

  attach(displayRadar) {
    this.displayRadar = displayRadar;
    this.__originalColor = displayRadar.radarCircle.material.color.clone();
    this.addEventListeners(this.domElement);
  }

  detach() {
    if (this.displayRadar) {
      this.__highlightRadar(false);
      this.displayRadar = null;
    }
    this.removeEventListeners(this.domElement);
  }
}

module.exports = RefAxisSelectWidget;