// Generic controls that hooksup to pointer (mouse) and touch events
const changeEvent = { type: 'change' };
const startEvent = { type: 'start' };
const endEvent = { type: 'end' };

const STATE = {
  NONE: - 1,
};

class PointerControls extends THREE.EventDispatcher {
  constructor(domElement) {
    super();

    this.domElement = domElement;

    // Set to false to disable this control
    this.enabled = true;
    // mapping of mouse actions
    // { action: this.actions.ROTATE, button: THREE.MOUSE.RIGHT, state: DragLookPointerControls.STATE.ROTATE }
    this.mouseMappings = [];


    // Set to false to disable use of the keys
    this.enableKeys = true;
    // Mapping of keys to actions
    this.__keymappings = null;
    // Set of current active actions
    this.__activeActions = null;

    this.__state = STATE.NONE;

    // Hookup events
    const scope = this;
    function onPointerDown(event) { return scope.onPointerDown(event); }
    function onPointerMove(event) { return scope.onPointerMove(event); }
    function onPointerUp(event) { return scope.onPointerUp(event); }
    function onTouchStart(event) { return scope.onTouchStart(event); }
    function onTouchMove(event) { return scope.onTouchMove(event); }
    function onTouchEnd(event) { return scope.onTouchEnd(event); }
    function onMouseWheel(event) { return scope.onMouseWheel(event); }
    function onKeyDown(event) { return scope.onKeyDown(event); }
    function onKeyUp(event) { return scope.onKeyUp(event); }
    function onContextMenu(event) { return scope.onContextMenu(event); }

    function addActivePointerEventListeners(element) {
      element.addEventListener('pointermove', onPointerMove, false);
      element.addEventListener('pointerup', onPointerUp, false);
    }

    function removeActivePointerEventListeners(element) {
      element.addEventListener('pointermove', onPointerMove, false);
      element.addEventListener('pointerup', onPointerUp, false);
    }

    function addKeyListeners(element) {
      element.addEventListener( 'keydown', onKeyDown, false );
      element.addEventListener( 'keyup', onKeyUp, false );
    }

    function removeKeyListeners(element) {
      element.addEventListener( 'keydown', onKeyDown, false );
      element.addEventListener( 'keyup', onKeyUp, false );
    }

    function addEventListeners(element) {
      element.addEventListener( 'contextmenu', onContextMenu, false );
      element.addEventListener( 'pointerdown', onPointerDown, false );
      element.addEventListener( 'wheel', onMouseWheel, false );

      element.addEventListener( 'touchstart', onTouchStart, false );
      element.addEventListener( 'touchend', onTouchEnd, false );
      element.addEventListener( 'touchmove', onTouchMove, false );

      if (scope.enableKeys) {
        addKeyListeners(element);
      }
    }

    function removeEventListeners(element) {
      element.removeEventListener( 'contextmenu', onContextMenu, false );
      element.removeEventListener( 'pointerdown', onPointerDown, false );
      element.removeEventListener( 'wheel', onMouseWheel, false );

      element.removeEventListener( 'touchstart', onTouchStart, false );
      element.removeEventListener( 'touchend', onTouchEnd, false );
      element.removeEventListener( 'touchmove', onTouchMove, false );

      removeKeyListeners(element);
    }

    // Expose functions
    this.addEventListeners = addEventListeners;
    this.removeEventListeners = removeEventListeners;
    this.addActivePointerEventListeners = addActivePointerEventListeners;
    this.removeActivePointerEventListeners = removeActivePointerEventListeners;
  }

  get keyMappings() {
    return this.__keymappings;
  }

  set keyMappings(mappings) {
    this.__keymappings = mappings;
  }

  get isActive() {
    return this.__state !== STATE.NONE;
  }

  dispose() {
    this.removeEventListeners(this.domElement);
    this.removeActivePointerEventListeners(this.domElement.ownerDocument);
  }

  handleMouseDownAction (event, mouseMapping) {
    // TODO: override
    if (mouseMapping && mouseMapping.state != null) {
      this.__state = mouseMapping.state;
      return true;
    }
  }

  handleMouseMove(event) {
    // TODO: override
  }

