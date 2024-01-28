const Articulation = require('articulations/Articulation');
const ArticulationState = require('articulations/ArticulationState');
const GeometryUtil = require('geo/GeometryUtil');
const Object3DUtil = require('geo/Object3DUtil');
const OBBFitter = require('geo/OBBFitter');
const Part = require('parts/Part');
const PartConnectivityGraph = require('parts/PartConnectivityGraph');
const _ = require('util/util');

// TODO: Have ArticulatedObject be made up of ArticulatedPart

/**
 * Articulated Object
 * @memberOf articulations
 */
class ArticulatedObject extends THREE.Object3D {
    constructor(articulations, connectivity, partHierarchy, parts) {
        super();
        this.type = 'ArticulatedObject';
        this.isArticulated = true;     // Indicates that this object is articulated
        // TODO: Support more memory efficient remeshing of objects
        if (partHierarchy) {
            this.fromPartHierarchy(partHierarchy);
        } else if (connectivity) {
            this.fromConnectivityGraph(articulations, connectivity);
        } else if (parts) {
            this.fromParts(articulations, parts);
        } else if (arguments.length) {
            console.error("Cannot create ArticulatedObject", [...arguments]);
        }
        this.articulationStates = _.map(this.articulations, art => {
            const part = this.parts[art.pid];
            const artNode = this.articulatableNodes[art.pid];
            return new ArticulationState(part, art, artNode);
        });
    }

    fromParts(articulations, parts) {
        const connections = [];
        for (let art of articulations) {
            connections[art.pid] = connections[art.pid] || [];
            connections[art.pid].push(...art.base);
            for (let bpid of art.base) {
                connections[bpid] = connections[bpid] || [];
                connections[bpid].push(art.pid);
            }
        }
        //console.log(connections, articulations);
        const connectivity = new PartConnectivityGraph(connections, parts);
        return this.fromConnectivityGraph(articulations, connectivity);
    }

    fromConnectivityGraph(articulations, connectivity) {
        articulations = articulations || [];
        this.articulations = _.map(articulations, art => new Articulation(art));
        this.connectivityGraph = connectivity;
        this.articulatableNodes = [];  // Array of articulatable nodes (indexed by pid so there will be holes)
        // console.log('groupParts');
        this.__groupParts();
    }

    fromPartHierarchy(partHierarchy) {
        this.partHierarchy = partHierarchy;
        this.connectivityGraph = PartConnectivityGraph.fromPartHierarchy(partHierarchy);
        this.articulatableNodes = [];  // Array of articulatable nodes (indexed by pid so there will be holes)
        this.articulations = [];
        for (let part of this.connectivityGraph.parts) {
            const userData = part.object3D.userData;
            userData.type = 'Part';
            userData.partId = part.pid;
            if (part.articulation) {
                userData.isArticulated = true;
                userData.articulatablePartId = part.pid;
                userData.isArticulatedNode = true;
                this.articulatableNodes[part.pid] = part.object3D;
                const arts = _.isArray(part.articulation) ? part.articulation : [part.articulation];
                for (let art of arts) {
                    this.articulations.push(
                      new Articulation({
                          pid: part.pid,
                          type: art.type,
                          axis: art.axis,
                          origin: art.origin,
                          rangeMin: art.rangeMin,
                          rangeMax: art.rangeMax,
                          base: part.parent ? [part.parent.pid] : []
                      })
                    );
                }
            } else {
                userData.isStatic = true;
            }
        }
        this.add(partHierarchy.root.object3D);
    }

    copy(other, recursive) {
        if (other.partHierarchy) {
            // TODO: what about other children that may have been attached?
            this.fromPartHierarchy(other.partHierarchy.clone());
        } else {
            super.copy(other, recursive);
            this.articulations = other.articulations.map(x => x.clone());
            const nodes = Object3DUtil.findNodes(this, (node) => node.userData.pid != null);
            const idToObj = _.keyBy(nodes, (node) => node.userData.pid);
            this.connectivityGraph = other.connectivityGraph.withPartObject3Ds(idToObj, true);
            this.articulatableNodes = other.articulatableNodes.map(n => this.__findArticulatableNode(n.userData.partId));
        }
        this.articulationStates = _.map(this.articulations, art => {
            const part = this.parts[art.pid];
            const artNode = this.articulatableNodes[art.pid];
            return new ArticulationState(part, art, artNode);
        });
        return this;
    }

    clone(recursive) {
        return new this.constructor().copy(this, recursive);
    }

    getNumArticulations() {
        return this.articulations.length;
    }

    getArticulation(artIndex) {
        return this.articulations[artIndex];
    }

    getArticulationState(artIndex) {
        return this.articulationStates[artIndex];
    }

