class SliderWidget {
  /**
   * Create value slider widget with:
   * - rangeMin (minimum value the range can be)
   * - rangeMax (maximum value the range can be)
   * - value (current value between rangeMin and rangeMax)
   * @param sliderInfo.name {string}
   * @param sliderInfo.min {number} Minimum extent of slider (rangeMin/rangeMax must be greater than this)
   * @param sliderInfo.max {number} Maximum extent of slider (rangeMin/rangeMax must be less than this)
   * @param sliderInfo.step {number} Step size of the range value
   * @param sliderInfo.value {number} Current value of the slider (must be between rangeMin and rangeMax)
   * @param sliderInfo.defaultValue {number} Default value of the slider
   * @param [sliderInfo.labelMin] {string} Label to display next to the minimum extent of the slider
   * @param [sliderInfo.labelMax] {string} Label to display next to the maximum extent of the slider
   * @param [sliderInfo.unit] {string} Unit to display for the slider
   * @param [sliderInfo.fractionDigits] {number} Number of digits to keep in decimal
   * @param [sliderInfo.valueTransform] {function(number)} Transforms values (NOTE: this is applied externally)
   * @param [sliderInfo.showMinMaxValues=false] {boolean} Whether to show actual min/max values or just Min/Max labels
   * @param [sliderInfo.addMinMaxValueButtons=false] {boolean} Whether to make the min/vax labels clickable
   * @param parent parent element to append this widget to
   */
  constructor(sliderInfo, parent) {
    this.__fractionDigits = (sliderInfo.fractionDigits != null)? sliderInfo.fractionDigits : 3;
    this.sliderInfo = sliderInfo;
    this.defaultValue = sliderInfo.defaultValue;
    this.valueTranform = sliderInfo.valueTransform;
    this.createSlider(sliderInfo, parent);
  }

  createSlider(sliderInfo, parent) {
    const s = sliderInfo;
    const unit = (s.unit != null)? s.unit : '';
    const labelMin = (s.labelMin != null)? s.labelMin : (s.showMinMaxValues? `${s.min.toFixed(this.__fractionDigits)}${unit}` : 'Min');
    const labelMax = (s.labelMax != null)? s.labelMax : (s.showMinMaxValues? `${s.max.toFixed(this.__fractionDigits)}${unit}` : 'Max');
    const labelMinElem = $(`<div class="range-slider-label">${labelMin} </div>`);
    const labelMaxElem = $(`<div class="range-slider-label">${labelMax} </div>`);
    const rangeSliderSec = $(`<section class="range-slider" name="${s.name}"><span class="rangeValues"></span></section>`);

    this.element =  $(`<div class="range-slider-container ${s.name}"></div>`)
      .append(labelMinElem)
      .append(rangeSliderSec)
      .append(labelMaxElem);
    if (parent) {
      parent.append(this.element);
    }

    this.valueInput = $(`<input class="rangeValue" value="${s.value}" min="${s.min}" max="${s.max}" step="${s.step}" type="range">`);
    rangeSliderSec.append(this.valueInput);

    // bind valueInput
    this.valueInput.on('input', event => {
      if (this.__onChangeCallback) {
        this.__onChangeCallback(this.value);
      }
    });

    this.valueInput.change(event => {
      //checkValueInput();
      if (this.__onCompleteCallback) {
        this.__onCompleteCallback(this.value);
      }
    });

    if (s.addMinMaxValueButtons) {
      // Make the min/max labels buttons
      labelMinElem.addClass('btn');
      labelMinElem.click(() => {
        this.valueInput.val(s.min);
        this.valueInput.change();
      });
      labelMaxElem.addClass('btn');
      labelMaxElem.click(() => {
        this.valueInput.val(s.max);
        this.valueInput.change();
      });
    }
  }

  show() {
    this.element.show();
  }

  hide() {
    this.element.hide();
  }

  get value() {
    if (this.valueInput) {
      return parseFloat(this.valueInput.val());
    } else {
      return this.defaultValue;
    }
  }

  set value(v) {
    this.valueInput.val(v);
  }

  change(onChange, onComplete) {
    this.__onChangeCallback = onChange;
    this.__onCompleteCallback = onComplete;
    return this;
  }
}

module.exports = SliderWidget;