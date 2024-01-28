const AxisSelectionWidget = require('./AxisSelectionWidget');
const RangeWidget = require('./RangeWidget');
const SliderWidget = require('ui/widget/SliderWidget');
const PlaySliderWidget = require('ui/widget/PlaySliderWidget');
const Dialog = require('./Dialog');
const _ = require('util/util');

class EditArticulationUI extends Dialog {
  constructor(params) {
    super(params.container, true, true);
    this.allowSelectAttached = params.allowSelectAttached;
    this.articulationTypes = params.articulationTypes;
    this.__articulationTypeInfo = {};
    this.articulationTypes.forEach((t) => {
      this.__articulationTypeInfo[t] = {id: t, label: _.capitalize(t), class: t, motionType: t, type: t};
    });
    this.__currentArticulationWidgets = null;
    this.motionStates = params.motionStates; // set of predefined motion states for which we want to get range values
    this.allowAnimateArticulationWidget = params.allowAnimateArticulationWidget;
  }

  get activeWidget() {
    if (this.__currentArticulationWidgets) {
      return this.__currentArticulationWidgets.rangeWidget.activeWidget;
    }
  }

  create(part, candidates, type, tag) {
    const dialog = super.create(`${tag} Articulation: ${part.name}`);
    this.__appendArticulationTypes(this.getContentDiv(), Object.values(this.__articulationTypeInfo), type, candidates);
    return dialog;
  }

  __appendArticulationTypes(element, articulationTypes, selectedType, addBaseParts) {
    for (let t of articulationTypes) {
      const div = $(`<div class="${t.class} antn-dialog-section"></div>`);
      const checked = (selectedType === t.type)? "checked" : "";
      div.append(
        `<div class="antn-dialog-option splay-option">
          <label>${t.label}</label>
         <input id="${t.id}" type="radio" name="antn" ${checked} value="${t.type}">
        </div>`);
      const span = $(`<span class="${t.class} ${t.class}-content"></span>`);
      if (addBaseParts) {
        span.append(
          `<div class="${t.class} antn-dialog-base-selector hidden">
            <div class="antn-dialog-base-selector-header">Select base part(s):</div>
          </div>`);
      }
      span.append(
        `<div class="${t.class}-axis antn-dialog-base-selector hidden">
        <div class="antn-dialog-base-selector-header">Specify axis of ${t.motionType}:</div>
        </div>`);

      div.append(span);
      element.append(div);
    }
  }

  __createBaseOptionCheckbox(child, isBase, type) {
    const div = $(
      `<div data-id="${child.pid}" class="antn-dialog-base-selector-option splay-option">
          <label>${child.name}</label>
          <input data-id="${child.pid}" class="child" type="checkbox" name="${type}" value="${child.pid}">
       </div>`);
    if (isBase) {
      div.find('input').attr('checked', true);
    }
    return div;
  }

  __createBaseOptionRadioDiv(name, id, label, showLabels) {
    const div = $(
      `<div data-id="${id}" class="antn-dialog-base-selector-option splay-option">
        <label>${label}</label>
        <div>
          <input id="${name}-B" data-id="${id}" class="child" type="radio" name="${name}" value="B"> 
          <label for="${name}-B">B</label>
          <input id="${name}-A" data-id="${id}" class="child" type="radio" name="${name}" value="A">
          <label for="${name}-A">A</label>
          <input id="${name}-N" data-id="${id}" class="child" type="radio" name="${name}" value="N">
          <label for="${name}-N">N</label>
        </div>
      </div>`);
    if (!showLabels) {
      div.find('div label').hide();
    }
    return div;
  }

  __createBaseOptionRadio(part, isBase, isAttached, type, showLabels) {
    const name = `${type}-${part.pid}`;
    const div = this.__createBaseOptionRadioDiv(name, part.pid, part.name, showLabels);
    if (isBase) {
      div.find(`input#${name}-B`).prop('checked', true);
    } else if (isAttached) {
      div.find(`input#${name}-A`).prop('checked', true);
    } else {
      div.find(`input#${name}-N`).prop('checked', true);
    }
    return div;
  }

