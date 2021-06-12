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
   * @param parent parent element to append this widget to
   */
  constructor(sliderInfo, parent) {
    this.createSlider(sliderInfo, parent);
    this.restrictValueToRange = true; // restrict value to be within range
    this.defaultValue = sliderInfo.defaultValue;
  }

  createSlider(sliderInfo, parent) {
    const s = sliderInfo;
    this.minInput =  $(`<input value="${s.rangeMin}" min="${s.min}" max="${s.max}" step="${s.step}" type="range">`);
    this.maxInput =  $(`<input value="${s.rangeMax}" min="${s.min}" max="${s.max}" step="${s.step}" type="range">`);
    if (s.value != null) {
      this.valueInput = $(`<input value="${s.value}" min="${s.rangeMin}" max="${s.rangeMax}" step="${s.step}" type="range">`);
    }
    const unit = (s.unit != null)? s.unit : 'm';
    const labelMin = (s.labelMin != null)? s.labelMin : `${s.min.toFixed(3)}${unit}`
    const labelMax = (s.labelMax != null)? s.labelMax : `${s.max.toFixed(3)}${unit}`
    this.element =
      $(`<div class="range-slider-container ${s.name}">
			  <div class="range-slider-label">${labelMin} </div>
				    <section class="range-slider">
				      <span class="rangeValues"></span>
				  	</section>
					<div class="range-slider-label"> ${labelMax}</div>
				</div>`);
    const div = this.element.find(".rangeValues");
    div.append(this.minInput);
    div.append(this.maxInput);
    if (this.valueInput) {
      div.append(this.valueInput);
    }
    if (parent) {
      parent.append(this.element);
    }

    // bind input events
    // bind minInput
    const scope = this;
    if (this.minInput) {
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

  getValues() {
    return {
      min: this.minValue,
      max: this.maxValue,
      value: this.value
    }
  }

  change(onChange, onComplete) {
    this.__onChangeCallback = onChange;
    this.__onCompleteCallback = onComplete;
    return this;
  }
}

module.exports = RangeWidget;