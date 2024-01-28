const AxisOptions = require('../AxisOptions');
const RefAxisSelectWidget = require('./RefAxisSelectWidget');

class AxisSelectionWidget {
  /**
   *
   * @param selectElement {jquery} Element to which the axis selection widget will be created in
   * @param axisType {string} Axis type (main|ref)
   * @param filterAxisOptions {function} function to filter out inappropriate axis options
   */
  constructor(selectElement, axisType, filterAxisOptions) {
    this.__selectElement = selectElement;
    this.axisType = axisType;
    this.__filterAxisOptions = filterAxisOptions;
  }

  __addAxisOption(selectElement, axisOption, index, isSelected) {
    const selected = isSelected? "selected":"";
    selectElement.append(`
				<option value="${index}" ${selected}>${axisOption.label}: (
					${axisOption.value.x.toFixed(5)},
					${axisOption.value.y.toFixed(5)},
					${axisOption.value.z.toFixed(5)})
				</option>`);
  }

  __addCustomAxisOption(selectElement, axisOption, index, isSelected) {
    const selected = isSelected? "selected":"";
    const last = selectElement.find('option').last();
    $(`<option value="${index}" ${selected}>${axisOption.label}: (
					${axisOption.value.x.toFixed(5)},
					${axisOption.value.y.toFixed(5)},
					${axisOption.value.z.toFixed(5)})
				</option>`).insertBefore(last);
  }

  /**
   * Configure axis options
   * @param axisOptions {AxisOption[]} Array of axis options
   * @param axisIndex {int} selected axis index
   * @param addCustom {boolean} whether to allow for custom axis selection
   */
  setAxisOptions(axisOptions, axisIndex, addCustom = false) {
    this.axisOptions = axisOptions;
    const filter = this.__filterAxisOptions;
    const selectElement = this.__selectElement;
    selectElement.empty();
    for (let i = 0; i < axisOptions.length; i++) {
      if (filter != null) {
        if (!filter(axisOptions[i], i)) {
          // Skip option
          continue;
        }
      }
      const isSelected = (axisIndex === i);
      this.__addAxisOption(selectElement, axisOptions[i], i, isSelected);
    }
    if (addCustom) {
      if (!this.__setButton) {
        this.__setButton = $('<button hidden>Set</button>');
        this.__setButton.click(() => this.save());
      }
      if (!this.__cancelButton) {
        this.__cancelButton = $('<button hidden>Cancel</button>');
        this.__cancelButton.click(() => this.cancel());
      }
      if (!this.__changeButton) {
        this.__changeButton = $('<button hidden>Change</button>');
        this.__changeButton.click(() => this.activateCustomAxisSelection());
      }
      selectElement.append('<option value="custom">Add custom</option>');
      this.__changeButton.insertAfter(selectElement);
      this.__setButton.insertAfter(selectElement);
      this.__cancelButton.insertAfter(selectElement);
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
    this.__selectElement.change(event => {
      this.state.resetWidgets();
      if (event.target.value === 'custom') {
        this.activateCustomAxisSelection();
      } else {
        const index = parseInt(event.target.value);
        this.__updateButtonState(index);
        callback(index);
      }
    });
    return this;
  }

  configure(app, state, articulation) {
    // TODO: this weird dependency on the app, state is a bit strange
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

  activateCustomAxisSelection() {
    const cbs = AxisSelectionWidget.AXIS_TYPE_CALLBACKS[this.axisType];
    if (cbs && cbs.activateCustom) {
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
        this.app.articulationAnimator.initArticulationValue(this.state.activePart, this.articulation, this.articulation.defaultValue);
        this.__axisInfo = this.getAxisInfo();
        this[cbs.activateCustom]();
        this.state.activeWidget = this;
      }
    }
  }

  deactivateCustomAxisSelection() {
    const cbs = AxisSelectionWidget.AXIS_TYPE_CALLBACKS[this.axisType];
    if (cbs && cbs.deactivateCustom) {
      this.__setButton.attr('hidden', true);
      this.__cancelButton.attr('hidden', true);

      this[cbs.deactivateCustom]();
      if (this.state.activeWidget == this) {
        this.state.activeWidget = null;
        this.app.articulationAnimator.enabled = this.__oldArticulationAnimatorEnabled;
        this.app.controls.mouseMappings = this.__defaultCameraControlMouseMappings;
        delete this.__defaultCameraControlMouseMappings;
        delete this.__oldArticulationAnimatorEnabled;
      }
    }
  }

  __activateTransformControls() {
    this.app.transformControls.attach(this.__axisInfo.node);
  }

  __deactivateTransformControls() {
    this.app.transformControls.detach();
  }

  __activateSelectRef() {
    if (!this.__refAxisSelectWidget) {
      this.__refAxisSelectWidget = new RefAxisSelectWidget(this.app.camera, this.app.container);
    }
    this.__refAxisSelectWidget.attach(this.state.displayRadar);
  }

  __deactivateSelectRef() {
    if (this.__refAxisSelectWidget) {
      this.__refAxisSelectWidget.detach();
    }
  }

  cancel() {
    if (this.__axisInfo != null) {
      this.__onChangeCallback(this.__axisInfo.index);
      this.__axisInfo = null;
    }
    this.deactivateCustomAxisSelection();
  }

  save() {
    if (this.__axisInfo != null) {
      if (this.__changeAxisIndex == null) {
        const res = AxisOptions.addCustomAxisOption(this.axisOptions, AxisOptions.customAxisOptions, this.__axisInfo.axis.clone());
        this.__addCustomAxisOption(this.__selectElement, res.option, res.index, true);
        // console.log('add new custom axis', res, );
        this.__onChangeCallback(res.index);
      } else {
        // console.log('update custom axis', this.__changeAxisIndex);
        AxisOptions.setCustomAxis(this.axisOptions, this.__changeAxisIndex, this.__axisInfo.axis);
        this.__onChangeCallback(this.__changeAxisIndex);
        this.__changeAxisIndex = null;
      }
    }
    this.deactivateCustomAxisSelection();
  }
}

AxisSelectionWidget.AXIS_TYPE_CALLBACKS = {
  'main': {
    activateCustom: '__activateTransformControls',
    deactivateCustom: '__deactivateTransformControls'
  },
  'ref': {
    activateCustom: '__activateSelectRef',
    deactivateCustom: '__deactivateSelectRef'
  }
};

module.exports = AxisSelectionWidget;