  displayBaseOptions(candidates, basePids, attachedPids) {
    if (candidates) {
      const showLabelsAtTop = true;
      const showLabels = !showLabelsAtTop;
      for (let articulationType of this.articulationTypes) {
        const t = this.__articulationTypeInfo[articulationType];
        const panel = this.container.find(`.${t.class}.antn-dialog-base-selector`);
        panel.empty();
        panel.append(this.__createSectionHeader('Select base part(s):'));
        if (showLabelsAtTop) {
          const div = $(`<div class="antn-dialog-base-selector-option splay-option">
            <label></label>
            <div>
              <label class="antn-base-label">B</label><span></span>
              <label class="antn-base-label">A</label>
              <label class="antn-base-label">N</label>
            </div>
          </div>`);
          panel.append(div);
        }
        if (candidates.length > 1 && this.allowSelectAttached) {
          const allDiv = this.__createBaseOptionRadioDiv(`{type}-all`, 'all', 'All', showLabels);
          panel.append(allDiv);
        }
        candidates.forEach((candidate) => {
          const isBase = basePids.includes(candidate.pid);
          const isAttached = attachedPids.includes(candidate.pid);
          const option = (this.allowSelectAttached)?
            this.__createBaseOptionRadio(candidate, isBase, isAttached, articulationType, showLabels) :
            this.__createBaseOptionCheckbox(candidate, isBase, articulationType);
          panel.append(option);
        });
      }
    }
    this.__bindBaseChangeEvents();
  }

  __bindBaseChangeEvents() {
    for (let articulationType of this.articulationTypes) {
      const t = this.__articulationTypeInfo[articulationType];
      const artBaseOptions = this.container.find(`.${t.class} .child`);
      if (this.allowSelectAttached) {
        artBaseOptions.change((event) => {
          const elem = $(event.target);
          const pid = elem.data('id');
          const value = elem.val();
          const isBase = value === 'B';
          const isAttached = value === 'A';
          if (pid === 'all') {
            const updatedPids = [];
            artBaseOptions.each((i,b) => {
              if (b.value === value) {
                if (!b.checked) {
                  b.checked = true;
                  updatedPids.push($(b).data('id'));
                }
              }
            });
            if (updatedPids.length) {
              this.Publish('baseChanged', articulationType, updatedPids, isBase, isAttached);
            }
          } else {
            this.Publish('baseChanged', articulationType, pid, isBase, isAttached);
          }
        });
      } else {
        // check box
        artBaseOptions.change((event) => {
          const pid = $(event.target).data('id');
          this.Publish('baseChanged', articulationType, pid, event.target.checked, false);
          // If there no base selected, then hide the axis/motion range selection
          if (this.container.find(`.${t.class} .child:checked`).length === 0) {
            this.container.find(`.${t.class}-axis.antn-dialog-base-selector`).addClass("hidden");
          }
        });
      }

      const baseOptions = this.container.find(`.${t.class} .antn-dialog-base-selector-option`);
      baseOptions.mouseenter((event) => {
        const pid = $(event.target).data('id');
        if (pid != null) {
          // console.log('hoverEnter', articulationType, pid);
          this.Publish('baseHover', articulationType, pid, true);
        }
      });

      baseOptions.mouseleave((event) => {
        const pid = $(event.target).data('id');
        if (pid != null) {
          // console.log('hoverLeave', articulationType, pid);
          this.Publish('baseHover', articulationType, pid, false);
        }
      });
    }
  }

  displayRotationBaseOptions() {
    // hide translation
    $(".translation.antn-dialog-base-selector").addClass("hidden");
    $(".translation-axis.antn-dialog-base-selector").addClass("hidden");
    // show rotation base selector
    $(".rotation-axis.antn-dialog-base-selector").addClass("hidden");
    $(`.rotation.antn-dialog-base-selector`).removeClass("hidden");
  }

  displayTranslationBaseOptions() {
    // hide rotation
    $(".rotation.antn-dialog-base-selector").addClass("hidden");
    $(".rotation-axis.antn-dialog-base-selector").addClass("hidden");
    // show translation base selector
    $(".translation.antn-dialog-base-selector").removeClass("hidden");
  }

  hideAxisOptions() {
    $(".rotation-axis.antn-dialog-base-selector").addClass("hidden");
    $(".translation-axis.antn-dialog-base-selector").addClass("hidden");
  }

