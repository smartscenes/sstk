'use strict';

const ArticulationsConstants = require('./ArticulationsConstants');
const Articulation = require('articulations/Articulation');
const Distances = require('geo/Distances');
const OBBFitter = require('geo/OBBFitter');
const Object3DUtil = require('geo/Object3DUtil');
const DisplayAxis = require('articulations/DisplayAxis');
const DisplayRadar = require('articulations/DisplayRadar');

const TRANSLATION_RANGE = 0.1;

const ArticulationTypes = Articulation.Type;

const Dirs = Object.freeze({
	LeftRight: { index: 0, name: "left", label: "Left/Right" },
	UpDown: { index: 1, name: "up", label: "Up/Down" },
	FrontBack: { index: 2, name: "front", label: "Front/Back" }
});
const OrderedDirs = [Dirs.LeftRight, Dirs.UpDown, Dirs.FrontBack];

function isRotationType(t) {
	return (t === ArticulationTypes.HINGE_ROTATION || t === ArticulationTypes.ROTATION);
}

function isTranslationType(t) {
	return (t === ArticulationTypes.TRANSLATION);
}

function toVector3(ann, res = null) {
	if (ann) {
		res = res || new THREE.Vector3();
		if (Array.isArray(ann)) {
			res.set(ann[0], ann[1], ann[2]);
		} else {
			res.set(ann.x, ann.y, ann.z);
		}
		return res;
	}
}

class Option {
	constructor(name, label, value, type, provenance) {
		this.name = name;
		this.label = label;
		this.value = value;
		this.type = type;
		this.provenance = provenance;
	}
}

class ArticulationAnnotatorState {
	constructor(params) {
		this.axis = new THREE.Vector3(1,0,0);
		this.origin = new THREE.Vector3(0,0,0);
		this.refAxis = new THREE.Vector3(0,0,1);
		// Translation and rotation parameters
		this.translation = new Articulation({
			type: ArticulationTypes.TRANSLATION,
			rangeMin: -TRANSLATION_RANGE,
			rangeMax: TRANSLATION_RANGE,
			axis: this.axis,
			origin: this.origin,
			value: 0
		}, true);
		this.rotation = new Articulation({
			type: ArticulationTypes.ROTATION,
			rangeMin: -Math.PI,
			rangeMax: Math.PI,
			axis: this.axis,
			origin: this.origin,
			ref: this.refAxis,
			value: 0
		}, true);
		this.displayAxis = new DisplayAxis({ articulation: this.translation, arrowHeadSize: 0.05, showNegAxis: true, defaultLength: 0.5 });
		this.displayRadar = new DisplayRadar({ articulation: this.rotation, arrowHeadSize: 0.05 });

		// TODO: remove scene from this?
		this.scene = params.scene;
		this.groupNode = new THREE.Group();
		this.scene.add(this.groupNode);
		// Debug node
		this.debugNode = new THREE.Group();
		this.groupNode.add(this.debugNode);
		// Visualization node
		this.vizNode = new THREE.Group();
		this.groupNode.add(this.vizNode);
		this.displayAxis.attach(this.vizNode);
		this.displayRadar.attach(this.vizNode);
		if (params.object3D) {
			this.groupNode.applyMatrix4(params.object3D.matrix);
		}

		// Active widget (expected to have save and cancel)
		this.activeWidget = null;

		// Articulation UI state
		this.annInd = null;
		this.baseParts = [];
		this.baseObb = null;  // OBB for base

		// Rotation pivot information
		this.rotationPivots = OrderedDirs.map((dir,i) => {
			return {
				offset: new THREE.Vector3(0,0,0),
				value: 0
			}
		})

		this.left = new THREE.Vector3(0,0,0);
		this.right = new THREE.Vector3(0,0,0);
		this.edgeOption = 0;
		this.edge = 1;
		this.articulationType = null;

		// Suggestions that are generated or saved
		this.fullAxisOptions = null; // Option[]
		this.pivotAxisOptions = null;    // THREE.Vector3[]
		this.edgeOptions = null;         // THREE.Vector3[]
		this.originOptions = null;       // THREE.Vector3[]
		this.originIndex = 0;
		this.customAxisOptions = [];

		this.partsAnnId = params.partsAnnId;
		this.parts = params.parts;
		this.annotations = params.annotations;
		this.connectivityGraph = params.connectivityGraph;
		this.object3D = params.object3D;

		this.__showFixedParts = true;
		this.__axisIndex = 0;
		this.refAxisIndex = 1;
	}

	get axisIndex() {
		return this.__axisIndex;
	}

	set axisIndex(v) {
		this.__axisIndex = v;
		if (this.__axisIndex === this.refAxisIndex) {
			this.updateReferenceAxis( (this.axisIndex + 1) % 3);
		}
	}

	get isRotating() {
		return (this.activePart && this.baseParts.length && isRotationType(this.articulationType));
	}

	get isTranslating() {
		return (this.activePart && this.baseParts.length && isTranslationType(this.articulationType));
	}

	get partObb() {
		return this.activePart.obb;
	}

	get pivotObb() {
		// For now have the part obb be the same as the pivot obb
		return this.activePart.obb;
	}

	resetPartHierarchy() {
		this.parts.forEach((part) => {
			if (part) {
				part.object3D.parent = this.object3D;
				part.object3D.children = [];
			}
		});
	}

	resetWidgets() {
		if (this.activeWidget) {
			this.activeWidget.cancel();
			this.activeWidget = null;
		}
	}

