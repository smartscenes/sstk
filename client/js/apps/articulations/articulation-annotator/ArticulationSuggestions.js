const Articulation = require('articulations/Articulation');
const Distances = require('geo/Distances');
const _ = require('util/util');

const ArticulationTypes = Articulation.Type;

const OriginOptions = [
  new THREE.Vector3(0.5, 0.5, 0.5),  // 0 - center
  new THREE.Vector3(0.5, 0.5, 1),    // 1 - face
  new THREE.Vector3(0.5, 0.5, 0),    // 2 - face
  new THREE.Vector3(0.5, 1, 0.5),    // 3 - face
  new THREE.Vector3(0.5, 0, 0.5),    // 4 - face
  new THREE.Vector3(1, 0.5, 0.5),    // 5 - face
  new THREE.Vector3(0, 0.5, 0.5),    // 6 - face
  new THREE.Vector3(0.5, 1, 1),      // 7 - edge
  new THREE.Vector3(0.5, 1, 0),      // 8 - edge
  new THREE.Vector3(0.5, 0, 1),      // 9 - edge
  new THREE.Vector3(0.5, 0, 0),      // 10 - edge
  new THREE.Vector3(1, 0.5, 1),      // 11 - edge
  new THREE.Vector3(1, 0.5, 0),      // 12 - edge
  new THREE.Vector3(1, 1, 0.5),      // 13 - edge
  new THREE.Vector3(1, 0, 0.5),      // 14 - edge
  new THREE.Vector3(0, 0.5, 1),      // 15 - edge
  new THREE.Vector3(0, 0.5, 0),      // 16 - edge
  new THREE.Vector3(0, 1, 0.5),      // 17 - edge
  new THREE.Vector3(0, 0, 0.5)       // 18 - edge
];

const FaceOriginIndices = _.range(1,7);
const EdgeOriginIndices = _.range(7,19);

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
for (let i = 0; i < OrderedSignedDirs.length; i++) {
  OrderedSignedDirs[i].order = i;
}

/**
 * Information about connected parts.
 * @class ConnectedInfo
 * @param {OBB} baseOBB
 * @param {Part[]} baseParts
 * @param {Part[]} attachedParts
 */

function getHandles(parts) {
  return parts.filter(part => {
    const partLabel = part.label.toLowerCase();
    if (partLabel === 'handle' || partLabel === 'knob') {
      return true;
    }
  });
}

function getOriginOppositeFromHandle(part, originIndices, connected, filterCandidates) {
  const handles = getHandles(connected.attachedParts);
  const candidates = part.state.articulationOptions.originOptions;
  const candidateInfos = [];
  for (let i of originIndices) {
    const candidate = candidates[i];
    const candidateInfo = { origin: candidate, index: i, localOrigin: OriginOptions[i] };
    if (filterCandidates) {
      if (!filterCandidates(candidateInfo)) {
        continue;
      }
    }
    if (connected.baseParts.length) {
      candidateInfo.distToBase = Distances.computeDistance(candidate, connected.baseParts.map(p => p.object3D));
      if (candidateInfo.distToBase) {
        candidateInfo.distToBase = candidateInfo.distToBase.distanceSq;
      }
    }
    if (handles.length) {
      candidateInfo.distToHandle = Distances.computeDistance(candidate, handles[0].obb.getCenter());
      if (candidateInfo.distToHandle) {
        candidateInfo.distToHandle = candidateInfo.distToHandle.distanceSq;
      }
    }
    candidateInfos.push(candidateInfo);
  }
  // Take origin that is far from handle, close to base
  let best = null;
  for (let candidateInfo of candidateInfos) {
    if (best) {
      const distToBaseDelta = candidateInfo.distToBase - best.distToBase;
      if (Math.abs(distToBaseDelta) > 0.01) {
        if (distToBaseDelta < 0) {
          best = candidateInfo;
        }
      } else {
        const distToHandleDelta = candidateInfo.distToHandle - best.distToHandle;
        if (distToHandleDelta > 0) {
          best = candidateInfo;
        }
      }
    } else {
      best = candidateInfo;
    }
  }
  console.log('candidates', candidateInfos, 'selected', best);
  return best;
}
function selectVerticalHingeAxis(part, connected) {
  const selectedOrigin = getOriginOppositeFromHandle(part, EdgeOriginIndices, connected,
    (candidateInfo) => {
      return Math.abs(candidateInfo.localOrigin.y - 0.5) < 0.001;
    });
  const res = { axis: SignedDirs.Up};
  res.origin = selectedOrigin;
  return res;
}


