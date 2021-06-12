'use strict';

const Constants = require('Constants');
const AssetManager = require('assets/AssetManager');
const BasicSearchController = require('search/BasicSearchController');
const ArticulationsRenderHelper = require('articulations/ArticulationsRenderHelper')
const ViewTile = require('./ViewTile')
var PubSub = require('PubSub');

const template = '<div class="scene"></div>\n<div class="description">Scene $</div>';

class MultiModelView extends PubSub {
    constructor(canvas, content) {
        super();

        // Init the parameters
        this.viewTiles = [];
        this.autoRotate = false;
        this.staticMode = false;
        // this.__cachedModelInstances = {};
        // this.__loadingModels = {};
        this.__articulations = {};
        this.__datasetRegistered = false;
        // Html stuff
        this.__canvas = canvas;
        this.__content = content
        // Helper function to create the asset Manager
        this.__assetManager = this.__createAssetManager();
        this.__renderHelper = this.__createRenderHelper();
        this.__renderer = this.__createRender();

        this.__showPoint = {};
        this.__showXYZ = {};
        this.__showArrow = {};
        this.__showPlane = {};

        this.assetSources = ['shape2motion', 'partnetsim', 'rpmnet'];

        // Register the dataset
        this.__registerDataset();

        this.animate();
    }

    __createRender() {
        const renderer = new THREE.WebGLRenderer({ canvas: this.__canvas, antialias: true, alpha: true });
        renderer.setClearColor(0xffffff, 0);
        renderer.setPixelRatio(window.devicePixelRatio);
        return renderer;
    }

    __createAssetManager() {
        //const useSearchController = cmd.use_search_controller;
        const useSearchController = true;
        const assetManager = new AssetManager({
            autoAlignModels: false,
            autoScaleModels: false,
            assetCacheSize: 100,
            enableLights: false,
            defaultLightState: false,
            supportArticulated: true, mergeFixedParts: false,
            searchController: useSearchController ? new BasicSearchController() : null
        });
        return assetManager;
    }

    __createRenderHelper() {
        const static_color = 'neutral';
        const moving_part_color = 'highlight';
        const attached_moving_part_color = 'faded_highlight';
        const base_part_color = '#9467BD';
        const static_opacity = 0.3;
        const base_opacity = 0.5;
        const renderHelper = new ArticulationsRenderHelper({
            staticColor: static_color,
            movingPartColor: moving_part_color,
            attachedMovingPartColor: attached_moving_part_color,
            staticOpacity: static_opacity,
            basePartColor: base_part_color,
            baseOpacity: base_opacity
        });
        return renderHelper;
    }

    __registerDataset() {
        this.__assetManager.registerCustomAssetGroups({
            assetFiles: Constants.extraAssetsFile,
            filterBySource: this.assetSources,
            callback: (err, res) => {
                console.log('Registered models');
                this.__assetManager.clearCache();
                this.__datasetRegistered = true;
                this.Publish('RegisterDataset');
            }
        });
    }

    // Used to add Model Joint
    // If without movingPartId and basePartId, it will render all articulations that satisfy the limits
    // The format of modelInfo should be {'fullId': , 'movingPartId': , 'basePartId': , 'element':}
    addModelJoint(modelInfo, callback) {
        if (modelInfo instanceof Array) {
            // Add a list of modelInfo into dic
            for (let info of modelInfo) {
                this.__createViewTile(info, callback);
            }
        }
        else {
            // Add one model info into the dic
            this.__createViewTile(modelInfo, callback);
        }
    }

    // Used to remove Model Joint
    // If without movingPartId, it will remove all tiles loading this model; if without modelId, it will delete the relevant element; 
    // If modelInfo == null, then clear all tiles
    // The modelInfo is the same to that in addModelJoint
    removeModelJoint(modelInfo) {
        if (modelInfo == null) {
            // clear all tiles
            for (let i = this.viewTiles.length - 1; i >= 0; --i) {
                const viewTile = this.viewTiles[i];

                this.__removeListeners(i);

                // Remove the element if created not by UI
                const elements = this.__content.querySelectorAll('.list-item');
                for (let j = elements.length - 1; j >= 0; --j) {
                    if (elements[j].querySelector('.scene') == viewTile.getElement()) {
                        console.log('Remove Element');
                        this.__content.removeChild(elements[j]);
                    }
                }

                this.viewTiles.splice(i, 1);
            }
            
        }
        // Remove a list of modelInfo from dic
        else if (modelInfo instanceof Array) {
            for (let info of modelInfo) {
                this.filterModelJoint(info, true);
            }
        }
        // Remove on modelInfo from the dic
        else {
            this.filterModelJoint(modelInfo, true);
        }
    }

