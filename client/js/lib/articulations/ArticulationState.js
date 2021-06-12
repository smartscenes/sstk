/**
 * Represents the state of a part together with a set of articulation parameters
 * @memberOf articulations
 */
class ArticulationState {
  constructor(part, articulation, articulatedNode, value) {
    this.part = part;
    this.articulation = articulation;
    this.articulatedNode = articulatedNode;
    this.__value = (value != undefined)? value : this.articulation.defaultValue;
    this.direction = 1;
  }

  get type() {
    return this.articulation.type;
  }

  get pid() {
    return this.articulation.pid;
  }

  get axis() {
    return this.articulation.axis;
  }

  get origin() {
    return this.articulation.origin;
  }

  get ref() {
    return this.articulation.ref;
  }

  get defaultValue() {
    return this.articulation.defaultValue;
  }

  get rangeMin() {
    return this.articulation.rangeMin;
  }

  get rangeMax() {
    return this.articulation.rangeMax;
  }

  get rangeAmount() {
    return this.articulation.rangeAmount;
  }

  get defaultRangeAmount() {
    if (this.articulation.isTranslation) {
      return this.part.obb.diagonalLength()*2;
    } else {
      return 2*Math.PI;
    }
  }

  get value() {
    return this.__value;
  }

  set value(v) {
    // Note this allows for any value (not capped by min/max)
    const delta = v - this.value;
    if (delta !== 0) {
      this.apply(delta, true);
    }
  }

  setValueCapped(v) {
    const newValue = this.articulation.getCappedValue(v);
    this.value = newValue;
  }

  /**
   * Applies this articulation on an object3D (restrict range to be within min/max)
   * (similar to applyToObject3D but is capped)
   * @param delta {number}
   * @param unlimited {boolean} Allow for unlimited value (outside of range)
   */
  apply(delta, unlimited = false) {
    const amount = unlimited? delta : this.articulation.getCappedDelta(delta, this.value);
    this.articulation.applyToObject3D(this.articulatedNode, amount);
    this.__value += amount;
    return amount;
  }

  setToMin() {
    this.value = this.articulation.rangeMin;
  }

  setToMax() {
    this.value = this.articulation.rangeMax;
  }

  setToDefault() {
    this.value = this.articulation.defaultValue;
  }

  get atMax() {
    return this.value === this.rangeMax;
  }

  get atMin() {
    return this.value === this.rangeMin;
  }

  get atDefault() {
    return this.value === this.articulation.defaultValue;
  }

  get inRange() {
    return (this.rangeMin == null || this.value >= this.rangeMin) && (this.rangeMax == null || this.value <= this.rangeMax);
  }

}

module.exports = ArticulationState;
