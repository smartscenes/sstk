const BasePlayer = require('capabilities/BasePlayer');
const DisplayAxis = require('articulations/DisplayAxis');
const DisplayRadar = require('articulations/DisplayRadar');

class ArticulationPlayer extends BasePlayer {
    /**
     * Create an ArticulationPlayer
     * @param params.articulatedObject {ArticulatedObject}
     * @param params.assetManager {AssetManager}
     * @param [params.articulationIndex=0] {int}
     * @param [params.vizNode=null] {THREE.Group} {Node to which to attach the visualization widgets}
     */
    constructor(params) {
        super(params);
        this.articulatedObject = params.articulatedObject;
        //this.modelInstance = params.modelInstance || Object3DUtil.getModelInstance(this.articulatedObject);
        this.assetManager = params.assetManager;

        // Whether to automatically reverse after limit is reached
        this.autoReverse = true;

        // Initial articulation
        const artIndex = (params.articulationIndex != null)? params.articulationIndex : 0;

        // State for the play
        this.selectArticulation(artIndex);
        if (params.vizNode) {
            this.displayRadar = new DisplayRadar({});
            this.displayAxis = new DisplayAxis({});
            this.displayRadar.attach(params.vizNode);
            this.displayAxis.attach(params.vizNode);
            this.__isDisplayWidgetsVisible = true;
        } else {
            this.__isDisplayWidgetsVisible = false;
        }

        // Tell people that we are ready
        if (this.assetManager) {
            this.assetManager.Publish('dynamicAssetLoaded', this);
        }
    }

    // Exposed operations
    getOperations() {
        return ['pause', 'play', 'turnOn', 'turnOff', 'toggle', 'next', 'select'];
    }

    select(label) {
        label = label.replace("_", " ");
        let index = this.selectPartByName(label);
        if (index < 0) {
            index = this.selectPartByLabel(label);
        }
        return index;
    }

    get currentArticulation() {
        return this.articulatedObject.getArticulation(this.currentArtIndex);
    }

    get currentArticulationState() {
        return this.articulatedObject.getArticulationState(this.currentArtIndex);
    }

    get currentPart() {
        return this.articulatedObject.parts[this.currentArticulation.pid];
    }

    // Select articulation to play
    selectArticulation(i) {
        this.currentArtIndex = i;
        this.__updateWidgets(this.currentArticulationState);
        if (this.currentArticulation.isTranslation) {
            this.delta = 0.001;
        } else {
            this.delta = 0.005;
        }
    }

    selectPart(pid) {
        const index = this.articulatedObject.findArticulationIndex(art => art.pid === pid);
        if (index >= 0) {
            this.selectArticulation(index);
        }
        return index;
    }

    selectPartByLabel(label) {
        return this.selectMatchingPart(p => p.label === label);
    }

    selectPartByName(name) {
        return this.selectMatchingPart(p => p.name === name);
    }

    selectMatchingPart(filter) {
        const matchingParts = this.articulatedObject.findParts(filter);
        const matchingPids = matchingParts.map(p => p.pid);
        //console.log(matchingPids);
        const index = this.articulatedObject.findArticulationIndex(art => matchingPids.indexOf(art.pid) >= 0);
        if (index >= 0) {
            this.selectArticulation(index);
        }
        //console.log('got index', index);
        return index;
    }

    getActivePartId() {
        return this.currentArticulation.pid;
    }

    // Go to next articulation
    next() {
        this.select((this.currentArtIndex + 1) % this.articulatedObject.getNumArticulations());
    }

    // Dynamic asset callbacks
    update() {
        if (this.enabled && this.isPlaying) {
            const art = this.currentArticulationState;
            if (art) {
                const delta = art.apply(this.delta);
                this.__updateWidgets(art);
                if (Math.abs(delta) < Math.abs(this.delta)) {
                    // At limit
                    if (this.autoReverse) {
                        this.delta = -this.delta;
                    }
                }
            }
        }
    }

    destroy(notify) {
        // Tell people that we are done
        if (this.assetManager && notify) {
            this.assetManager.Publish('dynamicAssetUnloaded', this);
        }
        if (this.displayRadar) {
            this.displayRadar.detach();
        }
        if (this.displayAxis) {
            this.displayAxis.detach();
        }
    }

    /**
     * Update widgets associated with this animator
     * @param articulationState {ArticulationState}
     * @private
     */
    __updateWidgets(articulationState) {
        if (this.displayAxis) {
            if (this.displayAxis.articulation !== articulationState) {
                console.log('update articulation');
                this.displayAxis.articulation = articulationState;
                this.displayAxis.update(articulationState.articulation.isTranslation);
            }
            if (articulationState.articulation.isTranslation) {
                this.displayAxis.updateValue();
            }
        }
        if (this.displayRadar) {
            if (articulationState.articulation.isRotation) {
                this.displayRadar.visible = this.__isDisplayWidgetsVisible;
                if (this.displayRadar.articulation !== articulationState) {
                    console.log('update articulation');
                    this.displayRadar.articulation = articulationState;
                    this.displayRadar.update();
                }
                this.displayRadar.updateValue();
            } else {
                this.displayRadar.visible = false;
            }
        }
        if (this.playWidget) {
            this.playWidget.slider.updateValue();
        }
    }

    set isDisplayWidgetsVisible(flag) {
        this.__isDisplayWidgetsVisible = flag;
        if (this.displayRadar) {
            this.displayRadar.visible = flag;
        }
        if (this.displayAxis) {
            this.displayAxis.visible = flag;
        }
    }

    get isDisplayWidgetsVisible() {
        return this.__isDisplayWidgetsVisible;
    }

    set value(v) {
        const art = this.currentArticulationState;
        if (art) {
            art.value = v;
            this.__updateWidgets(art);
        }
    }

    set playPercent(percent) {
        const art = this.currentArticulationState;
        if (art) {
            const v = art.proportionToValue(percent / 100);
            art.value = v;
            this.__updateWidgets(art);
        }
    }

    get playPercent() {
        const art = this.currentArticulationState;
        if (art) {
            const v = art.value;
            const percent = art.valueToProportion(v)*100;
            return percent;
        }
    }
}

module.exports = ArticulationPlayer;