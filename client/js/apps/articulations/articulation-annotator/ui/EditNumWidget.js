class EditNumWidget {
  /**
   * Creates a div for editing number associated with a number of inputs
   * @param parent Parent element
   * @param inputs Array of input range elements to be updated
   * @param unit Unit for label
   * @param fractionDigits Number of significant digits to keep for the fraction
   */
  constructor(parent, inputs, unit, fractionDigits) {
    this.parent = parent;
    this.inputs = inputs;
    this.fractionDigits = fractionDigits;
    this.unit = unit || '';
    this.active = null; // Are we currently editing custom min/max
    this.__inputTextField = null;
    this.__hiddenElem = null;
  }

  activate(elem, attr, opts, checkValueAndUpdate) {
    if (this.active) {
      if (opts.deactivate) {
        this.save();
      } else {
        console.warn('EditNumWidget already active');
        return;
      }
    }
    this.active = true;
    if (!this.__inputTextField) {
      this.__inputTextField = $(`<input type="number"/>`).css('position', 'absolute').css('z-index', '2');
      this.parent.append(this.__inputTextField);
      const dom = this.__inputTextField.get(0);
      this.__mousedown = (event) => {
        if (event.target !== dom) {
          this.save();
        }
      };
    }
    // put at roughly the same position as label
    const inputTextField = this.__inputTextField;
    inputTextField.show();
    inputTextField.css('left', 0).css('top', 0);
    inputTextField.position({
      my:        opts.pos || 'left top',
      at:        opts.pos || 'left top',
      of:        elem,
      collision: 'none'
    });
    // Setup inputTextField as number field
    const step = Math.pow(10, -this.fractionDigits);
    inputTextField.attr('step', step);
    inputTextField.attr('min', opts.min);
    inputTextField.attr('max', opts.max);
    if (attr === 'value') {
      inputTextField.val(this.inputs[0].val());
    } else {
      inputTextField.val(this.inputs[0].attr(attr));
    }
    inputTextField.off('change');
    inputTextField.change(() => {
      this.__update(elem, attr, inputTextField.val(), checkValueAndUpdate);
    });
    elem.css('visibility', 'hidden');
    this.__hiddenElem = elem;
    document.addEventListener('mousedown', this.__mousedown);
  }

  deactivate() {
    this.__inputTextField.off('change');
    this.__inputTextField.hide();
    if (this.__hiddenElem) {
      this.__hiddenElem.css('visibility', 'visible');
    }
    this.active = false;
    document.removeEventListener('mousedown', this.__mousedown);
  }

  updateElements(elem, attr, v) {
    elem.text(`${v.toFixed(this.fractionDigits)}${this.unit}`);
    this.inputs.forEach((input) => {
      input.attr(attr, v);
    });
  }

  __update(elem, attr, val, checkValueAndUpdate) {
    const v = parseFloat(val);
    if (!isNaN(v)) {
      const cv = checkValueAndUpdate(v);
      this.updateElements(elem, attr, cv);
    } else {
      console.warn('Invalid number', val);
    }
  }

  cancel() {
    if (this.active) {
      this.deactivate();
    }
  }

  save() {
    if (this.active) {
      this.__inputTextField.change();
      this.deactivate();
    }
  }
}

module.exports = EditNumWidget;
