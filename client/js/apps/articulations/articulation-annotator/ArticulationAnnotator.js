const Constants = require('Constants');
const DomHelper = require('./DomHelper');
const ArticulationsConstants = require('./ArticulationsConstants');
const ArticulationAnnotatorState = require('./ArticulationAnnotatorState');
const ArticulationAnimator = require('./ArticulationAnimator');
const ArticulatedObject = require('articulations/ArticulatedObject');
const ExportArticulatedObject3DForm = require('ui/modal/ExportArticulatedObject3DForm');
const PartGeomsGen = require('parts/PartGeomsGen');
const Object3DUtil = require('geo/Object3DUtil');
const SceneHelper = require('./SceneHelper');
const PartVisualizer = require('./PartVisualizer');
const AnnotationLoadSave = require('./AnnotationLoadSave');
const CanvasUtil = require('ui/CanvasUtil');
const FileUtil = require('io/FileUtil');
const Timings = require('util/Timings');
const UIUtil = require('ui/UIUtil');
const dat = require('ui/datGui');
const _ = require('util/util');

const ArticulationTypes = ArticulationAnnotatorState.ArticulationTypes;

class PartState {
	// part state used by the annotator
	// selected = active part that is being edited
	// isConnected = part that is connected / attached to the active/selected part
	// isBase = part that is considered a base part of the active/selected part
	// isCandidate = part that is an candidate base/attached part
	// hovered = part is being hovered over

	constructor() {
		this.hovered = false;
		this.selected = false;
		this.isConnected = false;
		this.isBase = false;
		this.isCandidate = false;
		this.articulationOptions = null;
	}

	clear() {
		this.selected = false;
		this.isConnected = false;
		this.isBase = false;
		this.isCandidate = false;
	}
}

class ArticulationAnnotator {
	constructor(params) {
		this.container = params.container;
		this.appId = "ArtAnn.v4-20231120";
		this.url = new URL(window.location.href);
		this.modelId = this.url.searchParams.get('modelId');
		this.labelType = this.url.searchParams.get('labelType');
		this.useDatGui = _.parseBoolean(this.url.searchParams.get('useDatGui'), false);
		this.timings = new Timings();
		this.mouse = null;
		this.active = false;
		this.playing = false;

		// Option flags
		this.refitOBB = this.url.searchParams.get('refitOBB');
		this.reorientOBB = true;  // orient OBBs if no existing annotation
		// Experimental features
		this.allowSelectAttached = params.allowSelectAttached; // Allow specification of what part is attached
		this.allowAddGeometry = _.parseBoolean(this.url.searchParams.get('allowAddGeometry'), params.allowAddGeometry);       // Allow geometry to be added
		this.suggestEnabled = true;

		// Whether to show textured or untextured
		this.__useTextured = false;
		// Whether to use annotation colors
		this.__useAnnotationColors = true;
		// Whether to use special colors for added geometry
		this.__useAddedGeometryColors = false;
		// Whether to use double sided materials
		this.__useDoubleSided = false;
		// Whether to show part obbs (local) - for debugging
		this.__showLocalPartObbs = false;
		// Whether to show part obbs (world) - for debugging
		this.__showWorldPartObbs = false;

		this.__motionStates = ['closed'];
		this.domHelper = new DomHelper({
			container: this.container,
			articulationTypes: ['translation', 'rotation'],
			motionStates: this.__motionStates,
			groupParts: this.isLabelTypeObjectPart,
			allowAddGeometry: this.allowAddGeometry,
			allowSelectAttached: this.allowSelectAttached
		});

		// what annotation to start from
		let startFrom = this.url.searchParams.get('articulateFrom');
		if (startFrom == null) {
			startFrom = 'latest';
		}
		this.loadSave = new AnnotationLoadSave({
			appId: this.appId,
			modelId: this.modelId,
			domHelper: this.domHelper,
			startFrom: startFrom,
			loadAnnotationsUrl: `${Constants.baseUrl}/articulation-annotations/load-annotations`,
			submitAnnotationsUrl: `${Constants.baseUrl}/articulation-annotations/submit-annotations`,
			timings: this.timings,
			enforceArticulations: params.enforceArticulations,
			message: (message, style) => this.alert(message, style),
			alert: (message) => bootbox.alert(message),
			confirm: (message, cb) => bootbox.confirm(message, cb)
		});

		this.setupDatGui();
		this.loadScene();
	}

	get allowAnyBasePart() {
		if (this.state && this.state.__candidateBasePartsOpts) {
			return this.state.__candidateBasePartsOpts.useAllPartsForBase;
		} else {
			return false;
		}
	}

	set allowAnyBasePart(flag) {
		if (this.state && this.state.__candidateBasePartsOpts) {
			this.state.__candidateBasePartsOpts.useAllPartsForBase = flag;
			if (this.active) {
				this.state.updateCandidateBaseParts();
				this.displayBaseOptions(this.state.activePart);
			}
		}
	}
	get isLabelTypeObjectPart() {
		return this.labelType === 'object-part';
	}

	get useDoubleSided() {
		return this.__useDoubleSided;
	}

	set useDoubleSided(flag) {
		this.__useDoubleSided = flag;
		if (this.partVisualizer) {
			if (flag) {
				this.partVisualizer.setMaterialSide(THREE.DoubleSide);
			} else {
				this.partVisualizer.setMaterialSide(THREE.FrontSide);
			}
		}
	}

	get useTextured() {
		return this.__useTextured;
	}

	set useTextured(flag) {
		this.__useTextured = flag;
		if (flag) {
			this.restoreMaterial('texturedMaterial');
		} else {
			this.restoreMaterial('coloredMaterial');
		}
	}