	resetState() {
		this.resetWidgets();
		this.resetParts(true);
		this.baseParts = [];
		this.resetPartHierarchy();

		const children = this.getConnectedParts();
		children.forEach(child => {
			this.colorPartRestore(child);
			child.connected = false;
			child.isBasePart = false;
		});

		this.annInd = null;
		this.articulationType = this.getArticulationTypeFromInterface();

		this.displayAxis.clear();
		this.displayRadar.clear();
	}

	/**
	 * Resets part positions/rotation.
	 *
	 * @param resetRange {boolean} Whether to also reset counts for when animating
	 *		translation/rotation
	 */
	resetParts(resetRange=true) {
		if (resetRange) {
			this.rotation.value = 0;
			this.rotation.rangeMin = -Math.PI;
			this.rotation.rangeMax = Math.PI;

			this.translation.value = 0;
			this.translation.rangeMin = 0;
			this.translation.rangeMax = 0;
		}

		this.parts.forEach((part) => {
			if (part) {
				part.object3D.position.set(0, 0, 0);
				part.object3D.rotation.set(0, 0, 0);
				part.connected = false;
			}
		});
	}

	/**
	* Initializes interface information about the pivot and edges for hinge
	* rotation.
	*
	* @param part {parts.Part}
	*/
	initHingeSuggestions(part) {
		const debug = false;
		if (debug) {
			Object3DUtil.removeAllChildren(this.debugNode);
		}
		if (this.baseObb != undefined) {
			function isBetter(a, b) {
				const EPS = 0.0001;
				const distSqPartD = Math.abs(a.distSqPart - b.distSqPart);
				if (distSqPartD <= EPS) {
					return a.distSqBase < b.distSqBase;
				} else {
					return a.distSqPart < b.distSqPart;
				}
			}
			this.setAxisOptions(part, true);
			// Go through origin options and select the best origin (closest to the base and the part)
			const obb = part.obb;
			let saved = null;
			let tmpPt = new THREE.Vector3();
			this.originOptions.forEach((opt) => {
				tmpPt.copy(opt);
				tmpPt.applyMatrix4(this.object3D.matrixWorld);

				const distSqResultPart = Distances.computeDistance(tmpPt, this.activePart.object3D,
					{ all: true, local: false, profile: false });
				const distSqResultBase = Distances.computeDistance(tmpPt, this.baseParts.map(b => b.object3D),
					{ all: true, local: false, profile: false });
				const curr = {
					distSqBase: distSqResultBase.distanceSq,
					distSqPart: distSqResultPart.distanceSq,
				};
				//console.log(curr);
				if (saved == null || isBetter(curr, saved)) {
					//console.log('update', curr, this.originOptions.indexOf(opt));
					this.origin.copy(opt);
					this.originIndex = this.originOptions.indexOf(opt);
					let tmpDirection = new THREE.Vector3();
					tmpDirection.subVectors(obb.position, this.origin);
					tmpDirection.projectOnVector(this.axis);
					this.edge = 1;
					// console.log('set edge to 1');
					if (Math.abs(tmpDirection.x) < Math.abs(tmpDirection.y) && Math.abs(tmpDirection.x) < Math.abs(tmpDirection.z)) {
						this.edgeOption = 0;
					} else if (Math.abs(tmpDirection.y) < Math.abs(tmpDirection.z)) {
						this.edgeOption = 1;
					} else {
						this.edgeOption = 2;
					}
					this.left.copy(this.edgeOptions[this.edgeOption]);
					this.right.copy(this.left).multiplyScalar(-1);

					let tmpDistVec = new THREE.Vector3();
					tmpDistVec.subVectors(obb.position, this.origin);
					let tmpDistanceOrigin = tmpDistVec.length();
					this.setEdge(2);
					tmpDistVec.subVectors(obb.position, this.origin);
					let tmpDistance = tmpDistVec.length();

					if (tmpDistance < tmpDistanceOrigin) {
						this.edge = 1;
					} else {
						this.setEdge(0);
						tmpDistVec.subVectors(obb.position, this.origin);
						tmpDistance = tmpDistVec.length();
						if (tmpDistance > tmpDistanceOrigin) {
							this.edge = 1;
						}
					}
					saved = curr;
				}
			});
			if (debug) {
				for (let i = 0; i < this.originOptions.length; i++) {
					const ball = Object3DUtil.makeBall(this.originOptions[i], 0.01,
						(i == this.originIndex) ? 'yellow' : 'gray');
					this.debugNode.add(ball);
				}
			}
			this.setEdge(this.edge);
		}
		// console.log('--------- EDGE STUFF -------------')
		// console.log('this.edge', this.edge);
		// console.log('this.edgeOption', this.edgeOption);
		// console.log('--------- END EDGE STUFF -------------')
	}

	findMatchingAxis(axisOptions, targetAxis) {
		let axisIndex = 0;
		const negativeAxis = targetAxis.clone().negate();
		let axisProj = targetAxis.dot(axisOptions[axisIndex].value);
		let newAxisProj = axisProj;
		let isFlipped = false;
		for (let i = 0; i < axisOptions.length; i++) {
			const axis = axisOptions[i].value;
			newAxisProj = targetAxis.dot(axis);
			if (newAxisProj > axisProj) {
				axisIndex = i;
				axisProj = newAxisProj;
				isFlipped = false;
			}
			// Also check the negation of this axis
			newAxisProj = negativeAxis.dot(axis);
			if (newAxisProj > axisProj) {
				axisIndex = i;
				axisProj = newAxisProj;
				isFlipped = true;
			}
		}
		return { axisIndex: axisIndex, isFlipped: isFlipped, matchScore: axisProj, negativeAxis: negativeAxis };
	}