    setArticulationMotionStateValues(stateValues) {
        for (let sv of stateValues) {
            this.articulationStates[sv.artIndex].articulation.setMotionStateValue(sv.name, sv.value);
        }
    }

    findArticulationIndex(filter) {
        return _.findIndex(this.articulations, filter);
    }

    findArticulationIndices(filter) {
        const indices = [];
        for (let i = 0; i < this.articulations.length; i++) {
            if (filter(this.articulations[i])) {
                indices.push(i);
            }
        }
        return indices;
    }

    findParts(filter) {
        return this.connectivityGraph.parts.filter(p => p && filter(p));
    }

    get parts() {
        return this.connectivityGraph.parts;
    }

    applyArticulation(artIndex, delta) {
        const articulationState = this.articulationStates[artIndex];
        if (articulationState.articulatedNode) {
            return articulationState.apply(delta);
        } else {
            console.warn('No articulatable node', articulationState.articulation.pid);
            return 0;
        }
    }

    toArticulatedPartsJson() {
        // Combined structure with articulations and parts information
        const json = this.connectivityGraph.toJson();
        json.version = "articulated-parts@0.0.1";
        json.metadata = {connectivity: json.metadata};
        json.articulations = this.articulations.map(art => art ? art.toJson() : undefined);
        for (let part of json.parts) {
            if (part) {
                let articulationIds = this.findArticulationIndices(art => art.pid === part.pid);
                if (articulationIds.length) {
                    part.articulationIds = articulationIds;
                }
            }
        }
        return json;
    }

    toCondensed() {
        // Takes existing object3D and merge some nodes
        const origParts = this.connectivityGraph.parts;
        const staticNode = Object3DUtil.findNode(this, n => n.name === 'Static');
        const newParts = [null]; // Unknown part
        const partIdRemap = [];
        let pid = 1;
        let staticPartId = undefined;
        // Take children and merge them
        if (staticNode) {
            const mergedNode = GeometryUtil.mergeMeshes(staticNode);
            const obb = OBBFitter.fitMeshOBB(mergedNode, {constrainedVertical: true});
            staticPartId = pid;
            mergedNode.name = 'Part' + pid;
            mergedNode.userData.type = 'Part';
            mergedNode.userData.isStatic = true;
            mergedNode.userData.partId = pid;
            const newPart = new Part(pid, 'static', 'static', obb, mergedNode);
            const origPartNodes = Object3DUtil.findNodes(staticNode, n => n.userData.partId != null);
            newPart.sourceParts = origPartNodes.map(n => origParts[n.userData.partId]);
            newParts.push(newPart);
            pid++;
        }
        const origArticulatableNodes = this.articulatableNodes.filter(n => n);
        for (let i = 0; i < origArticulatableNodes.length; i++) {
            const node = origArticulatableNodes[i].clone();
            const origPart = origParts[node.userData.partId];
            partIdRemap[node.userData.partId] = pid;
            let newPart;
            if (node instanceof THREE.Mesh) {
                // Okay
                const obb = origPart.obb ? origPart.obb.clone() : OBBFitter.fitMeshOBB(node, {constrainedVertical: true});
                newPart = new Part(pid, origPart.label, origPart.name, obb, node);
                newPart.sourceParts = [origParts[node.userData.partId]];
            } else {
                const linkedNodes = node.children.filter(n => n.userData.articulatablePartId === node.userData.partId);
                const mergedNode = GeometryUtil.mergeMeshes(linkedNodes);
                const obb = OBBFitter.fitMeshOBB(mergedNode, {constrainedVertical: true});
                mergedNode.name = 'Part' + pid;
                mergedNode.userData.type = 'Part';
                mergedNode.userData.isArticulated = true;
                mergedNode.userData.partId = pid;
                mergedNode.userData.articulatablePartId = pid;
                for (let j = 0; j < linkedNodes.length; j++) {
                    node.remove(linkedNodes[j]);
                }
                node.add(mergedNode);
                newPart = new Part(pid, origPart.label, origPart.name, obb, mergedNode);
                newPart.sourceParts = linkedNodes.map(n => origParts[n.userData.partId]);
            }
            newParts.push(newPart);
            node.userData.partId = pid;
            node.userData.articulatablePartId = pid;
            pid++;
        }

        const connectivity = [];
        for (let i = 0; i < newParts.length; i++) {
            connectivity[i] = [];
        }
        const articulations = this.articulations.map(x => {
            const origPart = origParts[x.pid];
            const c = x.clone();
            c.pid = partIdRemap[x.pid];
            c.base = (origPart.parentId != undefined) ? [partIdRemap[origPart.parentId]] :
              (staticPartId != undefined) ? [staticPartId] : [];
            connectivity[c.pid] = connectivity[c.pid] || [];
            for (let baseId of c.base) {
                //connectivity[baseId] = connectivity[baseId] || [];
                connectivity[c.pid].push(baseId);
                connectivity[baseId].push(c.pid);
            }
            return c;
        });
        const cgmeta = this.connectivityGraph.metadata ? _.clone(this.connectivityGraph.metadata) : undefined;
        if (cgmeta) {
            cgmeta.condensed = true;
        }
        const cg = new PartConnectivityGraph(connectivity, newParts, cgmeta);
        return new ArticulatedObject(articulations, cg);
    }