	get useAnnotationColors() {
		return this.__useAnnotationColors;
	}

	set useAnnotationColors(flag) {
		this.__useAnnotationColors = flag;
		this.useTextured = this.useTextured;
	}

	get useAddedGeometryColors() {
		return this.__useAddedGeometryColors;
	}

	set useAddedGeometryColors(flag) {
		this.__useAddedGeometryColors = flag;
		this.useTextured = this.useTextured;
	}

	get showLocalPartObbs() {
		return this.__showLocalPartObbs;
	}

	set showLocalPartObbs(flag) {
		this.__showLocalPartObbs = flag;
		if (this.partVisualizer) {
			if (flag) {
				this.partVisualizer.showPartObbs(false);
			} else {
				this.partVisualizer.hidePartObbs(false);
			}
		}
	}

	get showWorldPartObbs() {
		return this.__showWorldPartObbs;
	}

	set showWorldPartObbs(flag) {
		this.__showWorldPartObbs = flag;
		if (this.partVisualizer) {
			if (flag) {
				this.partVisualizer.showPartObbs(true);
			} else {
				this.partVisualizer.hidePartObbs(true);
			}
		}
	}

	setupDatGui() {
		if (this.useDatGui) {
			// Set up dat gui;
			const gui = new dat.GUI();
			gui.close();

			this.datgui = gui;
			const appIdGui = this.datgui.add(this, 'appId');
			$(appIdGui.domElement).find('input').prop('readonly', true);
			this.datgui.add(this, 'suggestEnabled').name('suggest').listen();
			this.datgui.add(ArticulationsConstants, 'PART_OPACITY', 0, 1).name('part opacity');
			this.datgui.add(ArticulationsConstants, 'ACTIVE_PART_OPACITY', 0, 1).name('selected part opacity');
			if (this.allowAddGeometry) {
				this.datgui.add(ArticulationsConstants, 'ADDED_PART_OPACITY', 0, 1).name('added part opacity');
			}
			this.datgui.add(this, 'useTextured').name('textured').listen();
			this.datgui.add(this, 'useAnnotationColors').name('colors').listen();
			if (this.allowAddGeometry) {
				this.datgui.add(this, 'useAddedGeometryColors').name('color added geometry').listen();
			}
			this.datgui.add(this, 'useDoubleSided').name('double-side').listen();
			this.datgui.add(this, 'showLocalPartObbs').name('local-obbs').listen();
			this.datgui.add(this, 'showWorldPartObbs').name('world-obbs').listen();
			this.datgui.add(this, 'allowAnyBasePart').name('any-base').listen();
			this.datgui.add(this, 'checkClearAnnotations').name('Clear Annotations');
			this.datgui.add(this, 'exportAnnotations').name('Export annotations');
			this.datgui.add(this, 'importAnnotations').name('Import annotations');
			this.datgui.add(this, 'exportMesh').name('Export mesh');
		}
	}

	/**
	 * Called when part is selected to be annotated.
	 *
	 * Re-initializes states of variables so part can be annotated. Re-generates
	 * part hierarchy with the input part as the root. Colors connected parts and
	 * displays axis.
	 *
	 * @param part {parts.Part}
	 */
	addArticulation(part) {
		this.pauseArticulationAnimation();
		this.active = true;
		this.domHelper.partsSelectionUI.setPartTagSelected(part.pid, true);
		let articulationType = null;
		if (this.suggestEnabled) {
			// See if there is a suggested articulationType
			articulationType = this.state.suggester.getArticulationType(part);
		}
		this.annotateArticulationType(part, articulationType);
	}

	/**
	 * Called when articulation dialog and articulation type is changed
	 *
	 * @param part {parts.Part}
	 * @param articulationType {string}
	 */
	annotateArticulationType(part, articulationType) {
		this.state.initAnnotation(part, articulationType, this.suggestEnabled);
		this.editArticulationType(part, articulationType, null);
	}

	/**
	 * Redisplays annotation wizard with data supplied by annotation.
	 *
	 * @param part {parts.Part}
	 * @param annotation {Object}
	 * @param ind {number}
	 */
	editArticulation(part, annotation, ind) {
		this.pauseArticulationAnimation();
		this.active = true;
		this.domHelper.partsSelectionUI.setPartTagSelected(part.pid, true);
		this.state.setActive(part, annotation, ind);

		// Shows annotation wizard on left side of screen
		this.editArticulationType(part, annotation.type, annotation);
	}

	/**
	 * Animates previously submitted annotation.
	 *
	 * @param part {parts.Part}
	 * @param annotation {Object}
	 */
	playArticulationAnimation(part, annotation, ind) {
		this.pauseArticulationAnimation();
		this.articulationAnimator.isPlaying = true;
		this.playing = true;
		annotation.needsReview = false;
		if (ind != null) {
			this.domHelper.showPauseButton(ind);
		}
		// Note: playArticulationAnimation and annotate doesn't interact nicely
		// This will make the part be the active part for annotation
		this.state.setActive(part, annotation);
	}

	/**
	 * Stops animation of previously submitted annotation.
	 */
	pauseArticulationAnimation(ind) {
		this.playing = false;
		const inds = ind != null? [ind] : this.getAnnotations(this.__selectedPid).map((x,i) => i);
		for (let ind of inds) {
			this.domHelper.showPlayButton(ind);
		}
		// Note: playArticulationAnimation and annotate doesn't interact nicely
		// This will clear the annotation state...
		this.state.resetState();
	}