	findPivotValues(pivotAxisOptions, pivot) {
		const pivotCenter = this.pivotObb.getCenter();
		return pivotAxisOptions.map(v => {
			const diff = pivot.clone().sub(pivotCenter);
			return diff.dot(v);
		});
	}

	setUIParametersFromRawAnnotation(annotation) {
		console.log("raw annotation (no UI information)");

		// Setting the axis and axisIndex
		const matchAxis = this.findMatchingAxis(this.fullAxisOptions, annotation.axis);
		if (Math.abs(matchAxis.matchScore - 1) < 0.0001) {
			// Good enough (reasonable match)
			// If the axis was flipped, then we need to flip the range of motion
			if (matchAxis.isFlipped) {
				annotation.axis = matchAxis.negativeAxis;
				let tmp = annotation.rangeMax;
				annotation.rangeMax = -annotation.rangeMin;
				annotation.rangeMin = -tmp;
			}
			this.__axisIndex = matchAxis.axisIndex;
		} else {
			// Add custom axis
			const option = this.addCustomAxisOption(annotation.axis);
			this.__axisIndex = option.index;
		}
		this.axis.copy(annotation.axis);

		// Setting the refAxis and refAxisIndex
		if (annotation.refAxis) {
			const refMatchAxis = this.findMatchingAxis(this.fullAxisOptions, annotation.refAxis);
			if (Math.abs(refMatchAxis.matchScore - 1) < 0.0001) {
				if (refMatchAxis.isFlipped) {
					annotation.refAxis = refMatchAxis.negativeAxis;
					if (annotation.defaultValue != null) {
						annotation.defaultValue = -annotation.defaultValue;
					}
				}
			} else {
				// Add custom axis
				const option = this.addCustomAxisOption(annotation.refAxis);
				this.refAxisIndex = option.index;
			}
			this.refAxis.copy(annotation.refAxis);
		} else {
			this.axisIndex = this.__axisIndex;
		}

		// Setting the origin
		this.origin.copy(annotation.origin);

		// Setting relative pivot values
		if (isRotationType(annotation.type)) {
			const relativePivotValues = this.findPivotValues(this.pivotAxisOptions, annotation.origin);
			for (let i = 0; i < OrderedDirs.length; i++) {
				this.setRotationPivotAxisValue(i, relativePivotValues[i]);
			}
		}
	}

	setUIParametersFromRawAnnotationOld(annotation) {
		console.log("raw annotation (no UI information)");
		let tmpOrigin = this.origin.clone();
		// Setting the originIndex
		this.originIndex = 0;
		let diffVec = new THREE.Vector3().subVectors(this.origin, this.originOptions[this.originIndex]);
		let difference = diffVec.length();
		let newDifference = difference;
		if (annotation.type === ArticulationTypes.HINGE_ROTATION) {
			this.originOptions.forEach(opt => {
				diffVec.subVectors(this.origin, opt);
				newDifference = diffVec.length();
				if (newDifference < difference) {
					this.originIndex = this.originOptions.indexOf(opt);
					difference = newDifference;
				}
			});
		}

		// Setting the axisIndex
		const matchAxis = this.findMatchingAxis(this.fullAxisOptions, this.axis);
		this.axisIndex = matchAxis.axisIndex;
		// If the axis was flipped, then we need to flip the range of motion
		if (matchAxis.isFlipped) {
			annotation.axis = matchAxis.negativeAxis;
			let tmp = annotation.rangeMax;
			annotation.rangeMax = -annotation.rangeMin;
			annotation.rangeMin = -tmp;
		}
		// I think we need to do this, in case the axis was flipped?
		this.axis.copy(annotation.axis);
		if (isTranslationType(annotation.type)) {
			this.translation.rangeMax = annotation.rangeMax;
			this.translation.rangeMin = annotation.rangeMin;
		} else if (isRotationType(annotation.type)) {
			this.rotation.rangeMax = annotation.rangeMax;
			this.rotation.rangeMin = annotation.rangeMin;
			this.resetRotationAxisOptions();
		}
		if (annotation.type === ArticulationTypes.HINGE_ROTATION) {
			// Initializing the edge information, setting the edgeOption, left,
			// and right
			this.initHingeSuggestions(part);

			// Setting the closest edge
			diffVec.subVectors(this.origin, tmpOrigin);
			difference = diffVec.length();
			let keep = 0;
			for (let i = 0; i < 3; i++) {
				this.setEdge(i);
				diffVec.subVectors(this.origin, tmpOrigin);
				newDifference = diffVec.length();
				if (newDifference < difference) {
					keep = i;
					difference = newDifference;
				}
			}
			this.setEdge(keep);
		}
		if (annotation.type === ArticulationTypes.ROTATION) {
			this.origin.copy(this.originOptions[this.originIndex]);
		}
		if (isRotationType(annotation.type)) {
			diffVec.subVectors(tmpOrigin, this.origin);
			for (let i = 0; i < OrderedDirs.length; i++) {
				this.setRotationPivotAxisValue(i, diffVec.dot(this.pivotAxisOptions[i]));
			}
		}
		// Recopy the origin
		this.origin.copy(tmpOrigin);
	}

