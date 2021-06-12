'use strict';

const Constants = require('Constants');
const DomHelper = require('./DomHelper');
const ArticulationsConstants = require('./ArticulationsConstants');
const ArticulationAnnotatorState = require('./ArticulationAnnotatorState');
const ArticulationAnimator = require('./ArticulationAnimator');
const Object3DUtil = require('geo/Object3DUtil');
const SceneHelper = require('./SceneHelper');
const Timings = require('util/Timings');
const UIUtil = require('ui/UIUtil');

const ArticulationTypes = ArticulationAnnotatorState.ArticulationTypes;

class ArticulationAnnotator {
	constructor(params) {
		this.container = params.container;
		this.appId = "ArtAnn.v3-20200511";
		this.url = new URL(window.location.href);
		this.modelId = this.url.searchParams.get('modelId');
		this.timings = new Timings();
		this.mouse = {};
		this.active = false;
		this.playing = false;

		this.domHelper = new DomHelper({
			container: this.container,
			articulationTypes: ArticulationAnnotatorState.ArticulationTypes
		});

		this.loadScene();
	}

	/**
	 * Called when part is selected to be annotated.
	 *
	 * Re-initializes states of variables so part can be annotated. Re-generates
	 * part hierarchy with the input part as the root. Colors connected parts and
	 * displays axis.
	 *
	 * @param part {parts.Part}
	 * @param articulationType {string}
	 * @param suggest {boolean}
	 */
	label(part, articulationType, suggest=true) {
		this.active = true;
		this.pauseArticulationAnimation();
		this.state.initAnnotation(part, articulationType, suggest);
		this.domHelper.setPartTagSelected(part.pid, true);

		const candidateBaseParts = this.state.getCandidateBaseParts(part);
		this.colorConnectedParts(part, candidateBaseParts);
		this.displayEditArticulationDialog(part, candidateBaseParts, articulationType);

		if (articulationType === ArticulationTypes.TRANSLATION) {
			this.setTranslationDisplay(part, candidateBaseParts)
		} else if (articulationType === ArticulationTypes.ROTATION) {
			this.setRotationDisplay(part, candidateBaseParts, "central");
		} else if (articulationType === ArticulationTypes.HINGE_ROTATION) {
			this.setRotationDisplay(part, candidateBaseParts, "hinge");
		}
	}

	/**
	 * Redisplays annotation wizard with data supplied by annotation.
	 *
	 * @param part {parts.Part}
	 * @param annotation {Object}
	 * @param ind {number}
	 */
	edit(part, annotation, ind) {
		this.pauseArticulationAnimation();
		this.active = true;
		this.state.setActive(part, annotation, ind, false);
		this.domHelper.setPartTagSelected(part.pid, true);

		const children = this.state.getConnectedParts();
		this.colorConnectedParts(part, children);

		// Shows annotation wizard on left side of screen
		this.displayEditArticulationDialog(part, children, annotation.type);

		if (annotation.type === ArticulationTypes.TRANSLATION) {
			this.setTranslationDisplay(part, children, false);
			this.displayTranslationAxisOptions();
		} else {
			this.setRotationDisplay(part, children, annotation.type === ArticulationTypes.ROTATION ? 'central' : 'hinge', false);
			this.displayRotationAxisOptions(annotation.type === ArticulationTypes.ROTATION ? 'central' : 'hinge', false);
		}
	}

	/**
	 * Animates previously submitted annotation.
	 *
	 * @param part {parts.Part}
	 * @param annotation {Object}
	 */
	playArticulationAnimation(part, annotation, ind) {
		this.pauseArticulationAnimation();
		this.playing = true;
		annotation.needsReview = false;
		this.domHelper.showPauseButton(ind);
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
		this.state.resetState();
	}

	/**
	 * Get annotations associated with this part
	 */
	getAnnotations(pid) {
		return this.state.annotations[pid] || [];
	}


	/**
	 * Colors connected parts when annotating/animating part (and highlights said part).
	 *
	 * @param part {parts.Part}
	 * @param children {Array<parts.Part>}
	 */
	colorConnectedParts(part, children) {
		this.state.colorPart(part, ArticulationsConstants.ACTIVE_PART_COLOR, ArticulationsConstants.ACTIVE_PART_OPACITY);
		children.forEach(child => {
			this.state.colorPart(child, ArticulationsConstants.CONNECTED_COLOR, ArticulationsConstants.PART_OPACITY);
			child.connected = true;
		});
	}

