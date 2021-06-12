const MatrixUtil = require('math/MatrixUtil');

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

		const outerGeometry = new THREE.CircleGeometry(lineLength, 512);
		outerGeometry.vertices.shift();

		const radarLineGeometry = new THREE.Geometry();
		radarLineGeometry.vertices.push(
			new THREE.Vector3(0, 0, 0),
			new THREE.Vector3(1, 0, 0));

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

		if (this.articulation.ref != null) {
			const m = MatrixUtil.getAlignmentMatrix(this.__posAxis, this.__radarAxis, this.articulation.axis, this.articulation.ref);
			this.node.setRotationFromMatrix(m);

			// Add ref line
			const ref = this.articulation.ref.clone().multiplyScalar(lineLength);
			const refLineGeometry = new THREE.Geometry();
			refLineGeometry.vertices.push(new THREE.Vector3(0, 0, 0), ref);
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

	attach(parent) {
		parent.add(this.group);
	}

	detach() {
		if (this.group.parent != null) {
			this.group.parent.remove(this.group);
		}
	}
}

// Exports
module.exports = DisplayRadar;
