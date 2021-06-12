const MatrixUtil = require('math/MatrixUtil');
const Object3DUtil = require('geo/Object3DUtil');

class DisplayAxis {
	/**
	 * @param params.articulation {{axis: THREE.Vector3, origin: THREE.Vector3, rangeMin: number, rangeMax: number, ref: THREE.Vector3, defaultValue: number, value: number}}
	 * @param [params.color] {THREE.Color|number|string} Color for axis (default: black)
	 * @param [params.axisPointColor] {THREE.Color|number|string} Color for min/max axis points (default: light red)
	 * @param [params.currentPointColor] {THREE.Color|number|string} Color for current position (default: blue)
	 * @param [params.originPointColor] {THREE.Color|number|string} Color for axis origin (default: red)
	 * @param [params.initialPointColor] {THREE.Color|number|string} Color for initial position (default: yellow)
	 * @param [params.arrowHeadSize] {number} Size of arrow head (default: 0.2)
	 * @param [param.defaultLength] {number} Length to use for axis (default: 1)
	 * @param [param.showNegAxis] {boolean} Whether the negative axis is also shown (default: false)
	 */
	constructor(params) {
		this.articulation = params.articulation;
		this.color = (params.color != null) ? params.color : 0x000000;
		this.axisPointColor = (params.axisPointColor != null)? params.axisPointColor : 0x800080;
		this.currentPointColor = (params.currentPointColor != null)? params.currentPointColor : 0x0000ff;
		this.originPointColor = (params.originPointColor != null)? params.originPointColor : 0xff0000;
		this.initialPointColor = (params.initialPointColor != null)? params.initialPointColor : 0xff0000;
		this.arrowHeadSize = (params.arrowHeadSize != null)? params.arrowHeadSize : 0.2;
		this.defaultLength = params.defaultLength || 1;
		this.showNegAxis = params.showNegAxis;

		this.node = new THREE.Group();
		this.node.name = 'ArticulationAxis';

		this.__posAxis = new THREE.Vector3(0,0,1);
		this.__negAxis = new THREE.Vector3(0,0,-1);
	}

	update(displayPoints, length=this.defaultLength) {
		this.clear();

		const axisColor = this.color;
		this.arrowHelper1 = new THREE.ArrowHelper(this.__posAxis, new THREE.Vector3(0,0,0), length, axisColor, this.arrowHeadSize);
		if (this.showNegAxis) {
			this.arrowHelper2 = new THREE.ArrowHelper(this.__negAxis, new THREE.Vector3(0, 0, 0), length, axisColor, this.arrowHeadSize);
		}

		Object3DUtil.setDepthTest(this.arrowHelper1, false);
		if (this.showNegAxis) {
			Object3DUtil.setDepthTest(this.arrowHelper2, false);
		}

		this.node.add(this.arrowHelper1);
		if (this.showNegAxis) {
			this.node.add(this.arrowHelper2);
		}

		// NOTE: Assumes positive axis is Z
		const m = MatrixUtil.getRotationMatrixFromZ(this.articulation.axis);
		this.node.setRotationFromMatrix(m);
		this.node.position.copy(this.articulation.origin);

		if (displayPoints) {
			this.displayAxisPoints();
		}
	}

	updateAxisPoint(delta) {
		this.axisPoint.translateOnAxis(this.__posAxis, delta);
	}

	updateValue() {
		this.axisPoint.position.set(0,0,0);
		this.axisPoint.translateOnAxis(this.__posAxis, this.articulation.value);
	}

	updateRange(rangeMin, rangeMax) {
		if (rangeMin != undefined) {
			this.articulation.rangeMin = rangeMin;
		}
		if (rangeMax != undefined) {
			this.articulation.rangeMax = rangeMax;
		}

		this.maxAxisPoint.position.set(0, 0, 0);
		this.minAxisPoint.position.set(0, 0, 0);

		this.maxAxisPoint.translateOnAxis(this.__posAxis, this.articulation.rangeMax);
		this.minAxisPoint.translateOnAxis(this.__posAxis, this.articulation.rangeMin);
	}

	getAxis(axis) {
		// Set articulation axis from the current node rotation
		axis = axis || new THREE.Vector3();
		axis.copy(this.__posAxis).applyQuaternion(this.node.quaternion);
		return axis;
	}

	/**
	 * Displays three points on axis of translation, each representing min translation
	 * point, max translation point, and current translation point.
	 */
	displayAxisPoints() {
		this.clearPoints();

		const geometry = new THREE.BoxGeometry(.07, .07, .07);
		const geometry_current = new THREE.BoxGeometry(.03, .03, .03);

		// Material for min/max,  current value, origin
		const material_minmax = new THREE.MeshBasicMaterial({ color: this.axisPointColor, transparent: true, opacity: 0.3, depthTest: false });
		const material_current = new THREE.MeshBasicMaterial({ color: this.currentPointColor, depthTest: false });
		const material_origin = new THREE.MeshBasicMaterial({ color: this.originPointColor, depthTest: false });
		const material_initial = new THREE.MeshBasicMaterial({ color: this.initialPointColor, depthTest: false });

		// Create axis points
		this.maxAxisPoint = new THREE.Mesh(geometry, material_minmax);
		this.minAxisPoint = new THREE.Mesh(geometry, material_minmax);
		this.originPoint = new THREE.Mesh(geometry_current, material_origin);
		this.initialPoint = new THREE.Mesh(geometry_current, material_initial);

		// Object3DUtil.setOpacity(this.maxAxisPoint, 0.5);
		// Object3DUtil.setOpacity(this.minAxisPoint, 0.5);

		this.maxAxisPoint.translateOnAxis(this.__posAxis, this.articulation.rangeMax);
		this.minAxisPoint.translateOnAxis(this.__posAxis, this.articulation.rangeMin);
		this.initialPoint.translateOnAxis(this.__posAxis, this.articulation.defaultValue);
		// this.originPoint.translateOnAxis(this.__posAxis, this.articulation.value);

		this.node.add(this.initialPoint);
		this.node.add(this.originPoint);
		this.node.add(this.maxAxisPoint);
		this.node.add(this.minAxisPoint);

		if (this.articulation.value != null) {
			this.axisPoint = new THREE.Mesh(geometry_current, material_current);
			this.axisPoint.translateOnAxis(this.__posAxis, this.articulation.value);
			this.node.add(this.axisPoint);
		}
	}

	/**
	 * Clear three axis points and axis if they exist.
	 */
	clear() {
		this.clearPoints();

		if (this.arrowHelper1) {
			this.node.remove(this.arrowHelper1);
			this.arrowHelper1 = null;
		}

		if (this.arrowHelper2) {
			this.node.remove(this.arrowHelper2);
			this.arrowHelper2 = null;
		}
	}

	clearPoints() {
		if (this.initialPoint) {
			this.node.remove(this.initialPoint);
			this.initialPoint = null;
		}

		if (this.originPoint) {
			this.node.remove(this.originPoint);
			this.originPoint = null;
		}

		if (this.axisPoint) {
			this.node.remove(this.axisPoint);
			this.axisPoint = null;
		}

		if (this.maxAxisPoint) {
			this.node.remove(this.maxAxisPoint);
			this.maxAxisPoint = null;
		}

		if (this.minAxisPoint) {
			this.node.remove(this.minAxisPoint);
			this.minAxisPoint = null;
		}
	}

	attach(parent) {
		parent.add(this.node);
	}

	detach() {
		if (this.node.parent != null) {
			this.node.parent.remove(this.node);
		}
	}
}

// Exports
module.exports = DisplayAxis;