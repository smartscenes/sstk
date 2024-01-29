#!/usr/bin/env python3

# pip install graphviz
import argparse
import json
import os
from graphviz import Digraph
from typing import List, Callable, NamedTuple

PartNode = NamedTuple('PartNode', [('id', str), ('label', str), ('obb', dict)])
PartPartEdge = NamedTuple('PartPartEdge', 
    [('start_node', PartNode), ('end_node', PartNode), ('distance', float)])

class PartConnectivityGraph:
    """Represents a connectivity graph of object parts
    """
    def __init__(self, connectivity_json_file: str, parts_json_file: str, connectivity_graph_field='connectivityGraph'):
        self.model_id = os.path.basename(connectivity_json_file).split('.')[0]

        # load connectivity
        raw_articulations = json.load(open(connectivity_json_file))
        self.connectivity_graph = raw_articulations[connectivity_graph_field]
        self.distance_matrix = raw_articulations['distanceMatrix'] if 'distanceMatrix' in raw_articulations else None
        self.parts = raw_articulations['parts']

        if self.parts is not None:
            for part in self.parts:
                if part.get('label') is None:
                    part['label'] = part['name']
            self.part_labels = [
                "unknown" if part is None else part['label'] for part in self.parts]
            self.part_nodes = [
                PartNode(id=str(i), label=self.part_labels[i], obb=part.get('obb')) if part is not None else None 
                    for i, part in enumerate(self.parts)]
        else:
            # load parts from separate parts_json_file
            if parts_json_file is None:
                raise Exception("Connectivity file does not contain parts.  Please specify --input_parts")
            j = json.load(open(parts_json_file))
            self.part_labels = None
            for blob in j['segmentation']:
                # parts segmentation has 'name': 'parts'
                if blob['name'] != 'parts':
                    continue
                self.part_labels = blob['labels']

            # create nodes and edges
            indices = range(len(self.part_labels))
            self.part_nodes = [
                PartNode(id=str(i), label=self.part_labels[i], obb=None) for i in indices]
        self.part_part_edges = self._compute_part_part_edges()

    def num_parts(self) -> int:
        """Return number of parts in this connectivity graph
        """
        return len(self.part_nodes)

    def part_unique_label(self, part_id: int) -> str:
        """Construct a unique label for part with given integer id

           Unique label is of form part_id:part_label
        """
        return str(part_id) + ':' + self.part_labels[part_id]

    def to_graphviz(self) -> Digraph:
        """Create graphviz Digraph from nodes and edges in this PartConnectivityGraph
        """
        # Number of pixels per inch (set to be same as points per inch which is 72)
        dpi = 72
        # See https://graphviz.gitlab.io/_pages/doc/info/attrs.html for graphviz attributes
        dot = Digraph(name=self.model_id, engine='dot', graph_attr={
                      'concentrate': 'true',  # Consolidate two unidir arrows into one bidir arrow 
                      'bgcolor': 'white', 'dpi': str(dpi), 'inputscale': str(dpi)})

        nodes = [node for node in self.part_nodes if node is not None]
        # sort nodes by OBB centroid
        def node_sort(n):
            if n.obb is not None:
                c = n.obb['centroid']
                #s = n.obb['axesLengths']
                return (c[1])  
            else:
                return (0)
        nodes.sort(key=node_sort, reverse=True)

        for node in nodes:
            color = 'black'
            linestyle = 'solid'
            dot.node(node.id, node.label, shape='rectangle',
                     color=color, style=linestyle)

        dot.edge_attr.update(arrowhead='vee', penwidth='3',
                             tailclip='true', headclip='true')
        for edge in self.part_part_edges:
            edge_label = None
            edge_color = 'black'
            dot.edge(edge.start_node.id, edge.end_node.id,
                     edge_label, color=edge_color)

        return dot

    def _compute_part_part_edges(self) -> List[PartPartEdge]:
        """Helper to produce part-part edges
        """
        edges = []
        for part_id, connected_ids in enumerate(self.connectivity_graph):
            for connected_id in connected_ids:
                try:
                    # TODO why can below run into index out of bounds?
                    distance = 0  #self.distance_matrix[part_id][connected_id]
                    edges.append(PartPartEdge(
                        start_node=self.part_nodes[part_id], 
                        end_node=self.part_nodes[connected_id], 
                        distance=distance))
                except IndexError:
                    print(
                        f'Part index out of bounds for edge between parts id={part_id} and id={connected_id} (num_parts={self.num_parts()} model_id={self.model_id})')
        return edges

def str2list(text: str) -> List[str]:
    return [x.strip() for x in text.split(',')]


if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='Visualize part connectivity')
    parser.add_argument('-i', '--input_connectivity', type=str, help='Input connectivity json file', required=True)
    parser.add_argument('--input_parts', type=str, help='Input parts json file', required=False)
    parser.add_argument('--fieldname', type=str, help='Input connectivity fieldname', default='connectivityGraph')
    parser.add_argument('-o', '--output_dir', type=str, help='Output dir', required=True)
    parser.add_argument('-of', '--output_formats', type=str2list, default=['png'], help='comma delimited graphviz format: dot,json,svg,png,pdf')
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)
    pcg = PartConnectivityGraph(parts_json_file=args.input_parts, 
        connectivity_json_file=args.input_connectivity, connectivity_graph_field=args.fieldname)
    digraph = pcg.to_graphviz()
    for out_format in args.output_formats:
        digraph.render(args.output_dir + '/' + pcg.model_id, format=out_format)

