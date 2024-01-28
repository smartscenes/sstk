const Articulation = require('articulations/Articulation');
const OBBFitter = require('geo/OBBFitter');
const Object3DUtil = require('geo/Object3DUtil');
const MatrixUtil = require('math/MatrixUtil');
const DisplayAxis = require('articulations/DisplayAxis');
const DisplayRadar = require('articulations/DisplayRadar');
const ArticulatedObject = require('articulations/ArticulatedObject');
const AxisOptions = require('./AxisOptions');
const _ = require('util/util');

const TRANSLATION_RANGE = 0.1;

const ArticulationTypes = Articulation.Type;

const Dirs = Object.freeze({
	LeftRight: { index: 0, name: "left", label: "Left/Right" },
	UpDown: { index: 1, name: "up", label: "Up/Down" },
	FrontBack: { index: 2, name: "front", label: "Front/Back" }
});
const OrderedDirs = [Dirs.LeftRight, Dirs.UpDown, Dirs.FrontBack];

const SignedDirs = Object.freeze({
	Left: { index: 0, name: "left", label: "Left" },
	Up: { index: 1, name: "up", label: "Up" },
	Front: { index: 2, name: "front", label: "Front" },
	Right: { index: 3, name: "right", label: "Right" },
	Down: { index: 4, name: "down", label: "Down" },
	Back: { index: 5, name: "back", label: "Back" }
});
const OrderedSignedDirs = [SignedDirs.Left, SignedDirs.Right, SignedDirs.Up, SignedDirs.Down, SignedDirs.Front, SignedDirs.Back];