    filterModelJoint(info, removeFlag = false) {
        const fullId = info.modelId;
        const movingPartId = info.movingPartId;
        const basePartId = info.basePartId;
        const element = info.element;

        const filterViewTiles = [];

        for (let i = this.viewTiles.length - 1; i >= 0; --i) {
            let filterFlag = true;

            const viewTile = this.viewTiles[i];
            if (fullId != null && fullId != viewTile.getFullId()) {
                filterFlag = false;
            }

            const jointInfo = viewTile.getJointInfo();
            if (movingPartId != null && movingPartId != jointInfo['movingPartId']) {
                filterFlag = false;
            }
            if (basePartId != null && basePartId != jointInfo['basePartId']) {
                filterFlag = false;
            }

            if (element != null && element != viewTile.getElement()) {
                filterFlag = false;
            }

            if (filterFlag == true) {
                if (removeFlag == true) {
                    this.__removeListeners(i);

                    // Remove the element if created not by UI
                    const elements = this.__content.querySelectorAll('.list-item');
                    for (let j = elements.length - 1; j >= 0; --j) {
                        if (elements[j].querySelector('.scene') == viewTile.getElement()) {
                            console.log('Remove Element');
                            this.__content.removeChild(elements[j]);
                        }
                    }

                    this.viewTiles.splice(i, 1);
                }
                filterViewTiles.push(viewTile);
            }
        }
        return filterViewTiles;
    }

    setArticulations(modelInfo) {
        // All informations are necessary, or I cannot judge if this viewtile is loading
        const fullId = modelInfo.modelId;
        const movingPartId = modelInfo.movingPartId;
        const basePartId = modelInfo.basePartId;
        const articulations = modelInfo.articulations;

        var filterViewTiles = this.filterModelJoint({ 'modelId': fullId, 'movingPartId': movingPartId, 'basePartId': basePartId });

        if (filterViewTiles.length != 0) {
            filterViewTiles[0].setArticulations(articulations);
        }
        else {
            if (this.__articulations[fullId + movingPartId + basePartId] == null) {
                // Update to the latest requirement
                this.__articulations[fullId + movingPartId + basePartId] = articulations;

                this.SubscribeOnce(fullId + movingPartId + basePartId, this, () => {
                    filterViewTiles = this.filterModelJoint({ 'modelId': fullId, 'movingPartId': movingPartId, 'basePartId': basePartId });
                    filterViewTiles[0].setArticulations(this.__articulations[fullId + movingPartId + basePartId]);
                    this.__articulations[fullId + movingPartId + basePartId] = null;
                });
            }
            else {
                // Update to the latest requirement
                this.__articulations[fullId + movingPartId + basePartId] = articulations;
            }
        }

    }

    showXYZ(modelInfo, display) {
        // All informations are necessary, or I cannot judge if this viewtile is loading
        const fullId = modelInfo.modelId;
        const movingPartId = modelInfo.movingPartId;
        const basePartId = modelInfo.basePartId;

        var filterViewTiles = this.filterModelJoint({ 'modelId': fullId, 'movingPartId': movingPartId, 'basePartId': basePartId });

        if (filterViewTiles.length != 0) {
            filterViewTiles[0].showXYZ(display);
        }
        else {
            if (this.__showXYZ[fullId + movingPartId + basePartId] == null) {
                // Update to the latest requirement
                this.__showXYZ[fullId + movingPartId + basePartId] = display;

                this.SubscribeOnce(fullId + movingPartId + basePartId, this, () => {
                    filterViewTiles = this.filterModelJoint({ 'modelId': fullId, 'movingPartId': movingPartId, 'basePartId': basePartId });
                    filterViewTiles[0].showXYZ(this.__showXYZ[fullId + movingPartId + basePartId]);
                    this.__showXYZ[fullId + movingPartId + basePartId] = null;
                });
            }
            else {
                // Update to the latest requirement
                this.__showXYZ[fullId + movingPartId + basePartId] = display;
            }
        }
    }