  /**
   * Display rotation axis options
   * @param axisOptions {Array<AxisOption>}
   * @param axisIndex {int}
   * @param annotation {{rangeMin: number, rangeMax: number, motionStates: {}}}
   */
  displayTranslationAxisOptions(axisOptions, axisIndex, annotation) {
    const element = $(".translation-axis.antn-dialog-base-selector");
    element.removeClass("hidden");

    element.empty();
    element.append(this.__createSectionHeader('Specify axis of translation:'));

    element.append(
      `<div class="antn-dialog-base-selector-option splay-option">
        <span>Axis of Translation:&nbsp</span>
        <select name="aot"></select>
      </div>
      <br>`);

    const axisSelectionWidget = new AxisSelectionWidget($(".translation-axis select[name=aot]"), 'main');
    axisSelectionWidget.setAxisOptions(axisOptions, axisIndex, true);

    const rangeWidget = this.__appendTranslationSliders(element, axisOptions, axisIndex, annotation.rangeMin, annotation.rangeMax);
    const motionStateWidgets = this.__appendMotionStateSliders(element, rangeWidget, 'translation', annotation.motionStates);
    const animWidget = this.__appendAnimateArticulationWidget(element);
    this.__currentArticulationWidgets = { axisSelectionWidget: axisSelectionWidget, rangeWidget: rangeWidget,
      motionStateWidgets: motionStateWidgets, animateArticulationWidget: animWidget };
    return this.__currentArticulationWidgets;
  }

  __appendTranslationSliders(element, axisOptions, axisIndex, currentRangeMin, currentRangeMax) {
    element.append(this.__createSectionHeader('Set Range of Motion: '));
    const t = axisOptions[axisIndex].translation;
    const fullRangeMin = (currentRangeMin < t.fullRangeMin)? currentRangeMin : t.fullRangeMin;
    const fullRangeMax = (currentRangeMax > t.fullRangeMax)? currentRangeMax : t.fullRangeMax;
    const rangeWidget = new RangeWidget({
      name: "range" + axisIndex,
      min: fullRangeMin, max: fullRangeMax,
      rangeMin: currentRangeMin, rangeMax: currentRangeMax,
      step: 0.001, defaultValue: 0, labelUnit: 'm',
      editableMinMax: { min: t.customMin, max: t.customMax }
    }, element);
    return rangeWidget;
  }

  /**
   * Display rotation axis options
   * @param axisOptions {Array<AxisOption>}
   * @param axisIndex {int}
   * @param refAxisIndex {int}
   * @param pivotOptions {Array<RangeOption>}
   * @param rotation {{rangeMin: number, rangeMax: number, motionStates: {}}}
   */
  displayRotationAxisOptions(axisOptions, axisIndex, refAxisIndex, pivotOptions, rotation) {
    const element = $(`.rotation-axis.antn-dialog-base-selector`);
    element.removeClass("hidden");

    element.empty();
    element.append(this.__createSectionHeader('Specify axis of rotation:'));

    element.append(
      `<div class="antn-dialog-base-selector-option splay-option">
        <span>Axis of Rotation:&nbsp</span>
        <select name="aor"></select>
      </div>
      <br>`);

    const axisSelectionWidget = new AxisSelectionWidget($(".rotation-axis select[name=aor]"), 'main');
    axisSelectionWidget.setAxisOptions(axisOptions, axisIndex, true);

    element.append(
      `<div class="antn-dialog-base-selector-option splay-option">
        <span>Reference Axis:&nbsp</span>
        <select name="aorr"></select>
      </div>
      <br>`);

    const axisSelectionWidget2 = new AxisSelectionWidget($(".rotation-axis select[name=aorr]"), 'ref',
      (opt, index) => {
        if (axisSelectionWidget2.state) {
          return axisSelectionWidget2.state.isOrthogonalToMainAxis(opt.value);
        } else {
          return true;
        }
      }
    );
    axisSelectionWidget2.setAxisOptions(axisOptions, refAxisIndex, true);

    const rangeWidget = this.__appendRotationSliders(element, pivotOptions, rotation.rangeMin, rotation.rangeMax);
    const motionStateWidgets = this.__appendMotionStateSliders(element, rangeWidget, 'rotation', rotation.motionStates);
    const animWidget = this.__appendAnimateArticulationWidget(element);
    this.__currentArticulationWidgets = { axisSelectionWidget: axisSelectionWidget, refAxisSelectionWidget: axisSelectionWidget2,
      rangeWidget: rangeWidget, motionStateWidgets: motionStateWidgets, animateArticulationWidget: animWidget };
    return this.__currentArticulationWidgets;
  }

  __createSectionHeader(text) {
    return $(`<div class="antn-dialog-base-selector-header">${text}</div>`);
  }

  __appendAnimateArticulationWidget(element) {
    // slider for controling articulation state
    if (this.allowAnimateArticulationWidget) {
      const animateArticulationWidget = new PlaySliderWidget();
      const header = this.__createSectionHeader('Play animation');
      element.append('<br>').append(header);
      animateArticulationWidget.appendTo(element, header);
      animateArticulationWidget.bindEvents();
      return animateArticulationWidget;
    }
  }

