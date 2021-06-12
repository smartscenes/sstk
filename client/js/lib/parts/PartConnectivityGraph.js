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
        return this.getConnectedPartIds(pid1).has(pid2);
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

    clone(cloneParts = false) {
        const parts = cloneParts? _.map(this.parts, (p) => p? p.clone() : null) : this.parts;
        return new PartConnectivityGraph(this.connectivityAsArray(), parts, this.metadata);
    }

    connectivityAsArray() {
        return this.connections.map(p => [...p]);
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
        this.parts = nodes;
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