    __findArticulatableNode(pid) {
        return Object3DUtil.findNode(this, n => n.userData.partId === pid && n.userData.isArticulatedNode);
    }

    __groupParts() {
        const parts = this.connectivityGraph.parts;
        const pids = this.__identifyArticulatablePids();
        const articulatablePids = pids.articulatablePids;
        const staticPids = pids.staticPids;
        const filteredStaticPids = _.filter(staticPids,
          pid => parts[pid] && parts[pid].object3D && parts[pid].parentId == null);

        if (filteredStaticPids.length > 0) {
            const staticNode = new THREE.Group();
            staticNode.name = 'Static';
            staticNode.userData.id = staticNode.name;
            this.add(staticNode);
            for (let pid of filteredStaticPids) {
                const part = parts[pid];
                part.object3D.userData.isStatic = true;
                Object3DUtil.attachToParent(part.object3D, staticNode);
            }
        }

        if (articulatablePids.length > 0) {
            const articulatableNode = this; // Have articulated nodes attach directly to this
            //const articulatableNode = new THREE.Group();
            //articulatableNode.name = 'Articulatable';
            //this.add(articulatableNode);
            for (let pid of articulatablePids) {
                const part = parts[pid];
                let partNode = part.object3D;
                partNode.userData.isArticulated = true;  // Indicate that this part is articulated
                if (part.childIds && part.childIds.length > 0) {
                    const childrenNode = new THREE.Group();
                    childrenNode.name = 'composite_part' + part.pid + ":" + part.name;
                    childrenNode.userData.id = childrenNode.name;
                    Object3DUtil.attachToParent(part.object3D, childrenNode);
                    for (let cid of part.childIds) {
                        Object3DUtil.attachToParent(parts[cid].object3D, childrenNode);
                        if (articulatablePids.indexOf(cid) < 0) {
                            parts[cid].object3D.userData.articulatablePartId = part.pid;
                        }
                    }
                    partNode = childrenNode;
                }
                part.object3D.userData.articulatablePartId = part.pid;
                partNode.userData.isArticulatedNode = true;  // Indicate that this node is a main articulation node (may have children)
                partNode.userData.partId = part.pid;
                if (part.parentId == null) {
                    Object3DUtil.attachToParent(partNode, articulatableNode);
                } else {
                    Object3DUtil.attachToParent(partNode, this.articulatableNodes[part.parentId]);
                }
                this.articulatableNodes[pid] = partNode;
            }
        }
    }

    populateArticulationUserData() {
        for (let artState of this.articulationStates) {
            artState.articulatedNode.userData.articulation = artState.toJson();
        }
    }

    __identifyArticulatablePids() {
        // Takes articulations and create a appropriate hierarchy from the parts and add them to this
        // Assumes that each part has a mesh representing that part

        // Figure out the hierarchy
        const parts = this.connectivityGraph.parts;
        const articulationsByPartId = _.groupBy(this.articulations, 'pid');
        const articulatablePids = _.keys(articulationsByPartId).map(x => parseInt(x));
        const otherPids = _.range(0, parts.length).filter(pid => parts[pid]);
        const remainingPids = new Set(otherPids);
        // console.log('remaining', remainingPids, articulationsByPartId);
        _.each(articulationsByPartId, (arts, pid) => {
            pid = parseInt(pid);
            const part = parts[pid];
            if (arts.length > 1) {
                console.log(`Multiple articulations for part ${pid} (${part.name}): ${arts.length}`);
            }
            // Let's just handle one articulation
            const basePids = new Set(_.uniq(_.flatMap(arts, 'base')));
            const stopPids = new Set([...basePids, ...articulatablePids]);
            stopPids.add(pid);
            const childPids = this.connectivityGraph.getConnectedPartIdsDeep([pid],
              id => stopPids.has(id), id => !basePids.has(id));
            part.baseIds = [...basePids];
            part.childIds = [...childPids].filter(cid => cid != pid);  // sometimes the cid / pid are ints/strings...
            for (let cid of part.childIds) {
                if (parts[cid].parentId != null) {
                    console.log(`Part ${cid} already parented to ${parts[cid].parentId}`);
                }
                parts[cid].parentId = pid;
                remainingPids.delete(cid)
            }
            remainingPids.delete(pid);
        });
        // console.log('static pids', remainingPids, 'articulated pids', articulatablePids);
        // console.log(this.connectivityGraph.parts);
        // Make sure articulatablePids are in order (parent, then descendants)
        const rootArticulatablePids = articulatablePids.filter(pid => parts[pid].parentId == null);
        //console.log(articulatablePids, rootArticulatablePids);
        const sortedArticulatablePids = [];
        const todo = rootArticulatablePids.slice();
        const done = new Set();
        while (todo.length > 0) {
            let pid = todo.shift();
            if (articulatablePids.indexOf(pid) >= 0) {
                sortedArticulatablePids.push(pid);
            }
            done.add(pid);
            if (parts[pid].childIds) {
                for (let cid of parts[pid].childIds) {
                    if (!done.has(cid)) {
                        todo.push(cid);
                    }
                }
            }
        }
        //console.log(sortedArticulatablePids);
        return {
            rootArticulatablePids: rootArticulatablePids,
            articulatablePids: sortedArticulatablePids,
            staticPids: [...remainingPids]
        };
    }