  handleMouseUp(event) {
    // TODO: override
  }

  handleMouseWheel(event) {
    // TODO: override
  }

  handleKeyDown(event) {
    // TODO: override
    if (this.__keymappings && this.__activeActions) {
      const action = this.__keymappings[event.code];
      if (action) {
        this.__activeActions[action] = true;
      }
    }
  }

  handleKeyUp(event) {
    // TODO: override
    if (this.__keymappings && this.__activeActions) {
      const action = this.__keymappings[event.code];
      if (action) {
        this.__activeActions[action] = false;
      }
    }
  }

  handleTouchStart(event) {
    // TODO: override
  }

  handleTouchMove(event) {
    // TODO: override
  }

  handleTouchEnd(event) {
    // TODO: override
  }

  // Event hookups
  onPointerDown( event ) {
    if (this.enabled === false ) return;
    switch (event.pointerType) {
      case 'mouse':
      case 'pen':
        return this.onMouseDown(event);
      // TODO touch
    }
  }

  onPointerMove(event) {
    if (this.enabled === false) return;

    switch (event.pointerType) {
      case 'mouse':
      case 'pen':
        return this.onMouseMove(event);
      // TODO touch

    }
  }

  onPointerUp(event) {
    switch (event.pointerType) {
      case 'mouse':
      case 'pen':
        return this.onMouseUp(event);
      // TODO touch
    }
  }

  onMouseDown(event) {
    if (this.enabled === false ) return;

    // Prevent the browser from scrolling.
    event.preventDefault();
    // AXC: more generic mouse mappings
    this.__state = STATE.NONE;
    for (let i = 0; i < this.mouseMappings.length; i++) {
      const mouseMapping = this.mouseMappings[i];

      // Check if mouse mapping activates
      let activated = mouseMapping.button === event.button;
      if (mouseMapping.keys && activated) {
        activated = false;
        for (let j = 0; j < mouseMapping.keys.length; j++) {
          const key = mouseMapping.keys[j];
          if (event[key]) {
            activated = true;
            break;
          }
        }
      }

      if (!activated) { continue; }

      const handled = this.handleMouseDownAction(event, mouseMapping);
      if (handled) {
        break;
      }
    }

    if ( this.__state !== STATE.NONE ) {
      this.addActivePointerEventListeners(this.domElement.ownerDocument);
      this.dispatchEvent( startEvent );
      return true;
    }
  }

  onMouseMove( event ) {
    if (this.enabled === false ) return;
    event.preventDefault();
    return this.handleMouseMove(event);
  }

  onMouseUp( event ) {
    this.removeActivePointerEventListeners(this.domElement.ownerDocument);

    if ( this.enabled === false ) return;

    this.handleMouseUp( event );
    this.dispatchEvent( endEvent );
    this.__state = STATE.NONE;
  }

  onMouseWheel(event) {
    if (this.enabled === false) return;

    event.preventDefault();
    event.stopPropagation();

    this.dispatchEvent( startEvent );
    this.handleMouseWheel( event );
    this.dispatchEvent( endEvent );
  }

  onKeyDown(event) {
    if (this.enabled === false || this.enableKeys === false) return;
    this.handleKeyDown( event );
  }

  onKeyUp(event) {
    if (this.enabled === false || this.enableKeys === false) return;
    this.handleKeyUp( event );
  }

  onTouchStart( event ) {
    if ( this.enabled === false ) return;
    event.preventDefault(); // prevent scrolling

    this.handleTouchStart(event);

    if ( this.__state !== STATE.NONE ) {
      this.dispatchEvent( startEvent );
      return true;
    }
  }

  onTouchMove( event ) {
    if ( this.enabled === false ) return;
    event.preventDefault(); // prevent scrolling
    event.stopPropagation();
    return this.handleTouchMove(event);
  }

  onTouchEnd( event ) {
    if ( this.enabled === false ) return;
    this.handleTouchEnd( event );
    this.dispatchEvent( endEvent );
    this.__state = STATE.NONE;
  }

  onContextMenu( event ) {
    if ( this.enabled === false ) return;
    event.preventDefault();
  }

}

// static properties are new
PointerControls.STATE = STATE;

module.exports = PointerControls;