// Class that is responsible for animation the scene based on the selected articulations
class ArticulationAnimator {
    constructor(params) {
        this.state = params.state;
        this.displayAxis = this.state.displayAxis;
        this.displayRadar = this.state.displayRadar;
        this.enabled = true;
    }

    animate() {
        if (!this.enabled) { return; }
        if (this.state.isRotating) {
            this.applyArticulation(this.state.activePart, this.state.rotation, 0.005);
        }
        if (this.state.isTranslating) {
            this.applyArticulation(this.state.activePart, this.state.translation, 0.01);
        }
    }

    applyArticulation(part, articulation, scale) {
        if (articulation.value >= articulation.rangeMax) {
            articulation.forward = false;
        } else if (articulation.value <=  articulation.rangeMin || articulation.forward == null) {
            articulation.forward = true;
        }

        const delta1 = articulation.forward? scale * articulation.rangeAmount : -scale * articulation.rangeAmount;
        const delta = articulation.getCappedDelta(delta1, articulation.value);
        articulation.applyToObject3D(part.object3D, delta);
        articulation.value += delta;
        if (articulation.isTranslation) {
            this.displayAxis.updateValue();
        } else {
            this.displayRadar.updateValue();
        }
    }

    setArticulationValue(part, articulation, v) {
        articulation.value = v;
        if (articulation.isTranslation) {
            this.displayAxis.updateValue();
        } else {
            this.displayRadar.updateValue();
        }
    }

}

// Exports
module.exports = ArticulationAnimator;