	setUIParametersFromFullAnnotation(annotation) {
		console.log("not raw annotation (contains UI information)");
		this.originIndex = annotation.originIndex;
		this.edgeOption = annotation.edgeOption;
		this.edge = annotation.edge;
		this.left = toVector3(annotation.edgeLeft);
		this.right = toVector3(annotation.edgeRight);

		this.axisIndex = annotation.axisIndex;

		if (isRotationType(annotation.type)) {
			this.setRotationPivotAxisValuesFromAnnotation(annotation);
		}
	}

	setActive(part, annotation, ind, raw=false) {
		this.activePart = part;

		if (this.annotations && this.annotations[part.pid] && this.annotations[part.pid].length) {
			this.annotations[part.pid].forEach((ann) => ann.needsReview = false);
		}

		if (annotation) {
			// Set basic annotation information that is shared with raw annotation (no UI information)
			//   and when there is extra UI information
			this.articulationType = annotation.type;
			this.annInd = ind;

			this.resetPartHierarchy();
			this.setBaseParts(part, annotation.base.map(pid => this.parts[pid]));
			this.setAxisOptions(part, annotation.type === ArticulationTypes.HINGE_ROTATION);

			annotation = _.clone(annotation);
			annotation.axis = toVector3(annotation.axis);
			annotation.origin = toVector3(annotation.origin);
			annotation.ref = toVector3(annotation.ref);

			//if (raw) {
			this.setUIParametersFromRawAnnotation(annotation);
			//} else {
			//	this.setUIParametersFromFullAnnotation(annotation);
			//}

			this.displayAxis.update();
			if (isTranslationType(annotation.type)) {
				this.translation.rangeMax = annotation.rangeMax;
				this.translation.rangeMin = annotation.rangeMin;
				this.displayAxis.displayAxisPoints();
			} else if (isRotationType(annotation.type)) {
				this.rotation.rangeMax = annotation.rangeMax;
				this.rotation.rangeMin = annotation.rangeMin;
				this.displayRadar.update();
			}
		}
	}

	setRotationState(part, children, type, resetbase=true) {
		if (resetbase) {
			this.baseParts = [];
		}

		this.resetParts(false);
	}

	setTranslationState(part, children, resetbase=true) {
		if (resetbase) {
			this.baseParts = [];
		}

		this.resetParts(false);
	}

	setEdge(val) {
		this.resetPartRotation();
		if (this.edge != val) {
			if (val == 0) {
				if (this.edge != 1) {
					this.origin.sub(this.right);
				}
			  this.origin.add(this.left);
			} else if (val == 2) {
				if (this.edge != 1) {
					this.origin.sub(this.left);
				}
				this.origin.add(this.right);
			} else {
				if (this.edge == 0) {
					this.origin.sub(this.left);
				} else {
					this.origin.sub(this.right);
				}
			}
			this.edge = val;
		}
		this.displayAxis.update();
		this.displayRadar.update();
	}

	getRotationPivotValues() {
		return this.rotationPivots.map( x => x.value );
	}

	setRotationPivotAxisValue(axisIndex, val, init = false) {
		const pivot = this.rotationPivots[axisIndex];
		this.resetPartRotation();
		if (!init) this.origin.sub(pivot.offset);
		pivot.offset.copy(this.fullAxisOptions[axisIndex].value);
		pivot.offset.multiplyScalar(val);
		if (!init) this.origin.add(pivot.offset);
		pivot.value = val;
		this.displayAxis.update();
		this.displayRadar.update();
	}

	get rotationPivotLeftRight() {
		return this.rotationPivots[Dirs.LeftRight.index].value;
	}

	get rotationPivotUpDown() {
		return this.rotationPivots[Dirs.UpDown.index].value;
	}

	get rotationPivotFrontBack() {
		return this.rotationPivots[Dirs.FrontBack.index].value;
	}

	set rotationPivotLeftRight(val) {
		this.setRotationPivotAxisValue(Dirs.LeftRight.index, val);
	}

	set rotationPivotUpDown(val) {
		this.setRotationPivotAxisValue(Dirs.UpDown.index, val);
	}

	set rotationPivotFrontBack(val) {
		this.setRotationPivotAxisValue(Dirs.FrontBack.index, val);
	}

	setRotationPivotAxisValuesFromAnnotation(annotation) {
		this.setRotationPivotAxisValue(Dirs.UpDown.index, annotation.upLength, true);
		this.setRotationPivotAxisValue(Dirs.LeftRight.index, annotation.leftLength, true);
		this.setRotationPivotAxisValue(Dirs.FrontBack.index, annotation.forwardLength, true);
	}

	updateBaseOBB() {
		// Compute OBB of base (for now, just take base obbs and compute)
		if (this.baseParts.length === 1) {
			this.baseObb = this.baseParts[0].obb;
		} else if (this.baseParts.length > 0) {
			const obbs = this.baseParts.map(p => p.obb);
			const points = _.flatten(obbs.map(obb => obb.getCorners()));
			this.baseObb = OBBFitter.fitPointsOBB(points, {constrainVertical: false});
		} else {
			this.baseObb = null;
		}
		//console.log(this.baseObb);
	}

	setBaseParts(part, baseParts) {
		this.baseParts = [];
		this.setChildren(part, []);
		this.addBaseParts(part, baseParts);
	}