    static toArticulated(object3D) {
        if (object3D instanceof ArticulatedObject) {
            return object3D;
        } else if (object3D && object3D.userData.articulations && object3D.userData.partsConnectivity) {
            let partsConnectivity = PartConnectivityGraph.fromJson(object3D.userData.partsConnectivity);
            const nodes = Object3DUtil.findNodes(object3D, (node) => node.userData.pid != null);
            const idToObj = _.keyBy(nodes, (node) => node.userData.pid);
            partsConnectivity = partsConnectivity.withPartObject3Ds(idToObj, true);
            let articulations = object3D.userData.articulations;
            if (!Array.isArray(articulations)) {
                articulations = [articulations];
            }
            const articulatedObject3D = new ArticulatedObject(articulations, partsConnectivity);
            articulatedObject3D.name = object3D.name;
            return articulatedObject3D;
        }
    }

    static toArticulatedHierarchical(object3D) {
        const articulatedObject = ArticulatedObject.toArticulated(object3D);
        if (articulatedObject) {
            return articulatedObject;
        } else {
            const uuidToArticulatedObject = {};
            Object3DUtil.traverse(object3D,
              (node) => {
                  const articulated = ArticulatedObject.toArticulated(node);
                  uuidToArticulatedObject[node.uuid] = articulated;
                  return articulated == null;
              }, (node) => {
                  const converted = _.map(node.children, (child) => {
                      return uuidToArticulatedObject[child.uuid] || child;
                  });
                  Object3DUtil.removeAllChildren(node);
                  for (let i = 0; i < converted.length; i++) {
                      node.add(converted[i]);
                  }
              });
        }
        return object3D;
    }

    static populateArticulationUserData(object3D) {
        Object3DUtil.traverse(object3D,
          (node) => {
              if (node instanceof ArticulatedObject) {
                  node.populateArticulationUserData();
              }
              return true;
          });
    }

    static createArticulatedScene(name, inputConnectivityGraph, pidToArticulations, ignorePartLabels = []) {
        const scene = new THREE.Scene();
        scene.name = name;
        // console.log('metadata', this.currentConnectivityGraph.metadata);
        const validParts = inputConnectivityGraph.parts.filter(p => ignorePartLabels.indexOf(p.label) < 0);
        const partsByObjectInstId = _.groupBy(validParts, 'objectInstId');
        _.forEach(partsByObjectInstId, (parts, objectInstId) => {
            // console.log('parts', parts, objectInstId);
            // console.log('got object', objectInstId, 'with ', parts.length, 'parts');
            const pids = parts.map(p => p.pid);
            const extracted = inputConnectivityGraph.extractConnectivity(pids);
            const connectivityGraph = extracted.connectivity;
            const remapped = extracted.remapped;
            const extractedArticulations = [];
            pids.forEach(pid => {
                const anns = pidToArticulations(pid);
                if (anns) {
                    //console.log('got ' + anns.length + ' articulations for part ' + pid);
                    for (let ann of anns) {
                        const copy = Object.assign({}, ann);
                        copy.pid = remapped[copy.pid];
                        copy.base = copy.base.map(bpid => remapped[bpid])
                        extractedArticulations.push(copy)
                    }
                }
            });
            let object;
            if (extractedArticulations.length) {
                object = new ArticulatedObject(extractedArticulations, connectivityGraph);
                object.userData.partsConnectivity = connectivityGraph.toJson();
                object.userData.articulations = extractedArticulations;
            } else {
                object = new THREE.Object3D();
                for (let part of connectivityGraph.parts) {
                    object.add(part.object3D);
                }
            }
            if (objectInstId !== 'undefined') {
                object.name = objectInstId;
            } else {
                object.name = 'unnamed'
            }
            scene.add(object);
        });
        return scene;
    }
}

module.exports = ArticulatedObject;