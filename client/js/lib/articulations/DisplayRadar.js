const MatrixUtil = require('math/MatrixUtil');
const CircleOutlineGeometry = require('geo/CircleOutlineGeometry');

class DisplayRadar {
	/**
	 * @param params.articulation {{axis: THREE.Vector3, origin: THREE.Vector3, rangeMin: number, rangeMax: number, ref: THREE.Vector3, defaultValue: number, value: number}}
	 * @param params.color {THREE.Color|number|string} Color for radar (default: red)
	 * @param params.currentLineColor {THREE.Color|number|string} Color for current pose (default: blue)
	 * @param params.initialLineColor {THREE.Color|number|string} Color for initial pose (default: yellow)
	 * @param params.refLineColor {THREE.Color|number|string} Color for ref axis (default: red)
	 * @param params.radarOpacity {number} Opacity for radar
	 */
	constructor(params) {
		this.articulation = params.articulation;
		this.color = (params.color != null)? params.color : 0xff0000;
		this.radarOpacity = params.radarOpacity || 0.35;
		this.currentLineColor = (params.currentLineColor != null)? params.currentLineColor : 0x1f77b4;
		this.refLineColor = (params.refLineColor != null)? params.refLineColor : 0xff0000;
		this.initialLineColor = (params.initialLineColor != null)? params.initialLineColor : 0xff7f0e;

		this.group = new THREE.Group();
		this.group.name = 'ArticulationRotationRadarGroup';  // Radar node + reference line
		this.node = new THREE.Group();
		this.node.name = 'ArticulationRotationRadar';  // Radar node
		this.radarCircle = null;

		this.__posAxis = new THREE.Vector3(0,0,1);
		this.__radarAxis = new THREE.Vector3(1,0,0);
	}

	update() {
		this.clear();
		const radarLength = 0.10;
		const lineLength = 0.15;

		// Add radar with range
		// Shows range of articulation (in xy plane, with 0 = x-axis)
		const geometry = new THREE.CircleGeometry(radarLength, 256,
			this.articulation.rangeMin, this.articulation.rangeMax - this.articulation.rangeMin);

		const outerGeometry = new CircleOutlineGeometry(lineLength, 512);

		const radarLineGeometry = new THREE.BufferGeometry();
		radarLineGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0,  1, 0, 0], 3));

		const radarMaterial = new THREE.MeshBasicMaterial({
			color: this.color,
			side: THREE.DoubleSide,
			transparent: true,
			opacity: this.radarOpacity,
			depthTest: false,
		});

		const radarLineMaterial = new THREE.LineBasicMaterial({
			color: this.color,
			depthTest: false
		});

		const circle = new THREE.Mesh(geometry, radarMaterial);
		const outerCircle = new THREE.LineLoop(outerGeometry, radarLineMaterial);
		this.node.add(circle);
		this.node.add(outerCircle);
		this.radarCircle = circle; // intersect with outerCircle is a bit buggy

		// Add currentLine
		const currentLine = new THREE.Line(radarLineGeometry, new THREE.LineBasicMaterial({
			color: this.currentLineColor, depthTest: false
		}));
		currentLine.name = 'CurrentLine';
		if (this.articulation.value != null) {
			currentLine.rotateOnWorldAxis(this.__posAxis, this.articulation.value);
		}
		currentLine.scale.multiplyScalar(lineLength);
		currentLine.renderOrder = 9;
		this.node.add(currentLine);

		// Add initialLine
		const initialLine = new THREE.Line(radarLineGeometry, new THREE.LineBasicMaterial({
			color: this.initialLineColor, depthTest: false
		}));
		initialLine.scale.multiplyScalar(radarLength);
		initialLine.name = 'InitialLine';
		initialLine.rotateOnWorldAxis(this.__posAxis, this.articulation.defaultValue);
		initialLine.renderOrder = 10;
		this.node.add(initialLine);

		// console.log('got articulation', this.articulation);
		if (this.articulation.ref != null) {
			let refDir = this.articulation.ref;
			const refOverlap = Math.abs(this.articulation.ref.dot(this.articulation.axis));
			if (refOverlap >= 0.01) {
				// not a true ref line
				console.warn('reference and axis are not orthogonal', this.articulation.ref, this.articulation.axis);
				refDir = this.articulation.ref.clone();
				refDir.addScaledVector(this.articulation.axis, -1);
				refDir.normalize();
			}
			const m = MatrixUtil.getAlignmentMatrix(this.__posAxis, this.__radarAxis, this.articulation.axis, refDir);
			this.node.setRotationFromMatrix(m);

			// Add ref line
			const ref = this.articulation.ref.clone().multiplyScalar(lineLength);
			const refLineGeometry = new THREE.BufferGeometry();
			refLineGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0,  ref.x, ref.y, ref.z], 3));
			const refLine = new THREE.Line(refLineGeometry, new THREE.LineBasicMaterial({
				color: this.refLineColor, depthTest: true
			}));
			refLine.name = 'RefLine';
			this.group.add(refLine);   // Add directly
		} else {
			// NOTE: Assumes positive axis is Z
			const m = MatrixUtil.getRotationMatrixFromZ(this.articulation.axis);
			this.node.setRotationFromMatrix(m);
		}

		// position group
		this.group.position.copy(this.articulation.origin);
		this.group.add(this.node);

		// Keep this so we can rotate it
		this.currentLine = currentLine;
	}

	rotate(delta) {
		this.currentLine.rotateOnWorldAxis(this.__posAxis, delta);  // NOTE this is not really on worldAxis (just parent)
	}

	updateValue() {
		this.currentLine.rotation.set(0,0,0);
		this.currentLine.rotateOnWorldAxis(this.__posAxis, this.articulation.value);
	}

	clear() {
		while (this.group.children.length > 0) {
			this.group.remove(this.group.children[0]);
		}
		while (this.node.children.length > 0) {
			this.node.remove(this.node.children[0]);
		}
		this.currentLine = null;
		this.refLine = null;
	}

	getRefAxisFromMainAxis(out) {
		// Set articulation axis from the current node rotation
		out = out || new THREE.Vector3();
		out.copy(this.__radarAxis).applyQuaternion(this.node.quaternion);
		return out;
	}

	getRefAxisFromRadarCirclePoint(point, out) {
		out = out || new THREE.Vector3();
		// transform to node local coordinate frame
		// compute what the reference axis should be based on the input point
		out.copy(point);
		this.node.worldToLocal(out);
		out.subVectors(out, this.node.position);
		out.normalize();
		out.applyQuaternion(this.node.quaternion);
		return out;
	}

	attach(parent) {
		parent.add(this.group);
	}

	detach() {
		if (this.group.parent != null) {
			this.group.parent.remove(this.group);
		}
	}

	set visible(v) {
		this.group.visible = v;
	}

	get visible() {
		return this.group.visible;
	}
}

// Exports
module.exports = DisplayRadar;