  __appendValueSlider(element, sliderName, sliderLabel, sliderMin, sliderMax, value, step) {
    const div = $(`<div class="antn-dialog-base-selector-option">${sliderLabel}: </div>`);
    const valueSlider = new SliderWidget({
      name: sliderName,
      min: sliderMin,
      max: sliderMax,
      value: value,
      step: step || 0.001,
      showMinMaxValues: false,
      addMinMaxValueButtons: true
    }, div);
    element.append(div);
    return valueSlider;
  }

  __appendMotionStateSliders(element, rangeWidget, articulationType, motionStateValues) {
    const sliderWidgets = {};
    for (let motionStateName of this.motionStates) {
      const sliderLabel = motionStateName;
      const div = $(`<div class="antn-dialog-base-selector-option">${sliderLabel}: </div>`);
      const value = (motionStateValues && motionStateValues[motionStateName])?
          motionStateValues[motionStateName].percent : 0;
      const sliderWidget = new SliderWidget({
        name: articulationType + '-' + motionStateName,
        min: 0,
        max: 100,
        value: value || 0,
        step: 1,
        showMinMaxValues: false,
        addMinMaxValueButtons: true
      }, div);
      element.append(div);
      sliderWidgets[motionStateName] = sliderWidget;
    }
    return sliderWidgets;
  }

  __appendRotationSliders(element, pivotOptions, rotationRangeMin, rotationRangeMax) {
    // Append pivot point (origin) options and range of motion
    element.append(this.__createSectionHeader('Adjust Pivot Point: '));
    for (let pivotOption of pivotOptions) {
      this.__appendValueSlider(element, pivotOption.name, pivotOption.label, pivotOption.min, pivotOption.max, pivotOption.value);
    }
    element.append('<br>');
    element.append(this.__createSectionHeader('Set Range of Motion: '));
    const rangeWidget = new RangeWidget({
        name: 'range',
        min: -180, max: 180,
        rangeMin: 180 * (rotationRangeMin/Math.PI), rangeMax: 180 * (rotationRangeMax/Math.PI),
        step: 1, defaultValue: 0,
        fractionDigits: 0,
        labelMin: '-π', labelMax: '+π',
        valueTransform: function(v) { return v/180*Math.PI; }
      },
      element);
    return rangeWidget;
  }

  onBaseChanged(cb, reset) {
    // cb(articulationType, pid, baseState)
    if (reset) {
      this.UnsubscribeAll('baseChanged');
    }
    this.Subscribe('baseChanged', null, cb);
  }

  onBaseHover(cb, reset) {
    // cb(articulationType, pid, baseState)
    if (reset) {
      this.UnsubscribeAll('baseHover');
    }
    this.Subscribe('baseHover', null, cb);
  }

  onEdgeSelect(cb) {
    $("[name=edgePick]").change((event) => {
      cb(parseInt(event.target.value));
    });
  }

  onLeftRightAxisPivotChange(cb) {
    $(".rotation-axis .range-slider[name=left] input").on("input", event => {
      const slides = event.target.parentNode.getElementsByTagName("input");
      cb(parseFloat(slides[0].value));
    });
  }

  onUpDownAxisPivotChange(cb) {
    $(".rotation-axis .range-slider[name=up] input").on("input", event => {
      const slides = event.target.parentNode.getElementsByTagName("input");
      cb(parseFloat(slides[0].value));
    });
  }

  onForwardBackAxisPivotChange(cb) {
    $(".rotation-axis .range-slider[name=front] input").on("input", event => {
      const slides = event.target.parentNode.getElementsByTagName("input");
      cb(parseFloat(slides[0].value));
    });
  }

  onArticulationTypeChanged(cb) {
    $(".antn-dialog-option input[type=radio][name=antn]").change((event) =>
      { cb(event.target.value); });
  }

  getRotationOption() {
    return $("#rotation");
  }

  getArticulationType() {
    for (let artType of this.articulationTypes) {
      const t = this.__articulationTypeInfo[artType];
      const checkbox = this.container.find(`#${t.id}`);
      if (checkbox.prop('checked')) {
        return t.type;
      }
    }
  }
}

/**
 * Specifies what goes into range option
 * @typedef RangeOption
 * @type {object}
 * @property {string} name
 * @property {string} label
 * @property {number} min
 * @property {number} max
 * @property {number} value
 **/

module.exports = EditArticulationUI;