function isRotationType(t) {
	return (t === ArticulationTypes.ROTATION);
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
		this.displayAxis = new DisplayAxis({
			articulation: this.translation,
			arrowHeadSize: 0.05,
			showNegAxis: true,
			defaultLength: 0.5,
			mainArrowColor: 0x0000ff
		});
		this.displayRadar = new DisplayRadar({ articulation: this.rotation, arrowHeadSize: 0.05 });

		// 3D elements
		// TODO: remove scene from this?
		this.scene = params.scene;
		this.displayAxis.attach(params.vizNode);
		this.displayRadar.attach(params.vizNode);
		if (params.object3D) {
			this.object3DBBox = Object3DUtil.getBoundingBox(params.object3D);
		}

		// Main edit ui
		this.editUI = params.editUI;
		// Active widget (expected to have save and cancel)
		this.activeWidget = null;

		// Articulation UI state
		this.annInd = null;
		this.baseParts = [];
		this.baseObb = null;  // OBB for base
		this.candidateParts = [];

		// Rotation pivot information
		this.rotationPivots = OrderedDirs.map((dir,i) => {
			return {
				offset: new THREE.Vector3(0,0,0),
				value: 0
			};
		});

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

		// Parameters on how to get candidate parts
		this.__candidateBasePartsOpts = params.candidateBasePartsOpts;

		// Part and annotation information
		this.partsAnnId = params.partsAnnId;
		this.parts = params.parts;
		this.annotations = params.annotations;
		this.initialConnectivityGraph = params.connectivityGraph;
		this.currentConnectivityGraph = params.connectivityGraph.clone();
		this.object3D = params.object3D;
		// Called when part is updated
		this.onPartUpdated = params.onPartUpdated || function(part) {};

		this.__showFixedParts = true;
		this.__axisIndex = 0;
		this.refAxisIndex = 1;
	}

	get attachedParts() {
		return this.candidateParts.filter(p => !p.state.isBase && p.state.isConnected);
	}

	get basePids() {
		return this.baseParts.map(p => p.pid);
	}

	get attachedPids() {
		return this.attachedParts.map(p => p.pid);
	}

	get candidatePids() {
		return this.candidateParts.map(p => p.pid);
	}

	get axisIndex() {
		return this.__axisIndex;
	}

	set axisIndex(v) {
		this.__axisIndex = v;
		// update axis value
		this.axis.copy(this.fullAxisOptions[v].value);
		if (this.refAxis == null || !this.isOrthogonalToMainAxis(this.refAxis)) {
			// Find reference axis that is orthogonal to the main axis
			let orthoIndex = this.findOrthogonalAxisIndex(this.fullAxisOptions, this.axis);
			if (orthoIndex < 0) {
				// Create new axis that is orthonormal
				const ortho = MatrixUtil.getOrthogonal(this.axis, this.refAxis);
				const option = AxisOptions.addCustomAxisOption(this.fullAxisOptions, AxisOptions.customAxisOptions, ortho);
				orthoIndex = option.index;
			}
			this.updateReferenceAxis( orthoIndex);
			//this.updateReferenceAxis( (this.axisIndex + 1) % 3);
		}
	}

	get activeArticulation() {
		if (this.isRotating) {
			return this.rotation;
		} else if (this.isTranslating) {
			return this.translation;
		}
	}

	get isRotating() {
		return (this.activePart && this.baseParts.length && isRotationType(this.articulationType));
	}

	get isTranslating() {
		return (this.activePart && this.baseParts.length && isTranslationType(this.articulationType));
	}

	get hasCurrentAnnotation() {
		return this.annInd != null;
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
				this.detachChildParts(part);
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
		this.resetParts();
		this.resetPartHierarchy();

		this.annInd = null;
		this.articulationType = this.editUI.getArticulationType();

		this.displayAxis.clear();
		this.displayRadar.clear();
	}

	/**
	 * Resets part positions/rotation, and prepares part for re-annotation
	 * @param resetRange {boolean} Whether to also reset counts for when animating translation/rotation
	 */
	resetPartTransforms(resetRange) {
		if (resetRange) {
			this.rotation.value = 0;
			this.rotation.rangeMin = -Math.PI;
			this.rotation.rangeMax = Math.PI;
			this.rotation.motionStates = {};

			this.translation.value = 0;
			this.translation.rangeMin = 0;
			this.translation.rangeMax = 0;
			this.translation.motionStates = {};
		}

		this.parts.forEach((part) => {
			if (part) {
				part.object3D.position.set(0, 0, 0);
				part.object3D.rotation.set(0, 0, 0);
			}
		});
	}

	resetParts() {
		this.resetPartTransforms(true);
		this.resetPartStates();
	}

	resetPartStates() {
		this.baseParts = [];
		this.parts.forEach(part => {
			if (part) {
				part.state.clear();
				if (part === this.activePart) {
					part.state.selected = true;
				}
			}
		});
		// populate candidate / attached parts
		if (this.activePart) {
			this.candidateParts = this.getCandidateBaseParts();
			this.candidateParts.forEach(p => p.state.isCandidate = true);
			const connectedParts = this.getConnectedParts(this.activePart);
			connectedParts.forEach(p => p.state.isConnected = true);
		} else {
			this.candidateParts = [];
		}
		this.parts.forEach(part => {
			this.onPartUpdated(part);
		});
	}

	findOrthogonalAxisIndex(axisOptions, targetAxis) {
		// Assumes all axes are normalized to 1
		for (let i = 0; i < axisOptions.length; i++) {
			const axis = axisOptions[i].value;
			const axisProj = targetAxis.dot(axis);
			if (Math.abs(axisProj) < 0.01) {
				// orthogonal enough
				return i;
			}
		}
		return -1;
	}

	findMatchingAxis(axisOptions, targetAxis, allowFlipped) {
		const negativeAxis = targetAxis.clone().negate();
		let best;
		let bestFlipped;
		let newAxisProj;
		for (let i = 0; i < axisOptions.length; i++) {
			const axis = axisOptions[i].value;
			newAxisProj = targetAxis.dot(axis);
			if (!best || newAxisProj > best.matchScore) {
				best = { axisIndex: i, isFlipped: false, matchScore: newAxisProj, negativeAxis: negativeAxis };
			}
			if (allowFlipped) {
				// Also check the negation of this axis
				newAxisProj = negativeAxis.dot(axis);
				if (!bestFlipped || newAxisProj > bestFlipped.matchScore) {
					bestFlipped = {axisIndex: i, isFlipped: true, matchScore: newAxisProj, negativeAxis: negativeAxis};
				}
			}
		}
		if (bestFlipped && bestFlipped.matchScore > best.matchScore) {
			return (Math.abs(1.0 - best.matchScore) < 0.01)? best : bestFlipped;
		} else {
			return best;
		}
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
		const matchAxis = this.findMatchingAxis(this.fullAxisOptions, annotation.axis, true);
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
			const option = AxisOptions.addCustomAxisOption(this.fullAxisOptions, AxisOptions.customAxisOptions, annotation.axis);
			this.__axisIndex = option.index;
		}
		this.axis.copy(annotation.axis);

		// Setting the refAxis and refAxisIndex
		if (annotation.refAxis) {
			const refMatchAxis = this.findMatchingAxis(this.fullAxisOptions, annotation.refAxis, false);
			if (Math.abs(refMatchAxis.matchScore - 1) < 0.0001) {
				if (refMatchAxis.isFlipped) {
					annotation.refAxis = refMatchAxis.negativeAxis;
					if (annotation.defaultValue != null) {
						annotation.defaultValue = -annotation.defaultValue;
					}
				}
			} else {
				// Add custom axis
				const option = AxisOptions.addCustomAxisOption(this.fullAxisOptions, AxisOptions.customAxisOptions, annotation.refAxis);
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
				// TODO: Not really sure what this does but can mutate origin if init not set
				this.setRotationPivotAxisValue(i, relativePivotValues[i], true);
			}
		}
	}

	setActive(part, annotation, ind) {
		this.activePart = part;

		if (this.annotations && this.annotations[part.pid] && this.annotations[part.pid].length) {
			this.annotations[part.pid].forEach((ann) => ann.needsReview = false);
		}

		// Reset part colors
		this.resetPartStates();

		if (annotation) {
			// Set basic annotation information that is shared with raw annotation (no UI information)
			//   and when there is extra UI information
			this.articulationType = annotation.type;
			this.annInd = ind;

			this.resetPartHierarchy();
			this.setBaseParts(part, annotation.base.map(pid => this.parts[pid]));
			this.setAxisOptions(part);

			annotation = Object.assign({}, annotation);
			annotation.axis = toVector3(annotation.axis);
			annotation.origin = toVector3(annotation.origin);
			annotation.ref = toVector3(annotation.ref);

			this.setUIParametersFromRawAnnotation(annotation);

			this.displayAxis.update();
			if (isTranslationType(annotation.type)) {
				this.translation.rangeMax = annotation.rangeMax;
				this.translation.rangeMin = annotation.rangeMin;
				this.translation.motionStates = Object.assign({}, annotation.motionStates);
				this.displayAxis.displayAxisPoints();
			} else if (isRotationType(annotation.type)) {
				this.rotation.rangeMax = annotation.rangeMax;
				this.rotation.rangeMin = annotation.rangeMin;
				this.rotation.motionStates = Object.assign({}, annotation.motionStates);
				this.displayRadar.update();
			}
		}
	}

	setArticulationType(articulationType, resetBase) {
		this.articulationType = articulationType;
		if (resetBase) {
			this.resetParts();
		} else {
			this.resetPartTransforms(false);
		}
		if (isRotationType(articulationType)) {
			this.displayRadar.update();   // update radar for rotation
		} else {
			this.displayRadar.clear();    // no radar for translation
		}
		this.displayAxis.update();
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
		// Assume that input axisIndex is Unsigned Dirs and our fullAxisIndex is SignedDirs
		const fullAxisIndex = axisIndex*2;
		this.resetPartRotation();
		if (!init) this.origin.sub(pivot.offset);
		pivot.offset.copy(this.fullAxisOptions[fullAxisIndex].value);
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
	}

	setBaseParts(part, baseParts) {
		this.baseParts = [];
		this.initPartChildren(part, []);
		this.addBaseParts(part, baseParts);
	}

	addBaseParts(part, baseParts) {
		const newBaseParts = baseParts.filter( bp => this.baseParts.indexOf(bp) < 0 );
		if (newBaseParts.length) {
			baseParts.forEach(basePart => {
				if (this.baseParts.indexOf(basePart) < 0) {
					this.baseParts.push(basePart);
				}
				this.detachChildPart(part, basePart);
				basePart.state.isBase = true;
				this.onPartUpdated(basePart);
			});
		}
		this.updateChildren(part);
		this.updateBaseOBB();
	}

	removeBaseParts(part, baseParts) {
		for (let i = 0; i < baseParts.length; i++) {
			const basePart = baseParts[i];
			const index = this.baseParts.indexOf(basePart);
			if (index >= 0) {
				this.baseParts.splice(index, 1);
			}
			if (basePart.state.isConnected) {
				this.attachChildPart(part, basePart);
			} else {
				this.detachChildPart(part, basePart);
			}
			basePart.state.isBase = false;
			this.onPartUpdated(basePart);
		}

		this.updateChildren(part);
		this.updateBaseOBB();

		if (this.baseParts.length === 0) {
			this.resetPartTransforms(true);
			this.displayAxis.clearPoints();
			this.displayAxis.update();
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
	initAnnotation(part, articulationType, suggest=true) {
		this.resetState();

		this.initPartChildren(part);
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
	computeArticulationOptions(part) {
		const obb = part.obb;

		const pivotAxisOptions = this.getOBBAxes(obb);
		const axisOptions = this.getOBBAxes(obb, true);

		// Note that edges are in the object coordinate
		// we get them by getting the AABB sides and then rotating them
		const edgeOptions = [
			new THREE.Vector3(obb.halfSizes.x, 0, 0),
			new THREE.Vector3(0, obb.halfSizes.y, 0),
			new THREE.Vector3(0, 0, obb.halfSizes.z)
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
		});

		return { axisOptions: axisOptions, pivotAxisOptions: pivotAxisOptions, originOptions: originOptions, edgeOptions: edgeOptions };
	}

	/**
	 * Set axis and origin options from generated ones using oriented bounding box and custom saved axes
	 *
	 * @param part {parts.Part} The part being annotated
	 */
	setAxisOptions(part) {
		const computedOptions = this.computeArticulationOptions(part);
		this.pivotAxisOptions = computedOptions.pivotAxisOptions;
		this.originOptions = computedOptions.originOptions;
		this.edgeOptions = computedOptions.edgeOptions;
		this.edgeOption = 0;

		this.fullAxisOptions = OrderedSignedDirs.map((d,i) =>
			AxisOptions.create(d.name, d.label, computedOptions.axisOptions[d.index], "axis", "obb"));
		const axisOptions = AxisOptions.customAxisOptions;
		if (axisOptions && axisOptions.length) {
			this.fullAxisOptions.push.apply(this.fullAxisOptions, axisOptions);
		}
	}

	getOBBAxes(obb, includeNegatives) {
		const axes = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
		obb.extractBasis(axes[0], axes[1], axes[2]);
		if (includeNegatives) {
			axes.push(axes[0].clone().negate());
			axes.push(axes[1].clone().negate());
			axes.push(axes[2].clone().negate());
		}
		return axes;
	}

	getScaledOBBAxes(obb) {
		const axes = this.getOBBAxes(obb);
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
			const maxSize = this.object3DBBox.maxDim()*2;
			option.translation = {
				customEditMin: -maxSize,
				customEditMax: +maxSize,
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

	getRotationPivotOptions() {
		const values = this.getRotationPivotValues();
		const halfSizes = this.pivotObb.halfSizes.toArray();
		const ranges = OrderedDirs.map((dir, i) => {
			return {
				name: dir.name,
				label: dir.label,
				min: -halfSizes[i],
				max: +halfSizes[i],
				value: values[i]
			};
		});
		return ranges;
	}

	resetRotationAxisOptions() {
		for (let p of this.rotationPivots) {
			p.offset.setScalar(0);
		}
	}

	clearPartTransform(part) {
		part.object3D.rotation.set(0, 0, 0);
		part.object3D.scale.set(1, 1, 1);
		part.object3D.position.set(0, 0, 0);
		part.object3D.updateMatrix();

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

	isOrthogonalToMainAxis(axis) {
		console.log('got candidate axis', axis, Math.abs(axis.length() - 1) < 0.01);
		return Math.abs(this.axis.dot(axis)) < 0.01;
	}

	updateTranslationAxis(axisIndex) {
		this.axisIndex = axisIndex;

		this.resetPartTransforms(true);
		this.setTranslationAxisOptions();

		this.displayAxis.update(true, this.getAxisLength());
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
			const x = Math.abs(obb.halfSizes.y - obb.halfSizes.z);
			const y = Math.abs( obb.halfSizes.x - obb.halfSizes.z);
			const z = Math.abs(obb.halfSizes.y - obb.halfSizes.x);
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
		this.origin.copy(this.originOptions[this.originIndex]);
	}


	detachChildParts(part) {
		const childObjs = part.object3D.children.filter(p => p.userData.type === 'Part');
		childObjs.forEach(c => {
			part.object3D.remove(c);
			this.object3D.add(c);
			//Object3DUtil.detachFromParent(c, this.object3D);
		});
	}

	detachChildPart(part, child) {
		if (child.object3D.parent === this.object3D) {
			// okay
		} else {
			child.object3D.parent.remove(child.object3D);
			this.object3D.add(child.object3D);
			//Object3DUtil.detachFromParent(child, this.object3D);
		}
	}

	attachChildPart(part, child) {
		if (part !== child) {
			part.object3D.add(child.object3D);
			//Object3DUtil.attachToParent(child.object3D, part.object3D, this.object3D);
		}
	}

	/**
	 * Recursively sets children of input part with bases as 'parents'
	 * (or really more like 'not children'...).
	 *
	 * @param part {parts.Part}
	 * @param bases {Array<parts.Part>}
	 */
	initPartChildren(part, bases= null) {
		// remove children that are other parts
		this.detachChildParts(part);

		const children = this.getConnectedParts(part).filter(child => {
			if (!bases) {
				return child.pid !== part.pid;
			} else {
				// check child is not a base object
				const acc = (child.object3D.parent === this.object3D) && (child.pid !== part.pid);
				const isBase = bases.find(base => base.pid === child.pid);
				return acc && !isBase;
			}
		});

		children.forEach(child => {
			this.attachChildPart(part, child);

			if (bases) {
				this.initPartChildren(child, [...bases, part]);
			} else {
				this.initPartChildren(child, [part]);
			}
		});
	}

	/**
	 * Updates children of part with attachedParts.
	 *
	 * @param part {parts.Part}
	 */
	setPartChildren(part, attachedParts) {
		const children = [];
		// remove children that are other parts
		this.detachChildParts(part);
		this.getConnectedParts(part).forEach(child => {
			const addChild = attachedParts.indexOf(child) >= 0;
			if (addChild) {
				children.push(child);
			}
		});
		children.forEach(c => this.attachChildPart(part, c));
	}

	/**
	 * Updates children of part given baseParts.
	 *
	 * @param part {parts.Part}
	 */
	updateChildren(part) {
		// Get all descendants of all base parts
		let attachedParts = [];
		if (part === this.activePart) {
			 attachedParts = this.attachedParts;
		}

		const basesIds = new Set();
		this.baseParts.forEach(base => {
			this.getConnectedBasePids(part, base, basesIds);
		});
		basesIds.add(part.pid);

		if (part !== this.activePart) {
			attachedParts = this.getConnectedParts(part).filter(x => !basesIds.has(x.pid));
		}
		this.setPartChildren(part, attachedParts);
	}

	getConnectedBasePids(part, curr, bases) {
		if (part.pid !== curr.pid) {
			bases.add(curr.pid);
		}
		this.getConnectedParts(curr).forEach((child) => {
			if (child.pid !== part.pid) {
				if (!bases.has(child.pid)) {
					bases.add(child.pid);
					this.getConnectedBasePids(part, child, bases);
				}
			}
		});

		return bases;
	}

	getCandidateBaseParts() {
		const opts = this.__candidateBasePartsOpts;
		return this.__getCandidateBaseParts(this.activePart, opts.useSameObjectInst, opts.allowConnected, opts.allowAnyPart);
	}

	/**
	 * Get candidate base parts (these will be parts that are either connected or belong to the same object instance)
	 * @param part {parts.Part}
	 * @param useSameObjectInst {boolean} If true, candidate parts will be parts that belong to the same object instance.
	 * @param allowConnected {boolean} Whether if connected parts will be used
	 * @param allowAnyPart {boolean} Whether if there are no viable candidate base parts, other parts will be allowed
	 * @returns {parts.Part[]}
	 * @private
	 */
	__getCandidateBaseParts(part, useSameObjectInst = false, allowConnected = true, allowAnyPart = false) {
		console.log('getCandidateParts', useSameObjectInst, allowConnected, allowAnyPart)
		let candidates = useSameObjectInst? this.__getOtherPartsWithSameObjectId(part) : [];
		if (candidates.length === 0 && allowConnected) {
			candidates = this.getInitialConnectedParts(part);
		}
		if (candidates.length === 0 && allowAnyPart) {
			// No possible base parts (return all parts expect for activePart)
			candidates = this.parts.filter(p => p && p !== part);
		}
		return candidates;
	}

	__getOtherPartsWithSameObjectId(part) {
		if (part.objectInstId != null) {
			return this.parts.filter(p => p && p.objectInstId === part.objectInstId && p !== part);
		} else {
			return [];
		}
	}

	/**
	 * Essentially converts set of PIDs as returned by connectivityGraph to list of parts.
	 *
	 * @param part {parts.Part}
	 * @returns Array<parts.Part>
	 */
	getConnectedParts(part=this.activePart) {
		return this.currentConnectivityGraph.getConnectedParts(part).filter(p => p);
	}

	getInitialConnectedParts(part=this.activePart) {
		return this.initialConnectivityGraph.getConnectedParts(part).filter(p => p);
	}

	setConnectivity(part1, part2, flag) {
		if (flag) {
			this.currentConnectivityGraph.add(part1.pid, part2.pid, true);
		} else {
			this.currentConnectivityGraph.remove(part1.pid, part2.pid, true);
		}
	}

	getAxisLength() {
		return 0.05 + 1.5 * this.fullAxisOptions[this.axisIndex].translation.axisLength;
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
			base: this.basePids,
		};


		if (isRotationType(articulationType)) {
			annotation.rangeMin = this.rotation.rangeMin;
			annotation.rangeMax = this.rotation.rangeMax;
			annotation.motionStates = Object.assign({}, this.rotation.motionStates);
		} else if (isTranslationType(articulationType)) {
			annotation.rangeMin = this.translation.rangeMin;
			annotation.rangeMax = this.translation.rangeMax;
			annotation.motionStates = Object.assign({}, this.translation.motionStates);
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

	deleteAllAnnotations() {
		this.annotations = [];
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
			this.setAxisOptions(p);
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
					const isFixed = !(this.baseParts.indexOf(p) >= 0 || Object3DUtil.isDescendantOf(p.object3D, this.activePart.object3D));
					if (isFixed) {
						p.object3D.visible = false;
					}
				}
			});
		}
	}

	getAnnotationsForPid(pid) {
		return this.annotations[pid] || [];
	}

	getTotalAnnotationsCount() {
		let count = 0;
		for (let i = 0; i < this.annotations.length; i++) {
			if (this.annotations[i]) {
				count += this.annotations[i].length;
			}
		}
		return count;
	}

	getArticulations() {
		const annotations = this.annotations;
		const articulations = [];
		for (let i = 0; i < annotations.length; i++) {
			if (annotations[i] && annotations[i].length) {
				articulations.push.apply(articulations, annotations[i]);
			}
		}
		return articulations;
	}

	getArticulatedObject3D() {
		const articulations = this.getArticulations();
		const connectivityGraph = this.currentConnectivityGraph.clone(true);  // Clone parts
		return new ArticulatedObject(articulations, connectivityGraph);
	}

	getArticulatedScene() {
		const scene = ArticulatedObject.createArticulatedScene(this.object3D.name, this.currentConnectivityGraph,
			(pid) => this.getAnnotationsForPid(pid), ['remove']);
		return scene;
	}
}

ArticulationAnnotatorState.ArticulationTypes = ArticulationTypes;
ArticulationAnnotatorState.Dirs = Dirs;

// Exports
module.exports = ArticulationAnnotatorState;