	/**
	 * Get annotations associated with this part
	 */
	getAnnotations(pid) {
		return this.state.annotations[pid] || [];
	}

	/* Add part geometry */

	isAddPartGeometryAllowed(part) {
		// use the part label to determine whether add geometry is allowed
		return part.label !== 'unknown';
	}

	showPartGeometryUI(part) {
		this.object3D.updateMatrixWorld();
		this.domHelper.partGeomUI = this.domHelper.createPartGeomUI(part, this.object3D, 1);
		let oldUseTextured;
		this.domHelper.partGeomUI.Subscribe('preGenerateGeometry', this, (part) => {
			oldUseTextured = this.useTextured;
			this.useTextured = true;
		});
		this.domHelper.partGeomUI.Subscribe('postGenerateGeometry', this, (part, geom) => {
			if (geom) {
				PartVisualizer.initPartMaterials(part, geom.object3D, ArticulationsConstants.INITIAL_COLOR, this.assetSideness);
			}
			this.useTextured = oldUseTextured;
		});
		this.domHelper.partGeomUI.Subscribe('close', this, () => {
			this.domHelper.partGeomUI = null;
			$(window).off('keyup');
		});
		$(window).off('keyup');
		$(window).keyup((event) => {
			if (event.key === 'Escape') {
				if (this.domHelper.partGeomUI) {
					this.domHelper.partGeomUI.close();
				}
			}
		});

		return this.domHelper.partGeomUI;
	}

	ensurePartGeometry(part) {
		if (part.geoms && part.geoms.length) {
			// Okay
		} else {
			const ui = this.showPartGeometryUI(part);
			ui.getAddBtn().click();
			ui.close();
		}
	}

	__restorePartsGeometry(parts, callback) {
		const oldUseTextured = this.useTextured;
		this.useTextured = true;
		PartGeomsGen.generateGeometries(PartGeomsGen.getShapeGenerator(), this.object3D, parts, false,
			(err, res) => {
				for (let part of parts) {
					if (part && part.geoms) {
						for (let geom of part.geoms) {
							PartVisualizer.initPartMaterials(part, geom.object3D, ArticulationsConstants.INITIAL_COLOR, this.assetSideness);
						}
					}
				}

				this.useTextured = oldUseTextured;
				callback(err, res);
			});
	}

	/* Color parts */

	/**
	 * Color part
	 * @param part {parts.Part}
	 * @param color Color to apply to the part
	 * @param opacity opacity to apply to the part
	 * @param [filter] optional filter function for whether to color the mesh or not
	 */
	colorPart(part, color, opacity = 1, filter = null) {
		this.partVisualizer.colorPart(part, color, opacity, filter);
	}

	colorPartByState(part) {
		const ps = part.state;
		if (this.__useAnnotationColors) {
			if (ps.hovered) {
				this.colorPart(part, ArticulationsConstants.ONHOVER_PART_COLOR, ArticulationsConstants.PART_OPACITY);
			} else if (ps.selected) {
				this.colorPart(part, ArticulationsConstants.ACTIVE_PART_COLOR, ArticulationsConstants.ACTIVE_PART_OPACITY);
			} else if (ps.isBase) {
				this.colorPart(part, ArticulationsConstants.BASE_PART_COLOR, ArticulationsConstants.PART_OPACITY);
			} else if (ps.isConnected) {
				this.colorPart(part, ArticulationsConstants.CONNECTED_COLOR, ArticulationsConstants.PART_OPACITY);
			} else if (ps.isCandidate) {
				this.colorPart(part, ArticulationsConstants.CANDIDATE_COLOR, ArticulationsConstants.PART_OPACITY);
			} else {
				const anns = this.getAnnotations(part.pid);
				if (anns.length > 0) {
					if (anns.filter(ann => ann.needsReview).length > 0) {
						this.colorPart(part, ArticulationsConstants.AUTO_ANNOTATED_PART_COLOR, ArticulationsConstants.PART_OPACITY);
					} else {
						this.colorPart(part, ArticulationsConstants.ANNOTATED_PART_COLOR, ArticulationsConstants.PART_OPACITY);
					}
				} else {
					this.colorPart(part, ArticulationsConstants.INITIAL_COLOR, ArticulationsConstants.PART_OPACITY);
				}
			}
		} else {
			if (ps.hovered) {
				this.colorPart(part, ArticulationsConstants.ONHOVER_PART_COLOR, ArticulationsConstants.PART_OPACITY);
			} else {
				if (this.useTextured) {
					this.restoreColor(part, ArticulationsConstants.PART_OPACITY);
				} else {
					this.colorPart(part, ArticulationsConstants.INITIAL_COLOR, ArticulationsConstants.PART_OPACITY);
				}
			}
		}
		if (this.__useAddedGeometryColors) {
			this.colorPart(part, ArticulationsConstants.ADDED_GEOMETRY_COLOR, ArticulationsConstants.ADDED_PART_OPACITY,
				(mesh) => mesh.userData.shape != null );
		}
	}

	updatePartColors(parts) {
		parts.forEach((p) => this.colorPartByState(p));
	}

	restorePartMaterial(part, matName) {
		this.partVisualizer.restorePartMaterial(part, matName, this.__useDoubleSided);
	}

	restoreMaterial(matName) {
		this.partVisualizer.restoreMaterial(matName);
	}

	restoreColor(opacity) {
		this.partVisualizer.restoreColor(opacity);
	}

	/* Function for editing and display articulation wizard */

