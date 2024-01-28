const BasePlayer = require('capabilities/BasePlayer');

// Class that is responsible for animation the scene based on the selected articulations
class ArticulationAnimator extends BasePlayer {
    constructor(params) {
        super(params);
        this.state = params.state;
        this.displayAxis = this.state.displayAxis;
        this.displayRadar = this.state.displayRadar;
    }

    get isPlaying() {
        return this.__isPlaying && (this.state.isRotating || this.state.isTranslating);
    }

    set isPlaying(v) {
        this.__isPlaying = v;
    }

    get currentArticulation() {
        return this.state.activeArticulation;
    }

    get currentPart() {
        return this.state.activePart;
    }

    animate() {
        if (!this.enabled) { return; }
        if (this.isPlaying) {
            if (this.state.isRotating) {
                this.__applyArticulationWithScale(this.currentPart, this.currentArticulation, 0.005);
            }
            if (this.state.isTranslating) {
                this.__applyArticulationWithScale(this.currentPart, this.currentArticulation, 0.01);
            }
        }
    }

    /**
     * Update widgets associated with this animator
     * @param articulation {Articulation}
     * @private
     */
    __updateWidgets(articulation) {
        if (articulation.isTranslation) {
            if (this.displayAxis) {
                this.displayAxis.updateValue();
            }
        } else {
            if (this.displayRadar) {
                this.displayRadar.updateValue();
            }
        }
        if (this.playWidget) {
            this.playWidget.slider.updateValue();
        }
    }

    __getDelta(articulation, scale) {
        if (articulation.value >= articulation.rangeMax) {
            articulation.forward = false;
        } else if (articulation.value <=  articulation.rangeMin || articulation.forward == null) {
            articulation.forward = true;
        }

        const delta1 = articulation.forward? scale * articulation.rangeAmount : -scale * articulation.rangeAmount;
        const delta = articulation.getCappedDelta(delta1, articulation.value);
        return delta;
    }

    __applyArticulation(part, articulation, delta) {
        articulation.applyToObject3D(part.object3D, delta);
        articulation.value += delta;
    }

    __applyArticulationWithScale(part, articulation, scale) {
        const delta = this.__getDelta(articulation, scale);
        this.__applyArticulation(part, articulation, delta);
        this.__updateWidgets(articulation);
    }

    /**
     * Set the articulation value without updating the part transformation
     * @param part {Part}
     * @param articulation {Articulation}
     * @param v {number}
     **/
    initArticulationValue(part, articulation, v) {
        articulation.value = v;
        this.__updateWidgets(articulation);
    }

    /**
     * Set the articulation value and update the part transformation
     * @param part {Part}
     * @param articulation {Articulation}
     * @param v {number}
     */
    setArticulationValue(part, articulation, v) {
        const delta = v - articulation.value;
        articulation.applyToObject3D(part.object3D, delta);
        articulation.value = v;
        this.__updateWidgets(articulation);
    }

    setArticulationToState(part, articulation, name) {
        if (name === 'min') {
            this.setArticulationValue(part, articulation, articulation.rangeMin);
        } else if (name === 'max') {
            this.setArticulationValue(part, articulation, articulation.rangeMax);
        } else if (name === 'default') {
            this.setArticulationValue(part, articulation, articulation.defaultValue);
        } else {
            console.warn('Unknown articulation state', name);
        }
    }

    set playPercent(percent) {
        const art = this.currentArticulation;
        if (art) {
            const v = art.proportionToValue(percent / 100);
            this.setArticulationValue(this.currentPart, art, v);
        }
    }

    get playPercent() {
        const art = this.currentArticulation;
        if (art) {
            const v = art.value;
            const percent = art.valueToProportion(v)*100;
            return percent;
        }
    }
}

// Exports
module.exports = ArticulationAnimator;