    // Display: show or not
    // id: id to index the point
    // parameter: {location: [0, 0, 0], color: 0x000000, opacity: 1, size: 1}
    showPoint(modelInfo, display, id, parameter) {
        // All informations are necessary, or I cannot judge if this viewtile is loading
        const fullId = modelInfo.modelId;
        const movingPartId = modelInfo.movingPartId;
        const basePartId = modelInfo.basePartId;

        var filterViewTiles = this.filterModelJoint({ 'modelId': fullId, 'movingPartId': movingPartId, 'basePartId': basePartId });

        if (filterViewTiles.length != 0) {
            filterViewTiles[0].showPoint(display, id, parameter);
        }
        else {
            if (this.__showPoint[fullId + movingPartId + basePartId + id] == null) {
                // Update to the latest requirement
                this.__showPoint[fullId + movingPartId + basePartId + id] = { 'display': display, 'id': id, 'parameter': parameter };

                this.SubscribeOnce(fullId + movingPartId + basePartId, this, () => {
                    filterViewTiles = this.filterModelJoint({ 'modelId': fullId, 'movingPartId': movingPartId, 'basePartId': basePartId });
                    let info = this.__showPoint[fullId + movingPartId + basePartId + id];
                    filterViewTiles[0].showPoint(info['display'], info['id'], info['parameter']);
                    this.__showPoint[fullId + movingPartId + basePartId + id] = null;
                });
            }
            else {
                // Update to the latest requirement
                this.__showPoint[fullId + movingPartId + basePartId + id] = { 'display': display, 'id': id, 'parameter': parameter };
            }
        }
    }

    // Display: show or not
    // id: id to index the arrow
    // parameter: {location: [0, 0, 0], direction: [1, 1, 1], color: 0x000000, opacity: 1, length: 1, arrowSize: 0.2}
    showArrow(modelInfo, display, id, parameter) {
        // All informations are necessary, or I cannot judge if this viewtile is loading
        const fullId = modelInfo.modelId;
        const movingPartId = modelInfo.movingPartId;
        const basePartId = modelInfo.basePartId;

        var filterViewTiles = this.filterModelJoint({ 'modelId': fullId, 'movingPartId': movingPartId, 'basePartId': basePartId });

        if (filterViewTiles.length != 0) {
            filterViewTiles[0].showArrow(display, id, parameter);
        }
        else {
            if (this.__showArrow[fullId + movingPartId + basePartId + id] == null) {
                // Update to the latest requirement
                this.__showArrow[fullId + movingPartId + basePartId + id] = { 'display': display, 'id': id, 'parameter': parameter };

                this.SubscribeOnce(fullId + movingPartId + basePartId, this, () => {
                    filterViewTiles = this.filterModelJoint({ 'modelId': fullId, 'movingPartId': movingPartId, 'basePartId': basePartId });
                    let info = this.__showArrow[fullId + movingPartId + basePartId + id];
                    filterViewTiles[0].showArrow(info['display'], info['id'], info['parameter']);
                    this.__showArrow[fullId + movingPartId + basePartId + id] = null;
                });
            }
            else {
                // Update to the latest requirement
                this.__showArrow[fullId + movingPartId + basePartId + id] = { 'display': display, 'id': id, 'parameter': parameter };
            }
        }
    }

    // Display: show or not
    // id: id to index the plane
    // parameter: {location: [1, 1, 1], normal: [1, 1, 1], size: 1, color: 0x000000, opacity: 1}
    showPlane(modelInfo, display, id, parameter) {
        // All informations are necessary, or I cannot judge if this viewtile is loading
        const fullId = modelInfo.modelId;
        const movingPartId = modelInfo.movingPartId;
        const basePartId = modelInfo.basePartId;

        var filterViewTiles = this.filterModelJoint({ 'modelId': fullId, 'movingPartId': movingPartId, 'basePartId': basePartId });

        if (filterViewTiles.length != 0) {
            filterViewTiles[0].showPlane(display, id, parameter);
        }
        else {
            if (this.__showPlane[fullId + movingPartId + basePartId + id] == null) {
                // Update to the latest requirement
                this.__showPlane[fullId + movingPartId + basePartId + id] = { 'display': display, 'id': id, 'parameter': parameter };

                this.SubscribeOnce(fullId + movingPartId + basePartId, this, () => {
                    filterViewTiles = this.filterModelJoint({ 'modelId': fullId, 'movingPartId': movingPartId, 'basePartId': basePartId });
                    let info = this.__showPlane[fullId + movingPartId + basePartId + id];
                    filterViewTiles[0].showPlane(info['display'], info['id'], info['parameter']);
                    this.__showPlane[fullId + movingPartId + basePartId + id] = null;
                });
            }
            else {
                // Update to the latest requirement
                this.__showPlane[fullId + movingPartId + basePartId + id] = { 'display': display, 'id': id, 'parameter': parameter };
            }
        }
    }