	/**
	 * Displays annotation wizard for part (base options displayed after user chooses
	 * annotation type).
	 *
	 * @param part {parts.Part}
	 * @param children {Array<parts.Part>}
	 */
	displayEditArticulationDialog(part, children, type) {
		this.domHelper.displayAnnotationWizard(part, children, type);

		this.domHelper.getHingeRotationOption().change((event) => {
			if (event.target.value === "on") {
				this.label(part, ArticulationTypes.HINGE_ROTATION);
			}
		});

		this.domHelper.getCentralRotationOption().change((event) => {
			if (event.target.value === "on") {
				this.label(part, ArticulationTypes.ROTATION);
			}
		});

		this.domHelper.getTranslationOption().change((event) => {
			this.label(part, ArticulationTypes.TRANSLATION, true);
		});

		this.domHelper.getSaveAnnotationButton().click(() => {
			this.saveAnnotation(part, children)
		});

		this.domHelper.getCancelAnnotationButton().click(() => {
			this.cancelAnnotation(part, children)
		});

	  $(window).off('keyup');
		$(window).keyup((event) => {
			if (!this.preventKeyShortcuts) {
				if (event.key === 'Escape') {
					if (this.state.activeWidget) {
						this.state.activeWidget.cancel();
					} else {
						this.cancelAnnotation(part, children);
					}
				}

				if (event.key === 'Enter') {
					if (this.state.activeWidget) {
						this.state.activeWidget.save();
					} else {
						this.saveAnnotation(part, children);
					}
				}
			}
		});
	}

	setRotationDisplay(part, children, type, resetbase=true) {
		this.state.setRotationState(part, children, type, resetbase);
		this.displayBaseOptions(part, children);
		this.domHelper.displayRotationBaseOptions(type);

		this.state.displayRadar.update();
		this.state.displayAxis.update();
	}

	setTranslationDisplay(part, children, resetbase=true) {
		this.state.setTranslationState(part, children, resetbase);
		this.displayBaseOptions(part, children);
		this.domHelper.displayTranslationBaseOptions();

		this.state.displayRadar.clear();
		this.state.displayAxis.update();
	}

	/**
	 * Displays list of checkboxes for each possible base part after user selects annotation
	 * type (i.e. rotation/translation).
	 *
	 * @param part {parts.Part}
	 * @param children {Array<parts.Part>}
	 */
	displayBaseOptions(part, children) {
		this.domHelper.displayBaseOptions(children, this.state.baseParts.map(part => part.pid));

		this.domHelper.getTranslationBaseOptions().change((event) => {
			const selectedPart = this.parts[event.target.id];
			if (event.target.checked) {
				this.state.setTranslationBasePart(part, selectedPart);
				this.displayTranslationAxisOptions();
			} else {
				this.state.removeBasePart(part, selectedPart);

				if ($('.translation .child:checked').length == 0) {
					$(".translation-axis.antn-dialog-base-selector").addClass("hidden");
			    }
			}
		});

		this.domHelper.getRotationBaseOptions().change((event) => {
			const selectedPart = this.parts[event.target.id];
			if (event.target.checked) {
				this.state.setRotationBasePart(part, selectedPart);
				this.displayRotationAxisOptions(event.target.name);
			} else {
				this.state.removeBasePart(part, selectedPart);
			}
			if ($('.rotation .child:checked').length === 0) {
				$('.rotation-axis.antn-dialog-base-selector').addClass('hidden');
			}
		});

		this.domHelper.getBaseOptions().mouseenter((event) => {
			const p = this.parts[event.target.id];
			this.state.colorPart(p, ArticulationsConstants.BASE_PART_COLOR, ArticulationsConstants.PART_OPACITY);

			$(event.target).mouseleave((ev) => {
				const selectedPart = this.parts[ev.target.id];
				if (!selectedPart.isBasePart) {
					this.state.colorPart(selectedPart, ArticulationsConstants.CONNECTED_COLOR, ArticulationsConstants.PART_OPACITY);
				}
			});
		});
	}

	/**
	 * Displays menu for choosing translation axis + double slider for specifying range.
	 */
	displayTranslationAxisOptions() {
		this.state.setTranslationAxisOptions();
		this.state.displayAxis.update(true, this.state.getAxisLength());
		const widgets = this.domHelper.displayTranslationAxisOptions(this.state.fullAxisOptions, this.state.axisIndex,
			this.state.translation.rangeMin, this.state.translation.rangeMax);

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
			this.state.updateTranslationRange();
		};

