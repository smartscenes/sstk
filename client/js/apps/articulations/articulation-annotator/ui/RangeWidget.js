const EditNumWidget = require('./EditNumWidget');
const _ = require('util/util');

class SliderLabel {
  constructor(sliderInput, parent, fracDigits, sliderLeftWidthRatio = 0.5) {
    this.__widthFrac = sliderLeftWidthRatio;
    this.fractionDigits = fracDigits;
    this.sliderInput = sliderInput;
    this.sliderLabel = $('<span></span>')
      .css('z-index', '2')
      .css('position', 'absolute');
    this.update();
    parent.append(this.sliderLabel);
  }

  update() {
    const spos = this.sliderInput.position();
    const min = parseFloat(this.sliderInput.attr('min'));
    const max = parseFloat(this.sliderInput.attr('max'));
    const pw = (this.sliderInput.val() - min)/(max - min);
    this.sliderLabel.text(parseFloat(this.sliderInput.val()).toFixed(this.fractionDigits))
      .css('top', spos.top + this.sliderInput.height())
      .css('left', spos.left + pw*this.sliderInput.width() - this.sliderLabel.width()*this.__widthFrac);
  }
}

class RangeWidget {
  /**
   * Create range widget with:
   * - rangeMin (minimum value the range can be)
   * - rangeMax (maximum value the range can be)
   * - value (current value between rangeMin and rangeMax)
   * @param sliderInfo.name {string}
   * @param sliderInfo.min {number} Minimum extent of slider (rangeMin/rangeMax must be greater than this)
   * @param sliderInfo.max {number} Maximum extent of slider (rangeMin/rangeMax must be less than this)
   * @param sliderInfo.rangeMin {number} Minimum range value
   * @param sliderInfo.rangeMax {number} Maximum range value
   * @param sliderInfo.step {number} Step size of the range value
   * @param sliderInfo.value {number} Current value of the slider (must be between rangeMin and rangeMax)
   * @param sliderInfo.defaultValue {number} Default value of the slider
   * @param [sliderInfo.labelMin] {string} Label to display next to the minimum extent of the slider
   * @param [sliderInfo.labelMax] {string} Label to display next to the maximum extent of the slider
   * @param [sliderInfo.unit] {string} Unit to display for the slider
   * @param [sliderInfo.editableMinMax] {{min: number, max: number}} Allows for custom editing of min/max
   * @param [sliderInfo.fractionDigits] {number} Number of digits to keep in decimal
   * @param [sliderInfo.valueTransform] {function(number)} Transforms values (NOTE: this is applied externally)
   * @param parent parent element to append this widget to
   */
  constructor(sliderInfo, parent) {
    this.__fractionDigits = (sliderInfo.fractionDigits != null)? sliderInfo.fractionDigits : 3;
    this.sliderInfo = sliderInfo;
    this.restrictValueToRange = true; // restrict value to be within range
    this.showValues = true;
    this.defaultValue = sliderInfo.defaultValue;
    this.valueTranform = sliderInfo.valueTransform;
    this.createSlider(sliderInfo, parent);
  }