	/**
	 * Start editing articulation for articulationType
	 *
	 * @param part {parts.Part}
	 * @param articulationType {string}
	 * @param annotation {Object}
	 */
	editArticulationType(part, articulationType, annotation) {
		this.displayEditArticulationDialog(part, this.state.candidateParts, articulationType,
			this.state.hasCurrentAnnotation? 'Edit' : 'Add');

		// update state
		const resetBaseOptions = annotation == null; // reset if we don't have an existing annotation
		this.state.setArticulationType(articulationType, resetBaseOptions);
		this.displayBaseOptions(part);

		// Make sure UI is updated
		if (articulationType === ArticulationTypes.TRANSLATION) {
			this.domHelper.editArticulationUI.displayTranslationBaseOptions();
			if (!resetBaseOptions) {
				this.displayTranslationAxisOptions();
			}
		} else if (articulationType === ArticulationTypes.ROTATION) {
			this.domHelper.editArticulationUI.displayRotationBaseOptions();
			if (!resetBaseOptions) {
				this.displayRotationAxisOptions(false);
			}
		}

		if (this.suggestEnabled && articulationType) {
			const guessedBaseParts = this.state.guessBaseParts();
			if (guessedBaseParts) {
				this.domHelper.editArticulationUI.selectBaseParts(guessedBaseParts, articulationType);
			}
		}
	}

	/**
	 * Create annotation wizard for part (base options displayed after user chooses
	 * annotation type).
	 *
	 * @param part {parts.Part}
	 * @param children {Array<parts.Part>}
	 * @param type {string} Articulation type
	 * @param tag {string} String to display in the dialog ('Add' or 'Edit')
	 */
	displayEditArticulationDialog(part, children, type, tag) {
		this.domHelper.displayAnnotationWizard(part, children, type, tag);

		// bind events
		this.domHelper.editArticulationUI.onArticulationTypeChanged((articulationType) => {
			this.annotateArticulationType(part, articulationType);
		});

		this.domHelper.editArticulationUI.onSave(() => {
			this.saveAnnotation(part);
		});

		this.domHelper.editArticulationUI.onCancel(() => {
			this.cancelAnnotation(part);
		});

	  $(window).off('keyup');
		$(window).keyup((event) => {
			if (!this.preventKeyShortcuts) {
				if (event.key === 'Escape') {
					if (this.state.activeWidget) {
						this.state.activeWidget.cancel();
					} else {
						if (this.domHelper.editArticulationUI.activeWidget) {
							this.domHelper.editArticulationUI.activeWidget.cancel();
						} else {
							this.cancelAnnotation(part);
						}
					}
				}

				if (event.key === 'Enter') {
					if (this.state.activeWidget) {
						this.state.activeWidget.save();
					} else {
						if (this.domHelper.editArticulationUI.activeWidget) {
							this.domHelper.editArticulationUI.activeWidget.save();
						} else {
							this.saveAnnotation(part);
						}
					}
				}
			}
		});
	}

	/**
	 * Displays list of checkboxes for each possible base part after user selects annotation
	 * type (i.e. rotation/translation).
	 *
	 * @param part {parts.Part}
	 */
	displayBaseOptions(part) {
		// console.log('baseOptions', this.state.candidateParts, this.state.basePids, this.state.attachedPids);
		this.domHelper.editArticulationUI.displayBaseOptions(this.state.candidateParts, this.state.basePids, this.state.attachedPids);

		this.domHelper.editArticulationUI.onBaseChanged((articulationType, pids, isBase, isAttached) => {
			// console.log('onBaseChanged', part, pids, isBase, isAttached);
			if (!Array.isArray(pids)) {
				pids = [pids];
			}
			const selectedParts = pids.map(pid => this.parts[pid]);
			const isConnected = isBase || isAttached;
			selectedParts.forEach((selectedPart,i) => {
				// Make sure connectivity for part is updated
				this.state.setConnectivity(this.state.activePart, selectedPart, isConnected);
				selectedPart.state.isConnected = isConnected;
				// Note: selectedPart color is updated either in addBaseParts or removeBaseParts
			});
			if (isBase) {
				this.state.addBaseParts(part, selectedParts);
				if (this.state.baseParts.length) {
					if (articulationType === ArticulationTypes.TRANSLATION) {
						this.displayTranslationAxisOptions();
					} else {
						this.displayRotationAxisOptions(true);  // Check this
					}
				}
			} else {
				this.state.removeBaseParts(part, selectedParts);
				if (this.state.baseParts.length === 0) {
					this.domHelper.editArticulationUI.hideAxisOptions();
				}
			}
		}, true);

		this.domHelper.editArticulationUI.onBaseHover((articulationType, pid, hover) => {
			const p = this.parts[pid];
			if (p) {
				if (hover) {
					this.colorPart(p, ArticulationsConstants.BASE_PART_COLOR, ArticulationsConstants.PART_OPACITY);
				} else {
					this.colorPartByState(p);
				}
			}
		}, true);
	}

	onUpdateMotionStates(targetMotionStates, rangeWidget, motionStateWidgets) {
		for (let motionState of this.__motionStates) {
			const widget = motionStateWidgets[motionState];
			const v = widget.value;
			this.onUpdateMotionState(targetMotionStates, rangeWidget, motionState, v);
		}
	}

	onUpdateMotionState(targetMotionStates, rangeWidget, motionState, value) {
		//console.log('update motionState', motionState, value);
		targetMotionStates[motionState] = {
			percent: value,
			value: rangeWidget.rangePercentToValue(value)
		};
	}