	addBaseParts(part, baseParts) {
		baseParts.forEach(base => {
			this.baseParts.push(base);
			base.object3D.parent = this.object3D;
			base.isBasePart = true;
			this.colorPart(base, ArticulationsConstants.BASE_PART_COLOR, ArticulationsConstants.PART_OPACITY);
		});

		this.updateChildren(part);
		this.updateBaseOBB();
	}

	setTranslationBasePart(part, base) {
		this.addBaseParts(part, [base]);
	}

	setRotationBasePart(part, base) {
		this.addBaseParts(part, [base]);
		if (this.articulationType === ArticulationTypes.HINGE_ROTATION) {
			this.initHingeSuggestions(part);
		}
	}

	removeBasePart(part, base) {
		this.baseParts.splice(this.baseParts.indexOf(base), 1);
		base.object3D.parent = part.object3D;
		base.isBasePart = false;
		this.colorPart(base, ArticulationsConstants.CONNECTED_COLOR, ArticulationsConstants.PART_OPACITY);

		this.updateChildren(part);
		this.updateBaseOBB();

		if (this.baseParts.length === 0) {
			this.resetParts(true);
			this.displayAxis.clearPoints();
			this.displayAxis.update();
		}
	}

	setAxis(axis) {
		this.axis.copy(axis);
	}

	setOrigin(origin) {
		this.origin.copy(origin);
	}

	/**
	 * Color part
	 * @param part {parts.Part}
	 * @param color Color to apply to the part
	 * @param opacity opacity to apply to the part
	 */
	colorPart(part, color, opacity = 1) {
		//part.object3D.material.color = color;
		Object3DUtil.traverse(part.object3D, function(p) {
			if (p.userData.pid != null && p !== part.object3D) {
				return false;
			} else if (p instanceof THREE.Mesh) {
				const materials = Object3DUtil.getMeshMaterials(p);
				materials.forEach(m => m.color = color);
				materials.forEach(m => m.opacity = opacity);
				materials.forEach(m => m.transparent = (opacity < 1));
				return false;
			} else {
				return true;
			}
		});
	}

