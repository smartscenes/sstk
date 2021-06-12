class ArticulationPlayer {
    constructor(params) {
        this.articulatedObject = params.articulatedObject;
        //this.modelInstance = params.modelInstance || Object3DUtil.getModelInstance(this.articulatedObject);
        this.assetManager = params.assetManager;

        // Whether to automatically reverse after limit is reached
        this.autoReverse = true;

        // State for the play
        this.isPaused = true;
        this.selectArticulation(0);

        // Tell people that we are ready
        this.assetManager.Publish('dynamicAssetLoaded', this);
    }

    // Exposed operations
    getOperations() {
        return ['pause', 'play', 'turnOn', 'turnOff', 'toggle', 'next', 'select'];
    };

    pause() {
        this.isPaused = true;
    };

    play() {
        this.isPaused = false;
    };

    turnOn() {
        this.play();
    }

    turnOff() {
        this.pause();
    }

    toggle() {
        if (this.isPaused) {
            this.play();
        } else {
            this.pause();
        }
        return !this.isPaused;
    };

    select(label) {
        label = label.replace("_", " ");
        let index = this.selectPartByName(label);
        if (index < 0) {
            index = this.selectPartByLabel(label);
        }
        return index;
    }

    // Select articulation to play
    selectArticulation(i) {
        this.currentArtIndex = i;
        if (this.articulatedObject.getArticulation(this.currentArtIndex).isTranslation) {
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
        return this.articulatedObject.getArticulation(this.currentArtIndex).pid;
    }

    // Go to next articulation
    next() {
        this.select((this.currentArtIndex + 1) % this.articulatedObject.getNumArticulations());
    }

    // Dynamic asset callbacks
    update() {
        if (!this.isPaused) {
            const delta = this.articulatedObject.applyArticulation(this.currentArtIndex, this.delta);
            if (Math.abs(delta) < Math.abs(this.delta)) {
                // At limit
                if (this.autoReverse) {
                    this.delta = -this.delta;
                }
            }
        }
    }

    destroy() {

    };
}

module.exports = ArticulationPlayer;