    __createViewTile(info, callback) {
        const fullId = info.modelId;
        const movingPartId = info.movingPartId;
        const basePartId = info.basePartId;
        const jointInfo = { 'movingPartId': movingPartId, 'basePartId': basePartId };
        const articulations = info.articulations;

        let tileElement;

        if (info['element'] == null) {
            const element = document.createElement("div");
            element.className = "list-item";
            element.innerHTML = template.replace('$', 'Wonderful!');
            this.__content.appendChild(element);
            tileElement = element.querySelector(".scene");
        }
        else {
            tileElement = info['element'];
        }

        // Directly build the scene
        this.__loadModel(fullId, jointInfo, tileElement, articulations, callback);
        // if (this.__cachedModelInstances.hasOwnProperty(fullId)) {
        //     const viewTile = new ViewTile(this.__cachedModelInstances[fullId].clone(), fullId, jointInfo, tileElement, this.autoRotate);
        //     this.viewTiles.push(viewTile);
        //     this.__updateViewTiles();
        // }
        // else {
        //     // If the model has been loading
        //     if (this.__loadingModels.hasOwnProperty(fullId)) {
        //         this.SubscribeOnce(fullId, this, () => {
        //             const viewTile = new ViewTile(this.__cachedModelInstances[fullId].clone(), fullId, jointInfo, tileElement, this.autoRotate);
        //             this.viewTiles.push(viewTile);
        //             this.__updateViewTiles();
        //         });
        //     }
        //     else {
        //         this.__loadingModels[fullId] = true;
        //         // Load the obj
        //         this.__loadModel(fullId, jointInfo, tileElement);
        //     }
        // }
    }

    __loadModel(fullId, jointInfo, tileElement, articulations, callback) {
        // const dataset_name = fullId.split('.')[0];

        const addViewTile = (err, modelInstance) => {
            //            this.__cachedModelInstances[fullId] = modelInstance;
            // tileElement.innerHTML = name;
            if (callback != null) {
                callback();
            }
            const viewTileOpts = { 'modelInstance': modelInstance, 'fullId': fullId, 'jointInfo': jointInfo, 'element': tileElement, 'autoRotate': this.autoRotate, 'articulations': articulations }
            const viewTile = new ViewTile(viewTileOpts);
            viewTile.setStaticMode(this.staticMode);
            this.viewTiles.push(viewTile);
            this.__updateViewTiles();
            console.log('Finish Loading Model ' + fullId);
            //this.Publish(fullId);
            this.Publish("AddTile", viewTile);
            this.Publish(fullId + jointInfo.movingPartId + jointInfo.basePartId);
        };

        const info = { 'fullId': fullId, 'format': 'gltf' }

        // const name = tileElement.innerHTML;
        // tileElement.innerHTML = 'Loading...';

        if (this.__datasetRegistered == true) {
            this.__assetManager.loadModel(info, addViewTile);
        }
        else {
            this.SubscribeOnce('RegisterDataset', this, () => {
                this.__assetManager.loadModel(info, addViewTile);
            })
        }
    }

    __updateViewTiles() {
        const numViewTiles = this.viewTiles.length;
        const newViewTile = this.viewTiles[numViewTiles - 1];
        for (let i = 0; i < numViewTiles - 1; ++i) {
            this.viewTiles[i].addListenElement(newViewTile.getElement());
            newViewTile.addListenElement(this.viewTiles[i].getElement());
        }

        const controlInfo = this.viewTiles[0].getControls().getState();
        newViewTile.getControls().setState(controlInfo);
    }

    __removeListeners(index) {
        // Used to clean the eventlisten hook up
        const numViewTiles = this.viewTiles.length;
        const deletedViewTile = this.viewTiles[index];
        for (let i = 0; i < numViewTiles; ++i) {
            if (i == index) continue;
            this.viewTiles[i].removeListenElement(deletedViewTile.getElement());
            deletedViewTile.removeListenElement(this.viewTiles[i].getElement());
        }
    }

    setAutoRotate(autoRotate) {
        this.autoRotate = autoRotate;

        for (let viewTile of this.viewTiles) {
            viewTile.setAutoRotate(autoRotate);
        }
    }

    setStaticMode(staticMode) {
        this.staticMode = staticMode;
        for (let viewTile of this.viewTiles) {
            viewTile.setStaticMode(staticMode);
        }
    }

    updateSize() {
        const width = this.__canvas.clientWidth;
        const height = this.__canvas.clientHeight;

        if (this.__canvas.width !== width || this.__canvas.height !== height) {
            this.__renderer.setSize(width, height, false);
        }
    }

    animate() {
        this.render();
        requestAnimationFrame(() => { this.animate(); });
    }

    render() {
        this.updateSize();
        this.__renderer.setScissorTest(false);
        this.__renderer.clear();
        this.__renderer.setScissorTest(true);

        this.viewTiles.forEach((viewTile) => {
            viewTile.updateTileState(this.__renderHelper);
            viewTile.updateViewport(this.__renderer);
        });
    }
}

module.exports = MultiModelView;