function selectBackHingeAxis(part, connected) {
  const selectedOrigin = getOriginOppositeFromHandle(part, EdgeOriginIndices, connected,
    (candidateInfo) => {
      return Math.abs(candidateInfo.localOrigin.z - 1) < 0.001;
    });
  const res = { axis: SignedDirs.Left};
  res.origin = selectedOrigin;
  return res;
}

function selectPartHorizontalAxis(part, connected) {
  // return part axis that is the aligned to the part (e.g. not the normal), but not the upward axis
  const obb = part.obb;
  const smallestIndex = obb.getSmallestIndex();
  const res = { axis: SignedDirs.Left};
  // assume y is the up direction
  if (smallestIndex === 0) {
    res.axis = SignedDirs.Front;
  }
  return res;
}

const SelectionStrategies = {
  selectVerticalHingeAxis: selectVerticalHingeAxis,
  selectBackHingeAxis: selectBackHingeAxis,
  selectPartHorizontalAxis: selectPartHorizontalAxis
};

const AxisSuggestionRules = [
  { partLabel: 'door', articulationType: ArticulationTypes.ROTATION, axisSelection: SelectionStrategies.selectVerticalHingeAxis },
  { partLabel: 'door', articulationType: ArticulationTypes.TRANSLATION, axisSelection: SelectionStrategies.selectPartHorizontalAxis },
  { partLabel: "drawer", articulationType: ArticulationTypes.TRANSLATION, axisSelection: { axis: SignedDirs.Front } },
  { partLabel: "lid", articulationType: ArticulationTypes.ROTATION, axisSelection: SelectionStrategies.selectBackHingeAxis }
];

const AxisSuggestionRulesByPartLabel = _.groupBy(AxisSuggestionRules, 'partLabel');

class ArticulationSuggester {
  constructor() {
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

    const originOptions = OriginOptions.map( point => point.clone());

    // This is to get the orientation of the obb so that the origin is selected correctly
    originOptions.forEach(opt => {
      obb.getWorldPosition(opt, opt);
    });

    edgeOptions.forEach(opt => {
      opt.applyQuaternion(obb.getRotationQuaternion());
    });

    return { axisOptions: axisOptions, pivotAxisOptions: pivotAxisOptions, originOptions: originOptions, edgeOptions: edgeOptions };
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

  getAxisSuggestionRules(part, articulationType = null, connected = null) {
    const partLabel = part.label.toLowerCase();
    let matchingRules = AxisSuggestionRulesByPartLabel[partLabel];
    if (matchingRules) {
      if (articulationType != null) {
        matchingRules = matchingRules.filter(rule => rule.articulationType === articulationType);
      }
      return matchingRules;
    }
  }

  getAxisSuggestionRule(part, articulationType = null, connected = null) {
    const rules = this.getAxisSuggestionRules(part, articulationType, connected);
    if (rules && rules.length) {
      return rules[0];
    }
  }

  getArticulationType(part) {
    const rule = this.getAxisSuggestionRule(part);
    if (rule) {
      return rule.articulationType;
    }
  }

  // Suggests most likely axis given OBB of part and articulationType
  suggestAxis(part, articulationType, connected = null) {
    const rule = this.getAxisSuggestionRule(part, articulationType);
    const suggestion = {
      axisIndex: null,                       // from OrderedSignedDirs
      originIndex: null                     // from OriginOptions
    };
    console.log('selected suggestion rule', rule);
    if (rule && rule.axisSelection) {
      const ruleSuggestion = (_.isFunction(rule.axisSelection))?
        rule.axisSelection(part, connected) : rule.axisSelection;
      console.log('suggested', ruleSuggestion);
      if (ruleSuggestion.axis) {
        suggestion.axisIndex = ruleSuggestion.axis.order; // take index from axis selection object
      }
      if (ruleSuggestion.origin) {
        suggestion.originIndex = ruleSuggestion.origin.index; // take index from axis selection object
      }
    }
    // default suggestions if not processed
    if (suggestion.axisIndex == null) {
      if (articulationType === ArticulationTypes.TRANSLATION) {
        suggestion.axisIndex = SignedDirs.Front.order; // always suggest front
      } else {
        suggestion.axisIndex = SignedDirs.Up.order; // always suggest up
      }
    }
    if (suggestion.originIndex == null) {
      suggestion.originIndex = 0;  // center
    }
    return suggestion;
  }

}

module.exports = {
  OriginOptions: OriginOptions,
  Dirs: Dirs,
  OrderedDirs: OrderedDirs,
  SignedDirs: SignedDirs,
  OrderedSignedDirs: OrderedSignedDirs,
  // SelectionStrategies: SelectionStrategies,
  // SuggestionRules: SuggestionRules,
  ArticulationSuggester: ArticulationSuggester
};
