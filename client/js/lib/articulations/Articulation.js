'use strict';

const Object3DUtil = require('geo/Object3DUtil');  // Only used for convenient toVector3 function
const OBB = require('../geo/OBB');

/**
 * Returns a rotation matrix about a given axis and origin (i.e. center of rotation)
 * @private
 */
var rotationAxisOrigin = (function() {
	var tmpMat1 = new THREE.Matrix4();
	var tmpMat2 = new THREE.Matrix4();
	var tmpMat3 = new THREE.Matrix4();
	return function(axis, origin, angle) {
		// Translate origin to the world origin
		let trans = tmpMat1.makeTranslation(-origin.x, -origin.y, -origin.z);
		// Rotate about axis
		const rot = tmpMat2.makeRotationAxis(axis, angle);
		const transRot = tmpMat3.multiplyMatrices(rot, trans);
		// Translate back to the origin
		trans = tmpMat1.makeTranslation(origin.x, origin.y, origin.z);
		return tmpMat2.multiplyMatrices(trans, transRot);
	};
})();

/**
 * Articulation
 * @memberOf articulations
 */
class Articulation {
    constructor(params, keepOrigVector) {
        this.copy(params, keepOrigVector);
    }

    copy(other, keepOrigVector) {
        this.pid = other.pid;
        this.type = other.type;
        if (keepOrigVector) {
            this.axis = other.axis;
        } else {
            this.axis = this.axis || new THREE.Vector3();
            this.axis.copy(Object3DUtil.toVector3(other.axis));
            this.axis.normalize();
        }
        if (other.origin) {
            if (keepOrigVector) {
                this.origin = other.origin;
            } else {
                this.origin = this.origin || new THREE.Vector3();
                this.origin.copy(Object3DUtil.toVector3(other.origin));
            }
        }
        if (other.ref) {
            if (keepOrigVector) {
                this.ref = other.ref;
            } else {
                this.ref = this.ref || new THREE.Vector3();
                this.ref.copy(Object3DUtil.toVector3(other.ref));
                if (!this.isTranslation) {
                    this.ref.normalize();  // Make sure normalized
                }
            }
        }
        this.rangeMin = other.rangeMin;
        this.rangeMax = other.rangeMax;
        this.base = other.base? other.base.slice() : [];
        this.defaultValue = other.defaultValue || 0;
        if (other.value != null) {
            this.value = other.value;
        }
    }

    clone() {
        return new Articulation(this);
    }

    get rangeAmount() {
        return (this.rangeMax != null && this.rangeMin != null)? this.rangeMax - this.rangeMin : null;
    }

    getCappedDelta(amount, currentValue) {
        if (amount > 0) {
            if (this.rangeMax != null) {
                if (currentValue + amount > this.rangeMax) {
                    return Math.max(this.rangeMax - currentValue, 0);
                }
            }
        } else if (amount < 0) {
            if (this.rangeMin != null) {
                if (currentValue + amount < this.rangeMin) {
                    return Math.min(this.rangeMin - currentValue, 0);
                }
            }
        }
        return amount;
    }

    getCappedValue(value) {
        if (this.rangeMin != undefined && this.rangeMin > value) {
            return this.rangeMin;
        } else if (this.rangeMax != undefined && this.rangeMax < value) {
            return this.rangeMax;
        } else {
            return value;
        }
    }

    get isTranslation() {
        return this.type && this.type.toLowerCase() === Articulation.Type.TRANSLATION.toLowerCase();
    }

    applyMatrix(mat) {
        this.applyMatrix4(mat);
    }

    applyMatrix4(mat) {
        this.axis.transformDirection(mat);
        if (this.origin) {
            this.origin.applyMatrix4(mat);
        }
        return this;
    }

    /**
     * Transform a mesh object by some amount according to this articulation
     */
    applyToObject3D(object3D, amount) {
        if (this.isTranslation) {
            object3D.translateOnAxis(this.axis, amount);
        } else {
            object3D.applyMatrix4(rotationAxisOrigin(this.axis, this.origin, amount));
        }
    }

    /**
     * Returns a hash string of this articulation
     */
    getHashString() {
        const precision = 5;
        const orig = this.origin.toArray().map( a => a.toFixed(precision));
        const axis = this.axis.toArray().map( a => a.toFixed(precision));
        const range = [this.rangeMin, this.rangeMax].map( a => a.toFixed(precision));
        const baseIds = this.base.sort();
        const defaultValue = this.defaultValue.toFixed(precision);
        const ref = (this.ref != null)? this.ref.toArray().map( a => a.toFixed(precision)) : null;

        let hashString = "pid="+this.pid+"&base="+JSON.stringify(baseIds)
            +"&type="+this.type+"&origin="+JSON.stringify(orig)
            +"&axis="+JSON.stringify(axis)+"&range="+JSON.stringify(range)
            +"&defaultValue="+JSON.stringify(defaultValue);
        if (ref != null) {
            hashString = hashString + "&ref=" + JSON.stringify(ref);
        }
        return hashString;
    }

    /**
     * Create a long, thin box mesh illustrating the axis of this articulation
     */
    toMesh(length=1.5 , width=0.05) {
        const longAxis = this.axis;
        const randVec = new THREE.Vector3(Math.random(), Math.random(), Math.random());
        const shortAxis1 = new THREE.Vector3().crossVectors(longAxis, randVec);
        const shortAxis2 = new THREE.Vector3().crossVectors(longAxis, shortAxis1);
        longAxis.normalize();
        shortAxis1.normalize();
        shortAxis2.normalize();
        const obb = new OBB().fromJSON({
            centroid: this.origin.toArray(),
            axesLengths: [length, width, width],
            normalizedAxes: longAxis.toArray().concat(shortAxis1.toArray()).concat(shortAxis2.toArray())
        });
        return obb.toMesh();
    }

    toJson() {
        return {
            pid: this.pid,      // partId
            type: this.type,
            axis: this.axis? this.axis.toArray() : undefined,
            origin: this.origin? this.origin.toArray() : undefined,
            rangeMin: this.rangeMin,
            rangeMax: this.rangeMax,
            base: this.base,    // baseIds
            defaultValue: this.defaultValue
        };
    }

}

Articulation.Type = Object.freeze({
	ROTATION: 'rotation',
	HINGE_ROTATION: 'hinge_rotation',
	TRANSLATION: 'translation',
});

module.exports = Articulation;