  createSlider(sliderInfo, parent) {
    const s = sliderInfo;
    this.minInput =  $(`<input class="rangeMin" value="${s.rangeMin}" min="${s.min}" max="${s.max}" step="${s.step}" type="range">`);
    this.maxInput =  $(`<input class="rangeMax" value="${s.rangeMax}" min="${s.min}" max="${s.max}" step="${s.step}" type="range">`);
    if (s.value != null) {
      this.valueInput = $(`<input class="rangeValue" value="${s.value}" min="${s.rangeMin}" max="${s.rangeMax}" step="${s.step}" type="range">`);
    }
    const unit = (s.unit != null)? s.unit : 'm';
    const labelMin = (s.labelMin != null)? s.labelMin : `${s.min.toFixed(this.__fractionDigits)}${unit}`;
    const labelMax = (s.labelMax != null)? s.labelMax : `${s.max.toFixed(this.__fractionDigits)}${unit}`;
    const labelMinElem = $(`<div class="range-slider-label">${labelMin} </div>`);
    const labelMaxElem = $(`<div class="range-slider-label">${labelMax} </div>`);
    const rangeSliderSec = $('<section class="range-slider"><span class="rangeValues"></span></section>');
    this.element =  $(`<div class="range-slider-container ${s.name}"></div>`)
      .append(labelMinElem)
      .append(rangeSliderSec)
      .append(labelMaxElem);
    const div = rangeSliderSec.find(".rangeValues");
    div.append(this.minInput);
    if (this.valueInput) {
      div.append(this.valueInput);
    }
    div.append(this.maxInput);
    if (parent) {
      parent.append(this.element);
    }
    // Allow min/max extents to be configured
    if (s.editableMinMax)  {
      const editMinMaxWidget = new EditNumWidget(this.element, [ this.minInput, this.maxInput ], unit, this.__fractionDigits);
      labelMinElem.dblclick(() => {
        const opts = _.defaults({ pos: 'left top', max: this.minValue, deactivate: true }, s.editableMinMax);
        editMinMaxWidget.activate(labelMinElem, 'min', opts,
          (val) => { return Math.min(val, this.minValue ); } );
      });
      labelMaxElem.dblclick(() => {
        const opts = _.defaults({ pos: 'right top', min: this.maxValue, deactivate: true }, s.editableMinMax);
        editMinMaxWidget.activate(labelMaxElem, 'max', opts,
          (val) => { return Math.max(val, this.maxValue ); } );
      });
      this.editMinMaxWidget = editMinMaxWidget;
    }

    // bind input events
    // bind minInput
    const scope = this;
    if (this.minInput) {
      if (this.showValues) {
        scope.minInputLabel = new SliderLabel(scope.minInput, rangeSliderSec, this.__fractionDigits, 1);
        const editMinInputWidget = new EditNumWidget(this.element, [ this.minInput ], null, this.__fractionDigits);
        scope.minInputLabel.sliderLabel.dblclick(() => {
          const sliderMin = parseFloat(this.minInput.attr('min'));
          const min = (s.editableMinMax && s.editableMinMax.min != null)? s.editableMinMax.min : sliderMin;
          const max = (this.restrictValueToRange && this.value != null)? this.value : this.maxValue;
          console.log('min: ' + min, 'max:  ' +  max);
          const opts = { min: min, max: max, deactivate: true };
          editMinInputWidget.activate(scope.minInputLabel.sliderLabel, 'value', opts,
            (val) => {
              let v = Math.min(val, max);
              if (s.editableMinMax) {
                if (s.editableMinMax.min != null) {
                  v = Math.max(val, sliderMin);
                }
                if (v < sliderMin) {
                  scope.editMinMaxWidget.updateElements(labelMinElem,'min', v);
                }
              } else {
                v = Math.max(val, sliderMin);
              }
              scope.minInput.val(v);
              scope.minInputLabel.update();
              scope.minInput.change();
              return v;
          });
          scope.editMinInputWidget = editMinInputWidget;
        });
      }

      function checkMinInput() {
        // Don't allow min input to be greater than maxInput
        if (scope.minValue > scope.maxValue) {
          scope.minInput.val(scope.maxValue);
        }
        if (scope.restrictValueToRange && scope.value != null) {
          // Don't allow min input to be greater than value
          if (scope.minValue > scope.value) {
            scope.minInput.val(scope.value);
          }
        }
        if (scope.minInputLabel) {
          scope.minInputLabel.update();
        }
      }

      this.minInput.on('input', event => {
        checkMinInput();
        if (this.__onChangeCallback) {
          this.__onChangeCallback(this.minValue, this.maxValue, this.value);
        }
      });

      this.minInput.change(event => {
        checkMinInput();
        if (this.__onCompleteCallback) {
          this.__onCompleteCallback(this.minValue, this.maxValue, this.value);
        }
      });
    }

    // bind maxInput
    if (this.maxInput) {
      if (this.showValues) {
        scope.maxInputLabel = new SliderLabel(scope.maxInput, rangeSliderSec, this.__fractionDigits, 0);
        const editMaxInputWidget = new EditNumWidget(this.element, [ this.maxInput ], null, this.__fractionDigits);
        scope.maxInputLabel.sliderLabel.dblclick(() => {
          const sliderMax = parseFloat(this.maxInput.attr('max'));
          const max = (s.editableMinMax && s.editableMinMax.max != null)? s.editableMinMax.max : sliderMax;
          const min = (this.restrictValueToRange && this.value != null)? this.value : this.minValue;
          const opts = { min: min, max: max, deactivate: true };
          editMaxInputWidget.activate(scope.maxInputLabel.sliderLabel, 'value', opts,
            (val) => {
              let v = Math.max(val, min);
              if (s.editableMinMax) {
                if (s.editableMinMax.max !=  null) {
                  v = Math.min(val, sliderMax);
                }
                if (v > sliderMax) {
                  scope.editMinMaxWidget.updateElements(labelMaxElem,'max', v);
                }
              } else {
                v = Math.min(val, sliderMax);
              }
              scope.maxInput.val(v);
              scope.maxInputLabel.update();
              scope.maxInput.change();
              return v;
          });
          scope.editMaxInputWidget = editMaxInputWidget;
        });
      }

      function checkMaxInput() {
        // Don't allow min input to be greater than maxInput
        if (scope.maxValue < scope.minValue) {
          scope.maxInput.val(scope.minValue);
        }
        if (scope.restrictValueToRange && scope.value != null) {
          if (scope.maxValue < scope.value) {
            scope.maxInput.val(scope.value);
          }
        }
        if (scope.maxInputLabel) {
          scope.maxInputLabel.update();
        }
      }

      this.maxInput.on('input', event => {
        checkMaxInput();
        if (this.__onChangeCallback) {
          this.__onChangeCallback(this.minValue, this.maxValue, this.value);
        }
      });

      this.maxInput.change(event => {
        checkMaxInput();
        if (this.__onCompleteCallback) {
          this.__onCompleteCallback(this.minValue, this.maxValue, this.value);
        }
      });
    }

    if (this.showValues) {
      // make sure css height account for the labels
      const pad = this.maxInputLabel.sliderLabel.height() + 5;
      this.element.css('margin-bottom', pad + 'px');
    }

    if (this.valueInput) {
      function checkValueInput() {
        // Don't allow min input to be greater than maxInput
        if (scope.restrictValueToRange) {
          if (scope.value < scope.minValue) {
            scope.valueInput.val(scope.minValue);
          }
          if (scope.value > scope.maxValue) {
            scope.valueInput.val(scope.maxValue);
          }
        }
      }
      // bind valueInput
      this.valueInput.on('input', event => {
        checkValueInput();
        if (this.__onChangeCallback) {
          this.__onChangeCallback(this.minValue, this.maxValue, this.value);
        }
      });

      this.valueInput.change(event => {
        checkValueInput();
        if (this.__onCompleteCallback) {
          this.__onCompleteCallback(this.minValue, this.maxValue, this.value);
        }
      });
    }
  }

  show() {
    this.element.show();
  }

  hide() {
    this.element.hide();
  }

  get activeWidget() {
    const widgets = [this.editMinInputWidget, this.editMaxInputWidget, this.editMinMaxWidget];
    for (let w of widgets) {
      if (w && w.active) {
        return w;
      }
    }
  }

  get minValue() {
    return parseFloat(this.minInput.val());
  }

  get maxValue() {
    return parseFloat(this.maxInput.val());
  }

  get value() {
    if (this.valueInput) {
      return parseFloat(this.valueInput.val());
    } else {
      return this.defaultValue;
    }
  }

  rangePercentToValue(p) {
    // take a percentage (0 to 100) between current rangeMin/rangeMax and convert it to a valid value
    return this.minValue + (this.maxValue-this.minValue)*(p/100);
  }

  getValues() {
    return {
      min: this.minValue,
      max: this.maxValue,
      value: this.value
    };
  }

  change(onChange, onComplete) {
    this.__onChangeCallback = onChange;
    this.__onCompleteCallback = onComplete;
    return this;
  }
}

module.exports = RangeWidget;