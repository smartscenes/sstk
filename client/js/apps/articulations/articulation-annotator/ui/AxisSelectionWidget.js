class AxisSelectionWidget {
  constructor(selectElement, axisType) {
    this.selectElement = selectElement;
    this.axisType = axisType;
  }

  setAxisOptions(axisOptions, axisIndex, addCustom = false, filter) {
    this.axisOptions = axisOptions;
    const selectElement = this.selectElement;
    selectElement.empty();
    for (let i = 0; i < axisOptions.length; i++) {
      if (filter != null) {
        if (!filter(axisOptions[i], i)) {
          // Skip option
          continue;
        }
      }
      let selected = (axisIndex === i)? "selected":"";
      selectElement.append(`
				<option value="${i}" ${selected}>${axisOptions[i].label}: (
					${axisOptions[i].value.x.toFixed(5)},
					${axisOptions[i].value.y.toFixed(5)},
					${axisOptions[i].value.z.toFixed(5)})
				</option>`);
    }
    if (addCustom) {
      this.__setButton = $('<button hidden>Set</button>');
      this.__setButton.click(() => this.save());
      this.__cancelButton = $('<button hidden>Cancel</button>');
      this.__cancelButton.click(() => this.cancel());
      this.__changeButton = $('<button hidden>Change</button>');
      this.__changeButton.click(() => this.activateTransformControls());
      selectElement.append('<option value="custom">Add custom</option>');
      selectElement.parent().append(this.__changeButton);
      selectElement.parent().append(this.__setButton);
      selectElement.parent().append(this.__cancelButton);
      this.__updateButtonState(axisIndex);
    }
  }

  __updateButtonState(index) {
    this.__changeAxisIndex = null;
    if (this.__changeButton) {
      if (this.axisOptions[index].provenance === 'custom') {
        // Custom - allow editing
        this.__changeButton.removeAttr('hidden');
        this.__changeAxisIndex = index;
      } else {
        // Not custom - no editing
        this.__changeButton.attr('hidden', true);
      }
    }
  }

  change(callback) {
    this.__onChangeCallback = callback;
    this.selectElement.change(event => {
      this.state.resetWidgets();
      if (event.target.value === 'custom') {
        this.activateTransformControls();
      } else {
        const index = parseInt(event.target.value);
        this.__updateButtonState(index);
        callback(index);
      }
    });
    return this;
  }

  configure(app, state, articulation) {
    this.app = app;
    this.state = state;
    this.articulation = articulation;
  }

  getAxisInfo() {
    if (this.axisType === 'main') {
      return { axis: this.state.axis, index: this.state.axisIndex, node: this.state.displayAxis.node }
    } else if (this.axisType === 'ref') {
      return { axis: this.state.refAxis, index: this.state.refAxisIndex, node: this.state.displayRadar.refLine }
    } else {
      throw `Unsupported axis type ${this.axisType}`
    }
  }

  activateTransformControls() {
    if (this.state.activeWidget != this) {
      this.__setButton.removeAttr('hidden');
      this.__cancelButton.removeAttr('hidden');
      this.__changeButton.attr('hidden', true);

      this.__defaultCameraControlMouseMappings = this.app.controls.mouseMappings;
      this.app.controls.mouseMappings = [
        { action: this.app.controls.actions.PAN,    button: THREE.MOUSE.RIGHT, keys: ['shiftKey'] },
        { action: this.app.controls.actions.ORBIT,  button: THREE.MOUSE.RIGHT },
        { action: this.app.controls.actions.ZOOM,   button: THREE.MOUSE.MIDDLE }
      ];

      this.__oldArticulationAnimatorEnabled = this.app.articulationAnimator.enabled;
      this.app.articulationAnimator.enabled = false;
      this.app.articulationAnimator.setArticulationValue(this.state.activePart, this.articulation, this.articulation.defaultValue);
      this.__axisInfo = this.getAxisInfo();
      this.app.transformControls.attach(this.__axisInfo.node);
      this.state.activeWidget = this;
    }
  }

  deactivateTransformControls() {
    this.__setButton.attr('hidden', true);
    this.__cancelButton.attr('hidden', true);

    this.app.transformControls.detach();
    if (this.state.activeWidget == this) {
      this.state.activeWidget = null;
      this.app.articulationAnimator.enabled = this.__oldArticulationAnimatorEnabled;
      this.app.controls.mouseMappings = this.__defaultCameraControlMouseMappings;
      delete this.__defaultCameraControlMouseMappings;
      delete this.__oldArticulationAnimatorEnabled;
    }
  }

  cancel() {
    if (this.__axisInfo != null) {
      this.__onChangeCallback(this.__axisInfo.index);
      this.__axisInfo = null;
    }
    this.deactivateTransformControls();
  }

  save() {
    if (this.__axisInfo != null) {
      if (this.__changeAxisIndex == null) {
        const res = this.state.addCustomAxisOption(this.__axisInfo.axis.clone(), true);
        this.__onChangeCallback(res.index);
      } else {
        this.state.setCustomAxis(this.__changeAxisIndex, this.__axisInfo.axis);
        this.__onChangeCallback(this.__changeAxisIndex);
        this.__changeAxisIndex = null;
      }
    }
    this.deactivateTransformControls();
  }
}

module.exports = AxisSelectionWidget;