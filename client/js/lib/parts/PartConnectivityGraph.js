const Part = require('parts/Part');
const _ = require('util/util');

class PartConnectivityGraph {
    /**
     * Defines a connectivity graph between parts
     * @param connections {int[][]}
     * @param parts {Part[]}
     */
    constructor(connections, parts, metadata) {
        this.connections = connections? connections.map(c => new Set(c)) : [];
        this.parts = parts;
        this.metadata = metadata;
    }

    isConnected(pid1, pid2) {
        return this.connections[pid1] && this.connections[pid1].has(pid2);
    }

    remove(pid1, pid2, bidir=false) {
        if (this.connections[pid1] && this.connections[pid1].has(pid2)) {
            console.log(`Removing ${pid1} and ${pid2}`);
            this.connections[pid1].delete(pid2);
        }
        if (bidir && this.connections[pid2] && this.connections[pid2].has(pid1)) {
            console.log(`Removing ${pid2} and ${pid1}`);
            this.connections[pid2].delete(pid1);
        }
    }

    add(pid1, pid2, bidir=false) {
        this.connections[pid1] = this.connections[pid1] || new Set();
        this.connections[pid1].add(pid2);
        if (bidir) {
            this.connections[pid2] = this.connections[pid2] || new Set();
            this.connections[pid2].add(pid1);
        }
    }

    discardPartHierarchy() {
        this.parts.forEach( p => {
            p.object3D.children = p.object3D.children.filter(c => c.userData.pid == null);
            p.object3D.parent = null;
            delete p.baseIds;
            delete p.childIds;
            delete p.parentId;
            delete p.object3D.userData.isStatic;
            delete p.object3D.userData.isArticulated;
            delete p.object3D.userData.articulatablePartId;
            delete p.object3D.userData.isArticulatedNode;
        });
    }

    getConnectedPartIds(pid) {
        if (this.connections[pid]) {
            return [...this.connections[pid]];
        } else return [];
    }

    getConnectedParts(part) {
        return this.getConnectedPartIds(part.pid).map(pid => this.parts[pid]);
    }

    /**
     * Get part ids that are connected by traversing connectivity graph
     * Note that the partIds are included in the returned set of parts
     * @param partIds
     * @param [stopFn] {function(id): boolean} Whether to stop when the node is reached
     * @param [includeFn] {function(id): boolean} If specified, for a node that we decide not to traverse further,
     *                                          whether to include it in the connected set
     * @returns {Set<int>}
     */
    getConnectedPartIdsDeep(partIds, stopFn, includeFn) {
        if (!Array.isArray(partIds)) {
            partIds = [partIds];
        }
        const todo = partIds.slice();
        const connected = new Set();
        while (todo.length > 0) {
            let pid = todo.pop();
            connected.add(pid);
            let connectedIds = this.getConnectedPartIds(pid);
            for (let cid of connectedIds) {
                if (!stopFn || !stopFn(cid)) {
                    if (!connected.has(cid)) {
                        todo.push(cid);
                    }
                } else if (includeFn) {
                    if (includeFn(cid)) {
                        connected.add(cid);
                    }
                }
            }
        }
        return connected;
    }

    cutExtraConnections(articulations) {
        // Extract hierarchy from articulations
        for (let articulation of articulations) {
            // based on base/articulation extra connections
            let pid = articulation.pid;
            let basePartIds = articulation.base;
            let connectedBasePartIds = this.getConnectedPartIdsDeep(basePartIds, cid => pid === cid);
            let connectedChildPartIds = this.getConnectedPartIdsDeep(pid, cid => connectedBasePartIds.has(cid));
            for (let cid of connectedChildPartIds) {
                for (let bid of connectedBasePartIds) {
                    if (basePartIds.indexOf(bid) < 0) {
                        this.remove(cid, bid, true);
                    }
                }
            }
        }
    }

    __getArticulationPartDists(articulations) {
        const articulationPartDists = [];
        for (let articulation of articulations) {
            const pid = articulation.pid;
            const distanceFromArticulatedPart = [];
            distanceFromArticulatedPart[pid] = 0;

            // Follow base and their connected parts
            const basePartIds = articulation.base;
            const todo = [];
            for (let bid of basePartIds) {
                distanceFromArticulatedPart[bid] = -1;
                if (todo.indexOf(bid) < 0) {
                    todo.push(bid);
                }
            }

            while (todo.length > 0) {
                const tid = todo.pop();
                const dt = distanceFromArticulatedPart[tid];
                const nids = this.getConnectedPartIds(tid);
                const dn = dt - 1;
                for (let nid of nids) {
                    const d = distanceFromArticulatedPart[nid];
                    if (d == null || dn > d) {
                        distanceFromArticulatedPart[nid] = dn;
                        todo.push(nid);
                    }
                }
            }

            // Follow child and their connected parts
            let childPartIds = this.getConnectedPartIds(pid).filter(pid => basePartIds.indexOf(pid) < 0);
            for (let cid of childPartIds) {
                distanceFromArticulatedPart[cid] = 1;
                if (todo.indexOf(cid) < 0) {
                    todo.push(cid);
                }
            }

            while (todo.length > 0) {
                const tid = todo.pop();
                const dt = distanceFromArticulatedPart[tid];
                const nids = this.getConnectedPartIds(tid);
                const dn = dt + 1;
                for (let nid of nids) {
                    const d = distanceFromArticulatedPart[nid];
                    if (d == null || dn <= Math.abs(d)) {
                        distanceFromArticulatedPart[nid] = dn;
                        todo.push(nid);
                    }
                }
            }

            articulationPartDists.push({ articulation: articulation, partDists: distanceFromArticulatedPart});
        }
        return articulationPartDists;
    }