	colorPartRestore(part) {
		this.colorPart(part, part.prevColor, ArticulationsConstants.PART_OPACITY);
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
	initAnnotation(part, articulationType, suggest=true) {
		this.resetState();

		this.setChildren(part);
		this.updateChildren(part);

		this.articulationType = articulationType;
		this.setAxisOptions(part);

		if (suggest) {
			this.suggestAxis(part, isTranslationType(articulationType));
		}
	}

	/**
	 * Generates axis and origin options using oriented bounding box.
	 *
	 * @param part {parts.Part} The part being annotated
	 */
	computeArticulationOptions(part, hinged=false) {
		let obb = part.obb;

		const pivotAxisOptions = this.getOBBAxes(obb);
		let axisOptions;
		if (hinged && this.baseObb != undefined) {
			console.log('Use base obb axes for hinge');
			axisOptions = this.getOBBAxes(this.baseObb);
		} else {
			console.log('Use part obb axes');
			axisOptions = this.getOBBAxes(obb);
		}

		const edgeOptions = [
			new THREE.Vector3(obb.halfSizes.x, 0, 0),
			new THREE.Vector3(0, obb.halfSizes.y, 0),
			new THREE.Vector3(0, 0, obb.halfSizes.z),
			// For some reason, using these options and then getWorldPosition does
			// not work correctly.
			// new THREE.Vector3(1, 0, 0),
			// new THREE.Vector3(0, 1, 0),
			// new THREE.Vector3(0, 0, 1),
		];

		const originOptions = [
			new THREE.Vector3(0.5, 0.5, 0.5),
			new THREE.Vector3(0.5, 0.5, 1),
			new THREE.Vector3(0.5, 0.5, 0),
			new THREE.Vector3(0.5, 1, 0.5),
			new THREE.Vector3(0.5, 0, 0.5),
			new THREE.Vector3(1, 0.5, 0.5),
			new THREE.Vector3(0, 0.5, 0.5),
			new THREE.Vector3(0.5, 1, 1),
			new THREE.Vector3(0.5, 1, 0),
			new THREE.Vector3(0.5, 0, 1),
			new THREE.Vector3(0.5, 0, 0),
			new THREE.Vector3(1, 0.5, 1),
			new THREE.Vector3(1, 0.5, 0),
			new THREE.Vector3(1, 1, 0.5),
			new THREE.Vector3(1, 0, 0.5),
			new THREE.Vector3(0, 0.5, 1),
			new THREE.Vector3(0, 0.5, 0),
			new THREE.Vector3(0, 1, 0.5),
			new THREE.Vector3(0, 0, 0.5)
		];

		// This is to get the orientation of the obb so that the origin is selected correctly
		originOptions.forEach(opt => {
			obb.getWorldPosition(opt, opt);
		});

		edgeOptions.forEach(opt => {
			opt.applyQuaternion(obb.getRotationQuaternion());
			// obb.getWorldPosition(opt, opt);
		});

		return { axisOptions: axisOptions, pivotAxisOptions: pivotAxisOptions, originOptions: originOptions, edgeOptions: edgeOptions };
	}

	/**
	 * Set axis and origin options from generated ones using oriented bounding box and custom saved axes
	 *
	 * @param part {parts.Part} The part being annotated
	 */
	setAxisOptions(part, hinged=false) {
		const computedOptions = this.computeArticulationOptions(part, hinged);
		this.pivotAxisOptions = computedOptions.pivotAxisOptions;
		this.originOptions = computedOptions.originOptions;
		this.edgeOptions = computedOptions.edgeOptions;
		this.edgeOption = 0;

		this.fullAxisOptions = OrderedDirs.map((d,i) =>
			new Option(d.name, d.label, computedOptions.axisOptions[d.index], "axis", "obb"));
		const axisOptions = this.customAxisOptions;
		if (axisOptions && axisOptions.length) {
			this.fullAxisOptions.push.apply(this.fullAxisOptions, axisOptions);
		}
	}

	addCustomAxisOption(axis) {
		const index = this.customAxisOptions.length;
		const option = new Option("c" + index, "Custom" + index, axis, "axis", "custom");
		this.customAxisOptions.push(option);
		this.fullAxisOptions.push(option);
		return { index: this.fullAxisOptions.length - 1, option: option };
	}

	setCustomAxis(index, axis) {
		this.fullAxisOptions[index].value.copy(axis);
	}

	getOBBAxes(obb) {
		let axes = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
		obb.extractBasis(axes[0], axes[1], axes[2]);
		return axes;
	}

	getScaledOBBAxes(obb) {
		let axes = this.getOBBAxes(obb);
		axes[0].multiplyScalar(obb.halfSizes.x);
		axes[1].multiplyScalar(obb.halfSizes.y);
		axes[2].multiplyScalar(obb.halfSizes.z);
		return axes;
	}

	setTranslationAxisOptions() {
		const baseAxes = this.getScaledOBBAxes(this.baseObb);
		const baseCentroid = this.baseObb.position.clone().add(this.partObb.position);

		const origin = this.originOptions[this.originIndex];
		for (let i = 0; i < this.fullAxisOptions.length; i++) {
			const option = this.fullAxisOptions[i];
			const axis = option.value;
			const dirLength = axis.dot(baseAxes[0]) + axis.dot(baseAxes[1]) + axis.dot(baseAxes[2]);
			const originDiff = baseCentroid.clone().sub(origin).dot(axis);
			const upperDiff = baseCentroid.clone().addScaledVector(axis, + dirLength).sub(origin).dot(axis) - originDiff;
			const lowerDiff = baseCentroid.clone().addScaledVector(axis, - dirLength).sub(origin).dot(axis) - originDiff;
			const rangeMin = Math.min(upperDiff, lowerDiff);
			const rangeMax = Math.max(upperDiff, lowerDiff);
			const fullDirLength = 2.0 * Math.abs(dirLength);
			option.translation = {
				fullRangeMin: rangeMin - fullDirLength,
				fullRangeMax: rangeMax + fullDirLength,
				defaultRangeMin: rangeMin,
				defaultRangeMax: rangeMax,
				axisLength: Math.abs(rangeMax - rangeMin),
				dirLength: fullDirLength
			};
		}

		if (!this.translation.rangeMin && !this.translation.rangeMax) {
			const axisOption = this.fullAxisOptions[this.axisIndex];
			this.translation.rangeMax = axisOption.translation.defaultRangeMax;
			this.translation.rangeMin = axisOption.translation.defaultRangeMin;
			console.log(axisOption);
		}
		this.resetRotationAxisOptions();
	}

	getRotationPivotOptions(type) {
		const values = this.getRotationPivotValues();
		let ranges;
		if (type === 'hinge') {
			const baseCentroid = this.baseObb.position;
			const origin = this.originOptions[this.originIndex];
			const halfSizes = this.pivotObb.halfSizes.toArray();
			ranges = OrderedDirs.map((dir,i) => {
				const axis = this.pivotAxisOptions[i];
				const v1 = baseCentroid.clone().addScaledVector(axis, +halfSizes[i]).sub(origin).dot(axis);
				const v2 = baseCentroid.clone().addScaledVector(axis, -halfSizes[i]).sub(origin).dot(axis);
				return {
					name: dir.name,
					label: dir.label,
					min: Math.min(v1, v2),
					max: Math.max(v1, v2),
					value: values[i]
				};
			});
		} else {
			const halfSizes = this.pivotObb.halfSizes.toArray();
			ranges = OrderedDirs.map((dir, i) => {
				return {
					name: dir.name,
					label: dir.label,
					min: -halfSizes[i],
					max: +halfSizes[i],
					value: values[i]
				};
			});
		}
		return ranges;
	}

	resetRotationAxisOptions() {
		for (let p of this.rotationPivots) {
			p.offset.setScalar(0);
		}
	}

	clearPartTransform(part) {
		let m1 = new THREE.Matrix4();
		m1.getInverse( part.object3D.matrix );
		part.object3D.applyMatrix4(m1);
		this.translation.value = this.translation.defaultValue;
	}

	resetPartRotation() {
		if (this.isRotating) {
			this.clearPartTransform(this.activePart);
			this.rotation.value = this.rotation.defaultValue;
		}
	}

	/**
	 * Ensures translation still within range when range is changed.
	 */
	updateTranslationRange() {
		if (this.translation.value > this.translation.rangeMax) {
			this.activePart.object3D.translateOnAxis(this.axis, -(this.translation.value - this.translation.rangeMax));
			this.displayAxis.updateAxisPoint(-(this.translation.value - this.translation.rangeMax));
			this.translation.value = this.translation.rangeMax;
		}

		if (this.translation.value < this.translation.rangeMin) {
			this.activePart.object3D.translateOnAxis(this.axis, -(this.translation.value - this.translation.rangeMin));
			this.displayAxis.updateAxisPoint(-(this.translation.value - this.translation.rangeMin));
			this.translation.value = this.translation.rangeMin;
		}
	}

	updateRotationAxis(axisIndex) {
		this.axisIndex = axisIndex;
		this.setAxis(this.fullAxisOptions[axisIndex].value);
		this.resetPartRotation();

		this.displayAxis.update();
		this.displayRadar.update();
	}

	updateReferenceAxis(axisIndex) {
		this.refAxisIndex = axisIndex;
		this.refAxis.copy(this.fullAxisOptions[axisIndex].value);
		this.resetPartRotation();

		this.displayAxis.update();
		if (this.isRotating) {
			this.displayRadar.update();
		}
	}

	updateTranslationAxis(axisIndex) {
		this.axisIndex = axisIndex;
		this.setAxis(this.fullAxisOptions[this.axisIndex].value);

		this.resetParts(true);
		this.setTranslationAxisOptions();

		this.displayAxis.update(true, this.getAxisLength())
	}

	/**
	 * Suggests most likely axis given OBB of part. Current/only heuristic checks for rotational
	 * symmetry by seeing if any two dimensions of OBB are of same length; otherwise just defaults
	 * to vertical axis.
	 *
	 * @param part {parts.Part} The part being annotated
	 */
	suggestAxis(part, translation=false) {
		const EPS = 0.01;
		const obb = part.obb;
		if (translation) {
			let x = Math.abs(obb.halfSizes.y - obb.halfSizes.z);
			let y = Math.abs( obb.halfSizes.x - obb.halfSizes.z);
			let z = Math.abs(obb.halfSizes.y - obb.halfSizes.x);
			if (x < y) {
				if (x < z) {
					this.axisIndex = 0;
				} else {
					this.axisIndex = 2;
				}
			} else if (y < z) {
				this.axisIndex = 1;
			} else {
				this.axisIndex = 2;
			}
		} else {
			if (Math.abs(obb.halfSizes.x - obb.halfSizes.y) < EPS) {
				this.axisIndex = 0;
			} else if (Math.abs(obb.halfSizes.x - obb.halfSizes.z) < EPS) {
				this.axisIndex = 1;
			} else if (Math.abs(obb.halfSizes.z - obb.halfSizes.y) < EPS) {
				this.axisIndex = 2;
			} else {
				this.axisIndex = 1;
			}
		}

		this.originIndex = 0;
		this.setOrigin(this.originOptions[this.originIndex]);
		this.setAxis(this.fullAxisOptions[this.axisIndex].value);
	}

	/**
	 * Recursively sets children of input part with bases as 'parents'
	 * (or really more like 'not children'...).
	 *
	 * @param part {parts.Part}
	 * @param bases {Array<parts.Part>}
	 */
	setChildren(part, bases= null) {
		const children = this.getConnectedParts(part).filter(child => {
			if (!bases) return true;

			let acc = child.object3D.parent === this.object3D;
			bases.forEach(base => acc &= (base.pid !== child.pid));

			return acc;
		});

		part.object3D.children = children.map(c => c.object3D);
		children.forEach(child => {
			child.object3D.parent = part.object3D;

			if (bases) {
				this.setChildren(child, [...bases, part]);
			} else {
				this.setChildren(child, [part]);
			}
		});
	}

	/**
	 * Updates children of part given baseParts.
	 *
	 * The main difference between this and the above method (setChildren) is this
	 * is not recursive. Thus it is assumed that setChildren() has been called once
	 * before for each new root part.
	 *
	 * @param part {parts.Part}
	 */
	updateChildren(part) {
		const children = [];

		// Get all descendants of all base parts
		const basesAll = new Set();
		this.baseParts.forEach(base => {
			const basesSet = new Set();
			this.getConnectedBaseParts(part, base, basesSet);
			basesSet.forEach(base => basesAll.add(base));
		});

		part.object3D.children = [];
		this.getConnectedParts(part).forEach(child => {
			child.object3D.parent = part.object3D;
			let acc = true;

			this.baseParts.forEach(base => {
				acc &= base.pid !== child.pid;

				// Only add child if not a descendant of any base parts
				[...basesAll].forEach(baseChild => {
					acc &= (baseChild !== child.pid);
				});
			});

			if (acc) {
				children.push(child);
			} else {
				child.object3D.parent = this.object3D;
			}
		});

		part.object3D.children = children.map(c => c.object3D);
	}

	getConnectedBaseParts(part, curr, bases) {
		this.getConnectedParts(curr).forEach((child) => {
			if (child.pid !== part.pid) {
				if (!bases.has(child.pid)) {
					bases.add(child.pid);
					this.getConnectedBaseParts(part, child, bases);
				}
			}
		});

		return bases;
	}

	getCandidateBaseParts(part = this.activePart) {
		let candidates = this.getConnectedParts();
		if (candidates.length === 0) {
			// No possible base parts (return all parts expect for activePart)
			candidates = this.parts.filter(p => p && p !== part);
		}
		return candidates;
	}

	/**
	 * Essentially converts set of PIDs as returned by connectivityGraph to list of parts.
	 *
	 * @param part {parts.Part}
	 * @returns Array<parts.Part>
	 */
	getConnectedParts(part=this.activePart) {
		if (this.connectivityGraph[part.pid]) {
			return [...this.connectivityGraph[part.pid]].map(pid => this.parts[pid]).filter(p => p);
		} else return [];
	}

	getAxisLength() {
		return 0.05 + 1.5 * this.fullAxisOptions[this.axisIndex].translation.axisLength;
	}

	getOrigin() {
		return this.origin;
	}

	getArticulationTypeFromInterface() {
		if ($("#central-rotation").prop("checked")) {
			return ArticulationTypes.ROTATION;
		} else if ($("#hinge-rotation").prop("checked")) {
			return ArticulationTypes.HINGE_ROTATION;
		} else if ($("#translation").prop("checked")) {
			return ArticulationTypes.TRANSLATION;
		}
	}

	/**
	 * Stores annotation after user presses 'Submit' in annotation wizard.
	 *
	 * @param part {parts.Part}
	 * @param articulationType {ArticulationsTypes}
	 */
	storeAnnotations(part, articulationType= this.articulationType) {
		const annotation = {
			// Basic annotation
			pid: part.pid,
			type: articulationType,
			origin: this.origin.toArray(),
			axis: this.axis.toArray(),
			ref: this.isTranslating? undefined : this.refAxis.toArray(),
			base: this.baseParts.map(part => part.pid),

			// Additional information for the UI
			// originIndex: this.originIndex,
			// axisIndex: this.axisIndex,
			//
			// upLength: this.rotationPivotUpDown,
			// leftLength: this.rotationPivotLeftRight,
			// forwardLength: this.rotationPivotFrontBack,
			// edgeLeft: this.left.toArray(),
			// edgeRight: this.right.toArray(),
			// edge: this.edge,
		};

		if (isRotationType(articulationType)) {
			annotation.rangeMin = this.rotation.rangeMin;
			annotation.rangeMax = this.rotation.rangeMax;
		} else if (isTranslationType(articulationType)) {
			annotation.rangeMin = this.translation.rangeMin;
			annotation.rangeMax = this.translation.rangeMax;
		}

		if (this.annInd != null) {
			console.log("REPLACING WITH: ", annotation);
			this.annotations[part.pid][this.annInd] = annotation;
		} else {
			this.annotations[part.pid] = this.annotations[part.pid] || [];
			this.annotations[part.pid].push(annotation);
		}

		console.log(JSON.stringify(annotation));
		console.log(this.annotations);
		return annotation;
	}

	deleteAnnotation(part, ind) {
		this.annotations[part.pid].splice(ind, 1);
	}

	/**
	 * Stores annotations for parts of same type as part that was just annotated
	 * (i.e. if 'wheel 1' was just annotated, will store annotations for 'wheel 2',
	 * 'wheel 3', etc.), with an indication that the annotation needs review.
	 *
	 * @param annotation {Object} The original annotation from which to base suggestions after
	 * @param part {parts.Part}
	 */
	storeSuggestions(annotation, part) {
		const relatedParts = this.parts.filter(p => p && p.label === part.label && p.pid !== part.pid );

		relatedParts.forEach(p => {
			this.setAxisOptions(p, (annotation.type === ArticulationTypes.HINGE_ROTATION));
			const pid = p.pid;
			if (this.annotations[pid] && this.annotations[pid].length > 0) {
				this.annotations[pid] = [{
					pid: pid,
					type: annotation.type,
					origin: this.originOptions[this.originIndex].toArray(),
					axis: this.fullAxisOptions[this.axisIndex].value.toArray(),
					originIndex: this.originIndex,
					axisIndex: this.axisIndex,

					upLength: this.rotationPivotUpDown,
					leftLength: this.rotationPivotLeftRight,
					forwardLength: this.rotationPivotFrontBack,
					edgeLeft: this.edgeOptions[this.edgeOption].toArray(),
					edgeRight: this.edgeOptions[this.edgeOption].clone().negate().toArray(),

					rangeMin: annotation.rangeMin,
					rangeMax: annotation.rangeMax,
					edge: this.edge,
					base: annotation.base.slice(),
					needsReview: true,
				}];
			}
		});

		return relatedParts;
	}

	toggleFixedPartsVisibility() {
		this.setFixedPartsVisibility(!this.__showFixedParts);
	}

	setFixedPartsVisibility(flag) {
		this.__showFixedParts = flag;
		this.parts.forEach(p => { if (p) { p.object3D.visible = true; }} );
		if (!flag && this.activePart) {
			this.parts.forEach(p => {
				if (p) {
					let isFixed = !(this.baseParts.indexOf(p) >= 0 || Object3DUtil.isDescendantOf(p.object3D, this.activePart.object3D));
					if (isFixed) {
						p.object3D.visible = false;
					}
				}
			});
		}
	}

	/**
	 * Method to get the full annotation for a part given a raw annotation for
	 * that part.
	 *
	 * @param part {parts.Part}
	 * @param annotation {Object} The raw annotation
	 */
	getFullAnnotation(part, annotation, ind=null) {
		// First initialize the state for annotation annotation
		this.initAnnotation(part, annotation.type, true);
		// Update the state to reflect the new annotation
		this.setActive(part, annotation, ind, true);
		// Get the annotation for the part from the state
		const ann = this.storeAnnotations(part, annotation.type);
		return ann;
	}
}

ArticulationAnnotatorState.ArticulationTypes = ArticulationTypes;
ArticulationAnnotatorState.Dirs = Dirs;

// Exports
module.exports = ArticulationAnnotatorState;