	/**
	 * Displays menu for choosing translation axis + double slider for specifying range.
	 */
	displayTranslationAxisOptions() {
		this.state.setTranslationAxisOptions();
		this.state.displayAxis.update(true, this.state.getAxisLength());
		const widgets = this.domHelper.editArticulationUI.displayTranslationAxisOptions(
			this.state.fullAxisOptions, this.state.axisIndex, this.state.translation);

		this.articulationAnimator.isPlaying = true;
		if (widgets.animateArticulationWidget) {
			this.articulationAnimator.bindPlayWidget(widgets.animateArticulationWidget);
		}

		widgets.axisSelectionWidget.configure(this, this.state, this.state.translation);
		widgets.axisSelectionWidget.change(axisIndex => {
			this.state.updateTranslationAxis(axisIndex);
			this.displayTranslationAxisOptions();
		});

		const onTranslationAxisSliderChange = (rangeMin, rangeMax) => {
			this.state.displayAxis.updateRange(rangeMin, rangeMax);
		};

		const onTranslationAxisSliderComplete = (rangeMin, rangeMax) => {
			this.state.translation.rangeMin = rangeMin;
			this.state.translation.rangeMax = rangeMax;
			this.onUpdateMotionStates(this.state.translation.motionStates, widgets.rangeWidget, widgets.motionStateWidgets);
			this.state.updateTranslationRange();
		};

		widgets.rangeWidget.change(onTranslationAxisSliderChange, onTranslationAxisSliderComplete);
		for (let motionState of this.__motionStates) {
			const widget = widgets.motionStateWidgets[motionState];
			widget.change(null, (value) =>
				this.onUpdateMotionState(this.state.translation.motionStates, widgets.rangeWidget, motionState, value));
		}
	}

	/**
	 * Displays menu for choosing rotation axis + double slider for specifying range.
	 */
	displayRotationAxisOptions(reset=true) {
		if (reset) {
			this.state.resetRotationAxisOptions();
		}
		this.state.displayRadar.update();
		// TODO: check if we need this (at some point seems to fix some issues with the guides being out of sync)
		this.state.resetRotationUpdateWidgets();

		const pivotOptions = this.state.getRotationPivotOptions();
		const widgets = this.domHelper.editArticulationUI.displayRotationAxisOptions(
			this.state.fullAxisOptions, this.state.axisIndex, this.state.refAxisIndex,
			pivotOptions, this.state.rotation);

		this.articulationAnimator.isPlaying = true;
		if (widgets.animateArticulationWidget) {
			this.articulationAnimator.bindPlayWidget(widgets.animateArticulationWidget);
		}

		widgets.axisSelectionWidget.configure(this, this.state, this.state.rotation);
		widgets.axisSelectionWidget.change(axisIndex => {
			this.state.updateRotationAxis(axisIndex);
			widgets.refAxisSelectionWidget.setAxisOptions(this.state.fullAxisOptions, this.state.refAxisIndex, true);
		});
		widgets.refAxisSelectionWidget.configure(this, this.state, this.state.rotation);
		widgets.refAxisSelectionWidget.setAxisOptions(this.state.fullAxisOptions, this.state.refAxisIndex, true);
		widgets.refAxisSelectionWidget.change(axisIndex => {
			this.state.updateReferenceAxis(axisIndex);
		});

		this.domHelper.editArticulationUI.onLeftRightAxisPivotChange(val => this.state.rotationPivotLeftRight = val);
		this.domHelper.editArticulationUI.onUpDownAxisPivotChange(val => this.state.rotationPivotUpDown = val);
		this.domHelper.editArticulationUI.onForwardBackAxisPivotChange(val => this.state.rotationPivotFrontBack = val);

		const valueTransform = widgets.rangeWidget.valueTranform? widgets.rangeWidget.valueTranform : (x) => x;
		const onRotationAxisSliderChange = (rangeMin, rangeMax) => {
			this.state.resetPartRotation();

			this.state.rotation.rangeMin = valueTransform(rangeMin);
			this.state.rotation.rangeMax = valueTransform(rangeMax);
			this.onUpdateMotionStates(this.state.rotation.motionStates, widgets.rangeWidget, widgets.motionStateWidgets);
			this.state.displayAxis.update();
			this.state.displayRadar.update();
		};

		widgets.rangeWidget.change(onRotationAxisSliderChange);
		for (let motionState of this.__motionStates) {
			const widget = widgets.motionStateWidgets[motionState];
			widget.change(null, (value) =>
				this.onUpdateMotionState(this.state.rotation.motionStates, widgets.rangeWidget, motionState, value));
		}
	}

	saveAnnotation(part) {
		if (this.state.baseParts.length) {
			const annotation = this.state.storeAnnotations(part);
			if (this.domHelper.autoSuggestOn()) {
				const siblings = this.state.storeSuggestions(annotation, part);
				this.updatePartColors(siblings);
				this.domHelper.partsSelectionUI.setPartTagAnnotated(part.pid, siblings.map(sibpart => sibpart.pid));
			} else {
				this.domHelper.partsSelectionUI.setPartTagAnnotated(part.pid);
			}

			this.closeAnnotationWizard(part);
		} else {
			alert('Annotation incomplete.');
		}
	}

	cancelAnnotation(part) {
		this.closeAnnotationWizard(part);
	}

	closeAnnotationWizard(part) {
		this.active = false;
		this.state.resetState();

		this.domHelper.hideAnnotationWizard();
		this.updateSidebar(part.pid);
		$(window).off('keyup');
	}