		widgets.rangeWidget.change(onTranslationAxisSliderChange, onTranslationAxisSliderComplete);
	}

	/**
	 * Displays menu for choosing rotation axis + double slider for specifying range.
	 */
	displayRotationAxisOptions(type, reset=true) {
		if (reset) {
			this.state.resetRotationAxisOptions();
		}
		this.state.displayRadar.update();
		// Setting the default edge (this seems to fix some issues
		// with the guides being out of sync)
		this.state.setEdge(this.state.edge);

		const pivotOptions = this.state.getRotationPivotOptions(type);
		const widgets = this.domHelper.displayRotationAxisOptions(type,
			this.state.fullAxisOptions, this.state.axisIndex, this.state.refAxisIndex,
			pivotOptions, this.state.rotation.rangeMin, this.state.rotation.rangeMax, this.state.edge);

		widgets.axisSelectionWidget.configure(this, this.state, this.state.rotation);
		widgets.axisSelectionWidget.change(axisIndex => {
			this.state.updateRotationAxis(axisIndex);
			widgets.refAxisSelectionWidget.setAxisOptions(this.state.fullAxisOptions, this.state.refAxisIndex, false, (opt, index) => {
				return index !== this.state.axisIndex;
			});
		});
		widgets.refAxisSelectionWidget.configure(this, this.state, this.state.rotation);
		widgets.refAxisSelectionWidget.change(axisIndex => {
			this.state.updateReferenceAxis(axisIndex);
		});

		this.domHelper.onEdgeSelect(val => this.state.setEdge(val));
		this.domHelper.onLeftRightAxisChange(val => this.state.rotationPivotLeftRight = val);
		this.domHelper.onUpDownAxisChange(val => this.state.rotationPivotUpDown = val);
		this.domHelper.onForwardBackAxisChange(val => this.state.rotationPivotFrontBack = val);

		const onRotationAxisSliderChange = (rangeMin, rangeMax) => {
			this.state.resetPartRotation();

			this.state.rotation.rangeMin = -((100 - rangeMin)/100) * Math.PI;
			this.state.rotation.rangeMax = ((rangeMax - 100)/100) * Math.PI;

			this.state.displayAxis.update();
			this.state.displayRadar.update();
		};

		widgets.rangeWidget.change(onRotationAxisSliderChange);
	}

	saveAnnotation(part, children) {
		if (this.state.baseParts.length) {
			const annotation = this.state.storeAnnotations(part);

			if (this.domHelper.autoSuggestOn()) {
				const siblings = this.state.storeSuggestions(annotation, part);

				siblings.forEach(sibpart => {
					sibpart.prevColor = ArticulationsConstants.AUTO_ANNOTATED_PART_COLOR;
					this.state.colorPart(sibpart, ArticulationsConstants.AUTO_ANNOTATED_PART_COLOR, ArticulationsConstants.PART_OPACITY);
				});

				this.domHelper.updatePartTags(part.pid, siblings.map(sibpart => sibpart.pid));
			} else {
				this.domHelper.updatePartTags(part.pid);
			}

			part.labeled = true;
			part.prevColor = ArticulationsConstants.ANNOTATED_PART_COLOR;

			children.forEach((child) => {
				this.state.colorPartRestore(child);
				child.connected = false;
			});

			this.state.resetState();

			this.active = false;

			this.domHelper.hideAnnotationWizard();

			this.updateSidebar(part.pid);
			$(window).off('keyup');
		} else {
			alert('Annotation incomplete.');
		}
	}

	cancelAnnotation(part, children) {
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
		this.domHelper.setPartTagSelected(pid);

		if (this.parts[pid].prevColor === ArticulationsConstants.AUTO_ANNOTATED_PART_COLOR) {
			this.parts[pid].prevColor = ArticulationsConstants.ANNOTATED_PART_COLOR;
		}

		if (this.playing) {
			this.cancelAnnotation(this.state.activePart, this.state.getConnectedParts());
			this.state.setActive(this.parts[pid]);

			if (this.state.annotations[pid] && this.state.annotations[pid].length) {
				this.playArticulationAnimation(this.parts[pid], this.state.annotations[pid][0]);
			}
		} else {
			this.state.setActive(this.parts[pid])
		}

		// Reset part colors
		this.parts.forEach(part => {
			if (part) {
				this.state.colorPartRestore(part);
				part.selected = false;
				part.connected = false;
			}
		});

		// Highlight selected part
		this.state.colorPart(this.parts[pid], ArticulationsConstants.ACTIVE_PART_COLOR, ArticulationsConstants.ACTIVE_PART_OPACITY);
		this.parts[pid].selected = true;

		this.updateSidebar(pid);
	}

	loadScene() {
		// Setup general HTML
		this.displayMain();

		let helper = new SceneHelper({
			container: this.container,
			domHelper: this.domHelper,
			modelId: this.modelId,
			timings: this.timings
		});
		helper.initScene(
			(state, controls, camera, renderer) => {
			this.domHelper.clearLoadingDialog();

			this.parts = state.parts;
			this.scene = state.scene;
			this.camera = camera;
			this.controls = controls;
			this.object3D = state.object3D;
			this.renderer = renderer;
			this.state = state;
			this.timingHistory = helper.timingHistory;

			// Add transform controls
  		this.createTransformControls();
			// Enable highlighting and setting parts active
			this.bindPartSelectionEvents();
			this.bindWindowKeydownEvents();

			// Renders sidebar initialized to view annotations for first part
			this.setActivePart(1);

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
			} else if (this.transformControls.object === this.state.displayRadar.refLine) {
				// refline is being updated
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

	bindPartSelectionEvents() {
		// Highlight part in scene when hovering over part-tag in sidebar
		this.domHelper.getPartTags().mouseenter((event) => {
			if (!this.active) {
				const ind = event.target.id;
				const targetPart = this.parts[ind];
				targetPart.hovered = true;
				this.state.colorPart(targetPart, ArticulationsConstants.ONHOVER_PART_COLOR, ArticulationsConstants.PART_OPACITY);

				$(`#${ind}`).mouseleave((event) => {
					targetPart.hovered = false;
					this.parts.forEach(part => {
						if (part) {
							if (!part.selected && !part.connected) {
								this.state.colorPartRestore(part);
							} else if (part.selected) {
								this.state.colorPart(part, ArticulationsConstants.ACTIVE_PART_COLOR, ArticulationsConstants.ACTIVE_PART_OPACITY);
							}
						}
					});
				});
			}
		});

		this.domHelper.getPartTags().click((event) => {
			if (!this.active) {
				this.setActivePart(event.target.id);
			} else {
				alert("Cannot select new part while current part is being annotated.");
			}
		});

		// Update mouse for ray intersecting
		$(document).mousemove((event) => {
			const rect = this.container.getBoundingClientRect();
			this.mouse.x = ((event.clientX - rect.left)/this.container.clientWidth) * 2 - 1;
			this.mouse.y = -((event.clientY - rect.top)/this.container.clientHeight) * 2 + 1;
		});

		// Enable selecting part when clicking on mesh
		$(document).click((event) => {
			if (!this.active) {
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
				if (this.state.activePart) {
					if (event.key === 'a') {
						this.label(this.state.activePart);
					}

					if (event.key === 'p') {
						const annotation = this.state.annotations[this.state.activePart.pid];
						if (annotation) {
							if (this.playing) {
								this.pauseArticulationAnimation();
							} else {
								this.playArticulationAnimation(this.state.activePart, annotation[0], 0);
							}
						}
					}

					if (event.key === 'e') {
						const annotation = this.state.annotations[this.state.activePart.pid];
						if (annotation) {
							if (!this.active) {
								this.edit(this.state.activePart, annotation[0], 0);
							}
						}
					}

					if (event.key === 't') {
						const basePartCandidates = this.state.getCandidateBaseParts();
						this.displayEditArticulationDialog(this.state.activePart, basePartCandidates, ArticulationTypes.TRANSLATION);
						this.setTranslationDisplay(this.state.activePart, basePartCandidates);
					}

					if (event.key === 'r') {
						const basePartCandidates = this.state.getCandidateBaseParts();
						this.displayEditArticulationDialog(this.state.activePart, basePartCandidates, ArticulationTypes.ROTATION);
						this.setRotationDisplay(this.state.activePart, basePartCandidates, 'central');
					}

					if (event.key === 'h') {
						const basePartCandidates = this.state.getCandidateBaseParts();
						this.displayEditArticulationDialog(this.state.activePart, basePartCandidates, ArticulationTypes.HINGE_ROTATION);
						this.setRotationDisplay(this.state.activePart, basePartCandidates, 'hinge');
					}

					if (event.key === 'c') {
						this.state.toggleFixedPartsVisibility();
					}
				}
			}
		});
	}

	updateSidebar(pid) {
		const part = this.parts[pid];
		const annotations = this.state.annotations[pid];

		this.__selectedPid = pid;
		this.domHelper.displaySidebar(pid, this.parts, annotations, this.playing);

		if (annotations) {
			annotations.forEach((annotation, ind) => {
				this.domHelper.getPlayButton(ind).click(() => {
					this.playArticulationAnimation(part, annotation, ind);
				});

				this.domHelper.getPauseButton(ind).click(() => {
					this.pauseArticulationAnimation(ind);
				});

				this.domHelper.getEditButton(ind).click(() => {
					this.edit(part, annotation, ind);
				});

				this.domHelper.getDeleteButton(ind).click(() => {
					this.state.deleteAnnotation(part, ind);

					if (!annotations || !annotations.length) {
						this.domHelper.unsetAnnotation(pid);
						part.prevColor = part.originalColor;
					}

					this.updateSidebar(part.pid);
				});
			});
		}

		this.domHelper.getAddArticulationButton().click(() => {
			this.label(this.parts[pid]);
		});

	}

	displayMain() {
		this.domHelper.displayMain();

		this.domHelper.getSubmitTextArea().focus(() => this.preventKeyShortcuts = true);
		this.domHelper.getSubmitTextArea().focusout(() => this.preventKeyShortcuts = false);

 		this.domHelper.getSubmitButton().click(() => {
			this.authenticate(() => {
				this.submitAnnotations(this.domHelper.getNotes());
			});
		});
	}

	animateScene() {
		this.articulationAnimator = new ArticulationAnimator({
			state: this.state
		});
		const animate = () => {
			requestAnimationFrame(animate);

			this.articulationAnimator.animate();

			this.controls.enableKeys = false;
			this.controls.update();
			if (!this.active) {
				// Reset highlighting
				this.parts.forEach(part => {
					if (part) {
						if (part.connected) {
							this.state.colorPart(part, ArticulationsConstants.CONNECTED_COLOR, ArticulationsConstants.PART_OPACITY);
						} else if (!part.selected && !part.hovered) {
							this.state.colorPartRestore(part);
						}
					}
				});

				// Highlight intersected part
				const intersected = this.getIntersectedPart(this.mouse);
				if (intersected) {
					if (intersected.selected) {
						this.state.colorPart(intersected, ArticulationsConstants.ACTIVE_PART_COLOR, ArticulationsConstants.ACTIVE_PART_OPACITY);
					} else {
						this.state.colorPart(intersected, ArticulationsConstants.ONHOVER_PART_COLOR, ArticulationsConstants.PART_OPACITY);
					}
				}
			}

			this.renderer.render(this.scene, this.camera);
		};

		animate();
	}

	submitAnnotations(notes) {
		const annotations = this.state.annotations;
		// TODO: Account for alignment
		let articulations = [];
		for (let i = 0; i < annotations.length; i++) {
			if (annotations[i] && annotations[i].length) {
				let isReady = true;
				annotations[i].forEach((ann) => isReady &= !ann.needsReview);

				if (!isReady) {
					alert("Please review all annotations before submitting.");
					return;
				}

				articulations.push.apply(articulations, annotations[i]);
			}
		}
		this.timings.mark('annotationSubmit');

		const data = {
			appId: this.appId,
			workerId: this.userId,
			modelId: this.modelId,
			annotation: {
				partsAnnId: this.state.partsAnnId,
				articulations: articulations,
				notes: notes,
				timings: this.timings.toJson(),
				timingHistory: this.timingHistory
			}
		};
		$.ajax({
			url: `${Constants.baseUrl}/articulation-annotations/submit-annotations`,
			method: 'POST',
			contentType: 'application/json;charset=utf-8',
			data: JSON.stringify(data),
			success: ((msg) => {
				console.log("Annotations saved.");
				UIUtil.showOverlayAlert(this.container, "Annotations saved", 'alert-success');
			}),
			error: ((err) => {
				console.error("There was an error saving annotations.", err);
				UIUtil.showOverlayAlert(this.container, "Error saving annotations");
			})
		});
	}

	authenticate(cb) {
		// Most basic auth ever
		if (this.userId && !this.userId.startsWith('USER@')) {
			cb({ username: this.userId });
			return;
		}
		if (!this.auth) {
			const Auth = require('util/Auth');
			this.auth = new Auth();
		}
		this.auth.authenticate(function(user) {
			this.userId = user.username;
			cb(user);
		}.bind(this));
	}
}

// Exports
module.exports = ArticulationAnnotator;
