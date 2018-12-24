
// TODO: Move goal logic into this file

/**
 * Specifies what the goal should be
 * @typedef GoalSpec
 * @type {sim.PositionGoalSpec|sim.ObjectGoalSpec|sim.RoomGoalSpec}
 * @property {string} type - What type of goal (`position`, `object`, `room`)?
 * @property {string} select - How to select one goal if there are multiple (`random`, `closest` to agent)?
 * @memberOf sim
 */

/**
 * Specifies what the goal based on position should be
 * @typedef PositionGoalSpec
 * @memberOf sim
 * @type {object}
 * @property {vec3|string} position - Use `random` to select a random position
 * @property {number} [radius] - Radius about position that is acceptable
 */

/**
 * Specifies what the goal based on object should be
 * @typedef ObjectGoalSpec
 * @memberOf sim
 * @type {object}
 * @property {string[]} [objectIds] Specific set of objectIds
 * @property {string[]} [modelIds] Model ids
 * @property {string[]} [categories] Object categories
 */

/**
 * Specifies what the goal based on room should be
 * @typedef RoomGoalSpec
 * @memberOf sim
 * @type {object}
 * @property {string[]} [roomIds] Specific set of room ids
 * @property {string[]} [roomTypes] Room types
 */

/**
 * Goal that the agent can navigate to
 * @typedef Goal
 * @type {sim.PositionGoal|sim.ObjectGoal|sim.RoomGoal}
 * @property {string} type - What type of goal (`position`, `object`, `room`)?
 * @property {THREE.Vector3} initialOffsetFromAgent - Offset of goal from initial position of agent
 * @memberOf sim
 */

/**
 * Specifies what the goal based on position should be
 * @typedef PositionGoal
 * @memberOf sim
 * @type {object}
 * @property {THREE.Vector3} position
 * @property {string[]} room Id indicating the room the goal is in
 * @property {string[]} roomType Array of room types
 */

/**
 * Specifies what the goal based on object should be
 * @typedef ObjectGoal
 * @memberOf sim
 * @type {object}
 * @property {THREE.Vector3} position Centroid of object (not traversable)
 * @property {string} objectId Id indicating the unique object tha is the goal
 * @property {string[]} objectType Array of object categories
 * @property {string[]} room Id indicating the room the goal is in
 * @property {string[]} roomType Array of room types
 * @property {model.ModelInstance} [modelInstance] Model instance
 * @property {string} [audioFile] Name of audio associated with the object
 */

/**
 * Specifies what the goal based on room should be
 * @typedef RoomGoal
 * @memberOf sim
 * @type {object}
 * @property {THREE.Vector3} position in room (not necessarily traversable)
 * @property {string[]} room Id indicating the room the goal is in
 * @property {string[]} roomType Array of room types
 */