	/**
	 * Makes part 'active' by highlighting part and displaying its annotations (as such
	 * enabling it to be annotated)
	 *
	 * @param pid {number} Part ID
	 */
	setActivePart(pid) {
		this.domHelper.partsSelectionUI.setPartTagSelected(pid);

		if (this.playing) {
			this.cancelAnnotation(this.state.activePart);
			this.state.setActive(this.parts[pid]);

			const partAnns = this.getAnnotations(pid);
			if (partAnns.length) {
				this.playArticulationAnimation(this.parts[pid], partAnns[0], 0);
			}
		} else {
			this.state.setActive(this.parts[pid]);
		}

		this.updateSidebar(pid);
	}

	loadScene() {
		// Setup general HTML
		this.displayMain();

		const helper = new SceneHelper({
			container: this.container,
			modelId: this.modelId,
			labelParser: this.isLabelTypeObjectPart? 'ObjectPartLabelParser' : null,
			loadSave: this.loadSave,
			refitOBB: this.refitOBB,
			colors: ArticulationsConstants
		});
		const useSameObjectInst = this.isLabelTypeObjectPart && this.allowSelectAttached;
		this.domHelper.showLoadingMessage('scene and annotations');
		helper.initScene(
			(setup) => {
			this.partVisualizer = new PartVisualizer(setup.scene, setup.object3D, setup.parts);
			const state = new ArticulationAnnotatorState({
				scene: setup.scene,
				partsAnnId: setup.partsAnnId,
				parts: setup.parts,
				vizNode: this.partVisualizer.vizNode,
				annotations: setup.annotations,
				connectivityGraph: setup.connectivityGraph,
				object3D: setup.object3D,
				editUI: this.domHelper.editArticulationUI,
				candidateBasePartsOpts: {
					useSameObjectInst: useSameObjectInst,
					allowConnected: true,
					allowAnyPart: !useSameObjectInst,
					useAllPartsForBase: false,
					guessBaseByLabel: true    // guess that if a part name is base, then it is base
				},
				onPartUpdated: (part) => {
 				  this.colorPartByState(part);
				}
			});

			this.state = state;
			this.parts = state.parts;
			this.scene = state.scene;
			this.camera = setup.camera;
			this.controls = setup.controls;
			this.object3D = state.object3D;
			this.object3D.name = this.modelId;
			this.renderer = setup.renderer;
			this.state = state;
			this.assetSideness = setup.assetSideness;
			this.useDoubleSided = setup.assetSideness === THREE.DoubleSide;
			this.parts.forEach(part => part.state = new PartState());
			if (this.reorientOBB && !state.annotations.length) {
				this.reorientPartOBBs();
			}
			this.loadSave.updateState(state);
			if (this.allowAddGeometry) {
				// TODO: wait for this
				this.__restorePartsGeometry(this.parts, () => {});
			}

			if (setup.connectivityGraphViz) {
				this.domHelper.addConnectivityGraphViz(setup.connectivityGraphViz);
			} else if (setup.connectivityGraph) {
				this.domHelper.addConnectivityGraphViz(setup.connectivityGraph);
			}
			this.domHelper.createPartsSelectionUI(this.parts, this.state.annotations);
			this.domHelper.clearLoadingDialog();

				// Add transform controls
  		this.createTransformControls();
			// Enable highlighting and setting parts active
			this.bindPartSelectionEvents();
			this.bindWindowKeydownEvents();

			// Renders sidebar initialized to view annotations for first part
			const firstPid = this.domHelper.partsSelectionUI.getFirstPid();
			this.setActivePart(firstPid);

			// Everything ready/loaded now, animate scene!
			this.animateScene();

			this.hasChanges = true;  // TODO: Track whether there is actually changes or not
									 						 //       Set to true after some UI, set to false after submit
			window.addEventListener("beforeunload", (event) => {
				if (this.hasChanges) {
					event.returnValue = ''; // NOTE: Can't set custom message because bad people abused this to run scams
					return true;
				}
			}, false);
		});
	}

	reorientPartOBBs() {
		const parts = this.parts;
		const object3D = this.object3D;
		const axes = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
		const objectFront = Constants.worldFront; // TODO: check
		const raycaster = new THREE.Raycaster();
		const intersectTargets = [object3D];
		for (let part of parts) {
			if (part) {
				const obb = part.obb;
				obb.extractBasis(axes[0], axes[1], axes[2]);
				if (obb.isVerticalPlane()) {
					// align front to be facing out from object
					const frontBackDir = obb.localDirToWorldDir(new THREE.Vector3(0,0,1));
					raycaster.set(obb.position, frontBackDir);
					raycaster.near = Math.min(obb.halfSizes.x, obb.halfSizes.y)*2;
					let intersected = raycaster.intersectObjects(intersectTargets, true);
					if (intersected.length === 0) {
						// Try reverse direction
						intersected = raycaster.intersectObjects(intersectTargets, true);
						if (intersected.length) {
							obb.reverseNormal();
						}
					}
				} else {
					// align front to be object front
					let simToFront = axes[0].dot(objectFront);
					if (Math.abs(1.0 - Math.abs(simToFront)) < 0.05) {
						obb.swapBasisAxes(0,2);
						obb.extractBasis(axes[0], axes[1], axes[2]);
					}
					simToFront = axes[2].dot(objectFront);
					if (simToFront < 0) {
						obb.reverseNormal();
					}
				}
			}
		}
	}

	// Transform controls for free form selection of axis
	createTransformControls() {
		this.transformControls = new THREE.TransformControls(this.camera, this.container);
		this.transformControls.setMode('rotate');
		this.transformControls.setSpace('local');
		this.transformControls.addEventListener('change', () => {
			if (this.transformControls.object === this.state.displayAxis.node) {
				// The main axis is being updated
				this.state.displayAxis.getAxis(this.state.axis);
				if (this.state.isRotating) {
					this.state.displayRadar.getRefAxisFromMainAxis(this.state.refAxis);
					this.state.displayRadar.update();
				}
			}
			this.renderer.render(this.scene, this.camera);
		});
		this.state.scene.add(this.transformControls);
	}