    __groupPartToArticulatedPart(articulationPartDists) {
        const pidToArticulatedPart = [];
        for (let artPartDist of articulationPartDists) {
            const articulation = artPartDist.articulation;
            const partDists = artPartDist.partDists;
            for (let pid in partDists) {
                const d = partDists[pid];
                if (d != null) {
                    const absd = Math.abs(d);
                    let update = (pidToArticulatedPart[pid] == null) || (absd < pidToArticulatedPart[pid].dist);
                    if (!update && pidToArticulatedPart[pid].dist === absd) {
                        if ((d >= 0) && pidToArticulatedPart[pid].articulation == null) {
                            update = true;
                        }
                    }
                    if (update) {
                        pidToArticulatedPart[pid] = { pid: pid, dist: absd, articulation: (d < 0)? null: articulation };
                    }
                }
            }
        }
        return pidToArticulatedPart;
    }

    cutExtraConnectionsFromChildParts(articulations) {
        const articulationPartDists = this.__getArticulationPartDists(articulations);
        const pidToArticulatedPart = this.__groupPartToArticulatedPart(articulationPartDists);
        for (let pid in pidToArticulatedPart) {
            const articulation = pidToArticulatedPart[pid].articulation;
            const dist = pidToArticulatedPart[pid].dist;
            if (articulation && dist > 0) {
                let connectedPartIds = this.getConnectedPartIds(pid);
                for (let cid of connectedPartIds) {
                    const cart = pidToArticulatedPart[cid];
                    if (cart == null || cart.pid !== articulation.pid) {
                        this.remove(cid, pid, true);
                    }
                }
            }
        }
    }

    clone(cloneParts = false) {
        const parts = cloneParts? _.map(this.parts, (p) => p? p.clone() : null) : this.parts;
        return new PartConnectivityGraph(this.connectivityAsArray(), parts, this.metadata);
    }

    extractConnectivity(indices) {
        const remapped = {};
        indices.forEach((pid,i) => {
            remapped[pid] = i;
        });
        const indicesSet = new Set(indices);
        const copiedParts = indices.map((pid, i) => {
            const p = this.parts[pid];
            const cp = p? p.clone() : null;
            if (cp) {
                cp.object3D.userData.scenePid = cp.pid;
                cp.pid = i;
                cp.object3D.userData.pid = cp.pid;
            }
            return cp;
        });
        const extractedConnectivity = indices.map((pi) => {
           const connected = this.getConnectedPartIds(pi)
           const array = connected.filter(i => indicesSet.has(i));
           return array.map(i => remapped[i]);
        });
        return { connectivity: new PartConnectivityGraph(extractedConnectivity, copiedParts, this.metadata), remapped: remapped }
    }

    connectivityAsArray() {
        return this.connections.map(p => [...p]);
    }

    setConnectivityFromArray(connectivityArray) {
        // TODO: check validity of connectivity array?
        this.connections = connectivityArray.map(c => new Set(c));
    }

    withPartObject3Ds(idToObjs, clone) {
        const graph = clone? this.clone(true) : this;
        _.each(idToObjs, (obj, pid) => {
            if (typeof pid === 'string') {
                pid = parseInt(pid);
            }
            if (graph.parts[pid]) {
                graph.parts[pid].object3D = obj;
            } else {
                console.log('unknown part', pid);
            }
        });
        return graph;
    }

    fromPartHierarchy(partHierarchy) {
        const nodes = partHierarchy.getNodes();
        const parts = [];
        // Assume that part pid is integer and can be indexed this way
        for (let node of nodes) {
            parts[node.pid] = node;
        }
        this.parts = parts;
        this.connections = [];
        nodes.forEach(n => {
            if (n.parent) {
                this.add(n.pid, n.parent.pid, true);
            }
            if (n.children) {
                for (let c of n.children) {
                    this.add(n.pid, c.pid, true);
                }
            }
        });
        this.metadata = {};
        if (this.metadata.modelId == null) {
            this.metadata.modelId = partHierarchy.root.object3D.userData.modelId;
        }
    }

    static fromPartHierarchy(partHierarchy) {
        let cg = new PartConnectivityGraph();
        cg.fromPartHierarchy(partHierarchy);
        return cg;
    }

    fromJson(json) {
        this.parts = json.parts.map(p => p? Part.fromJson(p) : null );
        this.connections = json.connectivityGraph.map(c => new Set(c));
        this.metadata = json.metadata || {};
        if (this.metadata.partsAnnId == null) {
            this.metadata.partsAnnId = json.annId;
        }
        if (this.metadata.modelId == null) {
            this.metadata.modelId = json.modelId || json.id;
        }
    }

    toJson() {
        const json = {
            version: 'part-connectivity@0.0.1',
            modelId: this.metadata? this.metadata.modelId : undefined,
            metadata: _.omit(this.metadata, ['modelId'])
        };
        json.parts = this.parts.map(p => p? p.toJson() : null);
        const allSourceParts = [];
        for (let part of json.parts) {
            if (part && part.sourceParts) {
                for (let p of part.sourceParts) {
                    allSourceParts[p.pid] = p;
                }
                part.sourcePartIds = part.sourceParts.map(p => p.pid);
                delete part.sourceParts;
            }
        }
        if (allSourceParts.length > 0) {
            json.sourceParts = allSourceParts;
        }
        json.connectivityGraph = this.connectivityAsArray();
        return json;
    }

    static fromJson(json) {
        let cg = new PartConnectivityGraph();
        cg.fromJson(json);
        return cg;
    }

    static load(filename, callback) {
        _.getJSON(filename, (err, json) => {
            if (err) {
                callback(err, null);
            } else {
                callback(null, PartConnectivityGraph.fromJson(json));
            }
        });
    }

}


module.exports = PartConnectivityGraph;