	getIntersected(mouse) {
		const vector = new THREE.Vector3(mouse.x, mouse.y, 1);
		vector.unproject(this.camera);

		const ray = new THREE.Raycaster(this.camera.position, vector.sub(this.camera.position).normalize());
		const intersects = ray.intersectObjects(this.object3D.children, false);
		if (intersects.length > 0) {
			return intersects[0];
		}
	}

	getIntersectedPart(mouse) {
		const intersected = this.getIntersected(mouse);
		if (intersected) {
			const anc = Object3DUtil.findFirstAncestor(intersected.object,
				(n) => n.userData.pid != null, true);
			return anc? this.parts[anc.ancestor.userData.pid] : null;
		}
		return null;
	}

	getImageData(maxWidth, maxHeight) {
		this.renderer.render(this.scene, this.camera);
		const dataUrl = CanvasUtil.getTrimmedCanvasDataUrl(this.renderer.domElement, maxWidth, maxHeight);
		return dataUrl;
	};

	saveImage(maxWidth, maxHeight) {
		// NOTE: This may crash if dataUrl is too long...
		const dataUrl = this.getImageData(maxWidth, maxHeight);
		const blob = CanvasUtil.dataUrlToBlob(dataUrl);
		this.__savedImageCount = this.__savedImageCount || 0;
		FileUtil.saveBlob(blob, this.modelId + '_image_' + this.__savedImageCount + '.png');
		this.__savedImageCount++;
	};

	bindPartSelectionEvents() {
		// Highlight part in scene when hovering over part-tag in sidebar
		this.domHelper.partsSelectionUI.bindEvents(this);
		this.domHelper.partsSelectionUI.Subscribe('hover', this, (pid, targetPart, isHovered) => {
			if (isHovered) {
				if (!this.active) {
					targetPart.state.hovered = true;
					this.colorPartByState(targetPart);
				}
			} else {
				targetPart.state.hovered = false;
				this.colorPartByState(targetPart);
			}
		});

		this.domHelper.partsSelectionUI.Subscribe('select', this, (pid, targetPart) => {
			if (!this.active) {
				this.setActivePart(pid);
			} else {
				this.alert('Cannot select new part while current part is being annotated.', 'alert-warning');
			}
		});

		// Update mouse for ray intersecting
		$(this.container).mousemove((event) => {
			const rect = this.container.getBoundingClientRect();
			if (!this.mouse) {
				this.mouse = {};
			}
			this.mouse.x = ((event.clientX - rect.left)/rect.width) * 2 - 1;
			this.mouse.y = -((event.clientY - rect.top)/rect.height) * 2 + 1;
		});

		$(this.container).mouseleave((event) => {
			this.mouse = null;
		});

		// Enable selecting part when clicking on mesh
		$(this.container).click((event) => {
			if (!this.active && this.mouse) {
				const intersected = this.getIntersectedPart(this.mouse);
			  	if (intersected) {
				  	this.setActivePart(intersected.pid);
			  	}
			}
		});
	}

	bindWindowKeydownEvents() {
		$(window).keydown((event) => {
			if (!this.preventKeyShortcuts) {
				if (this.state.activePart && !this.domHelper.editArticulationUI.activeWidget) {
					if (event.key === 's') {
						this.state.suggestAxis(this.state.activePart, this.state.articulationType);
					}

					if (event.key === 'f') {
						this.domHelper.partsSelectionUI.setPartGroup(this.state.activePart, 'fixed');
					}

					if (event.key === 'm') {
						this.domHelper.partsSelectionUI.setPartGroup(this.state.activePart, 'moveable');
					}

					if (event.key === 'a') {
						this.addArticulation(this.state.activePart);
					}

					if (this.allowAddGeometry) {
						if (event.key === 'g') {
							if (this.isAddPartGeometryAllowed(this.state.activePart)) {
								if (this.playing) {
									this.alert('Stopping animation to generate geometry', 'alert-warning');
									this.pauseArticulationAnimation();
								}
								if (event.ctrlKey) {
									this.showPartGeometryUI(this.state.activePart);
								} else {
									this.ensurePartGeometry(this.state.activePart);
								}
							}
						}
					}

					if (event.key === 'p') {
						const annotations = this.getAnnotations(this.state.activePart.pid);
						if (annotations) {
							if (this.playing) {
								this.pauseArticulationAnimation();
							} else if (annotations.length) {
								this.playArticulationAnimation(this.state.activePart, annotations[0], 0);
							}
						}
					}

					if (event.key === 'e') {
						const annotations = this.getAnnotations(this.state.activePart.pid);
						if (annotations && annotations.length) {
							if (!this.active) {
								this.editArticulation(this.state.activePart, annotations[0], 0);
							}
						}
					}

					if (event.key === 't') {
						this.editArticulationType(this.state.activePart, ArticulationTypes.TRANSLATION);
					}

					if (event.key === 'r') {
						this.editArticulationType(this.state.activePart, ArticulationTypes.ROTATION);
					}

					if (event.key === 'c') {
						this.state.toggleFixedPartsVisibility();
					}
				}

				// shortcut keys that work any time
				if (event.key === 'o') {
					this.useTextured = !this.useTextured;
				}

				if (event.key === 'b') {
					this.allowAnyBasePart = !this.allowAnyBasePart;
				}

				if (event.key === 'i' && event.ctrlKey) {
					this.saveImage();
				}

				if (event.key === 'd') {
					this.domHelper.showPartHierarchy(this.object3D);
					this.domHelper.showCurrentConnectivityViz(this.state.currentConnectivityGraph);
				}
			}
		});
	}

	updateSidebar(pid) {
		const part = this.parts[pid];
		const annotations = this.getAnnotations(pid);

		this.__selectedPid = pid;
		this.domHelper.displaySidebar(pid, this.parts, annotations, this.playing);

		if (annotations) {
			annotations.forEach((annotation, ind) => {
				const playArticulationUI = this.domHelper.playArticulationUIs[ind];
				playArticulationUI.Subscribe('play', this, (art, artInd) => {
					this.playArticulationAnimation(part, annotation, ind);
				});

				playArticulationUI.Subscribe('pause', this, (art, artInd) => {
					this.pauseArticulationAnimation(ind);
				});

				playArticulationUI.Subscribe('edit', this, (art, artInd) => {
					this.editArticulation(part, annotation, ind);
				});

				playArticulationUI.Subscribe('delete', this, (art, artInd) => {
					this.state.deleteAnnotation(part, ind);

					if (!annotations || !annotations.length) {
						this.domHelper.partsSelectionUI.unsetPartTagAnnotated(pid);
					}

					this.updateSidebar(part.pid);
				});
			});
		}

		this.domHelper.sidebar.addArticulationButton.click(() => {
			this.addArticulation(this.parts[pid]);
		});

	}

	displayMain() {
		this.domHelper.displayMain();

		this.domHelper.getSubmitTextArea().focus(() => this.preventKeyShortcuts = true);
		this.domHelper.getSubmitTextArea().focusout(() => this.preventKeyShortcuts = false);

 		this.domHelper.getSubmitButton().click(() => { this.submitAnnotations() });
	}

	animateScene() {
		this.articulationAnimator = new ArticulationAnimator({
			state: this.state,
			isPlaying: true,
			playWidget: this.domHelper.editArticulationUI.animateArticulationWidget
		});
		const animate = () => {
			requestAnimationFrame(animate);

			this.articulationAnimator.animate();

			this.controls.enableKeys = false;
			this.controls.update();
			if (!this.active) {
				// Reset highlighting
				this.updatePartColors(this.parts);

				// Highlight intersected part
				if (this.mouse) {
					const intersected = this.getIntersectedPart(this.mouse);
					if (intersected) {
						if (intersected.state.selected) {
							this.colorPart(intersected, ArticulationsConstants.ACTIVE_PART_COLOR, ArticulationsConstants.ACTIVE_PART_OPACITY);
						} else {
							this.colorPart(intersected, ArticulationsConstants.ONHOVER_PART_COLOR, ArticulationsConstants.PART_OPACITY);
						}
					}
				}
			}

			this.renderer.render(this.scene, this.camera);
		};

		animate();
	}

	alert(message, style) {
		UIUtil.showOverlayAlert(this.container,message, style);
	}

	submitAnnotations() {
		this.loadSave.submitAnnotations(this.state);
	}

	checkClearAnnotations() {
		const nAnns = this.state.getTotalAnnotationsCount();
		bootbox.confirm("This will clear all " + nAnns + " annotation.  Are you sure you want to continue?", (res) => {
			if (res) {
				this.state.deleteAllAnnotations();
				this.domHelper.partsSelectionUI.clearAllPartTagAnnotated();
				if (this.__selectedPid) {
					this.updateSidebar(this.__selectedPid);
				}
			}
		});
	}

	importAnnotations() {
		if (!this.active) {
			if (this.playing) {
				this.pauseArticulationAnimation();
			}
			this.loadSave.importAnnotations((err, res) => {
				this.state.resetState();
				this.loadSave.updateState(this.state);
				this.domHelper.partsSelectionUI.updatePartTags(this.state.annotations);
				const firstPid = this.domHelper.partsSelectionUI.getFirstPid();
				this.setActivePart(firstPid);
				// Update part geometry
				if (this.allowAddGeometry) {
					this.__restorePartsGeometry(this.parts, () => {});
				}
			});
		} else {
			this.alert('Cannot import annotations when part is being annotated', 'alert-warning');
		}
	}

	exportAnnotations() {
		this.loadSave.exportAnnotations(this.state);
	}

	getArticulatedObject3DOrScene(useTextured) {
		const saved = { useTextured: this.useTextured, useDoubleSided: this.useDoubleSided };
		// make sure we save the textured/double-sided version
		this.useTextured = useTextured;
		this.useDoubleSided = true;
		const articulated = this.state.getArticulatedScene();
		// restore settings
		this.useTextured = saved.useTextured;
		this.useDoubleSided = saved.useDoubleSided;
		// populated user data and return
		ArticulatedObject.populateArticulationUserData(articulated);
		return articulated;
	}

	exportMesh() {
		this.__exportObject3DForm = this.__exportObject3DForm || new ExportArticulatedObject3DForm({
			export: (initialTarget, exporter, exportOpts) => {
				const useTextured = this.__exportObject3DForm.__config.useTextured;
				const target = this.getArticulatedObject3DOrScene(useTextured);
				if (exportOpts.name == null) {
					exportOpts.name = this.modelId;
				}
				exporter.export(target, exportOpts);
		  },
			warn: (msg) => { this.alert(msg, 'alert-warning'); }
		});
		this.__exportObject3DForm.show(null);
	}
}

// Exports
module.exports = ArticulationAnnotator;
