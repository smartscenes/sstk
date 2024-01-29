#!/usr/bin/env python3

# pip install graphviz
# pip install easydict
import argparse
import json
import os
import re
import urllib.request
from graphviz import Digraph
from easydict import EasyDict as edict
from typing import List, Callable, NamedTuple
from collections import deque

class Node:
    def __init__(self, id: str, type: str, label: str, level: int=0, parentId: str=None, children: list=None, info: dict=None):
        self.id = id
        self.type = type
        self.label = label
        self.level = level
        self.parentId = parentId
        self.children = children if children is not None else []
        self.info = info

SupportEdge = NamedTuple('SupportEdge', [('start_node', Node), ('end_node', Node)])

def download_image(url, local_path, force=False):
    has_file = os.path.isfile(local_path)
    if has_file and not force:
        return local_path
    # Download
    note = ""
    if has_file:
        note = " overwriting existing"
    print(f'Download {url} to {local_path}{note}')
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    try:
        urllib.request.urlretrieve(url, local_path)
        return local_path
    except:
        print(f'Error downloading {url}')
        return None


def get_json(url):
    with urllib.request.urlopen(url) as f:
        return json.loads(f)

class SceneHierarchyGraph:
    """Represents the scene hierarchy
    """
    def __init__(self, scene_json_file: str, arch_json_file: str=None):
        self.id = os.path.basename(scene_json_file).split('.')[0]
        debug = False

        # load scene format
        with open(scene_json_file) as input:
            self.scene_dict = edict(json.load(input))
        objects = self.scene_dict.scene.object
        print(f'Got {len(objects)} objects')
        self.objects = [Node(object.id, 'Object', label=object.id, parentId=object.get('parentId'), info=object) for object in objects]
        id_to_node = {}
        for object in self.objects:
            id_to_node[object.id] = object
        regions = {}
        non_region_roots = []
        region_id_re = re.compile('(\d+_\d+)(.*)')
        for object in self.objects:
            parentIndex = object.info.get('parentIndex', -1)
            parentId = object.parentId
            if parentIndex < 0:
                print(f'Process parent {parentId}')
                if parentId is not None:
                    arch_element = id_to_node.get(parentId)
                    if arch_element is None:
                        match = region_id_re.match(parentId)
                        regionId = match.group(1)
                        suffix = match.group(2)
                        archType = 'Wall'
                        if suffix.startswith('c'):
                            archType = 'Ceiling'
                        elif suffix.startswith('f'):
                            archType = 'Floor'
                        arch_element = Node(id=parentId, type='Arch', label=parentId, parentId=regionId, children=[], info={ "archType": archType })
                        id_to_node[parentId] = arch_element

                        # add region
                        region = id_to_node.get(regionId)
                        if region is None:
                            region = Node(id=regionId, type='Region', label=f'R{regionId}', parentId=None, children=[], info={})
                            regions[regionId] = region
                            id_to_node[regionId] = region
                        if debug:
                            print(f'Add child {arch_element.id} to region {region.id}')
                        region.children.append(arch_element)
                    if debug:
                        print(f'Add child {object.id} to parent {arch_element.id}')
                    arch_element.children.append(object)
                else:
                    non_region_roots.append(object)
            else:
                parent = self.objects[parentIndex]
                if debug:
                    print(f'Add child {object.id} to parent {parent.id}')
                parent.children.append(object)

        # Order nodes
        roots = []
        for regionId, region in regions.items():
            roots.append(region)
        roots.extend(non_region_roots)
        print(f'Got {len(regions)} regions and {len(non_region_roots)} non region roots')

        self.id_to_node = id_to_node
        self.regions = regions
        self.roots = roots

        self.nodes, self.edges = self.get_graph(roots)


    def get_graph(self, roots, nodes=None, edges=None):
        if nodes is None:
            nodes=[]
        if edges is None:
            edges=[]
        to_process = deque(roots)
        added_to_process = set()
        for node in roots:
            added_to_process.add(node.id)
        while len(to_process) > 0:
            node = to_process.popleft()
            # childids = [child.id for child in node.children]
            # print(f'processing {node.id} with children {childids}')
            parentId = node.parentId
            if parentId is not None:
                parent_node = self.id_to_node[parentId]
                node.level = parent_node.level + 1
            else:
                node.level = 0
            for child in node.children:
                if child.id not in added_to_process:
                    added_to_process.add(child.id)
                    to_process.append(child)
                else:
                    print(f'Visiting repeated child {child.id}')
                edges.append(SupportEdge(node, child))
            nodes.append(node)
        print(f'Got {len(nodes)} nodes and {len(edges)} edges')
        return nodes, edges

class SceneHierarchyViz:
    def __init__(self,
                 use_asset_image = False,
                 stk_path: str = None,
                 local_image_path: str = None,
                 force_download = False):
        self.use_asset_image = use_asset_image
        self.stk_path = stk_path
        self.local_image_path = local_image_path
        self.force_download = force_download
        self.asset_image_cache = {}

    def get_local_image_path(self, asset_id):
        if asset_id not in self.asset_image_cache:
            source, id = asset_id.split(".", 2)
            # info = get_json(f'{self.stk_path}/assets/download/{source}/image')
            asset_url = f'{self.stk_path}/assets/download/{source}/image/{id}/screenshot?thumbnail=auto'
            local_path = f'{self.local_image_path}/{source}/{id}.png'
            # print(f'got {local_path} for {asset_id}')
            downloaded_path = download_image(asset_url, local_path, self.force_download)
            self.asset_image_cache[asset_id] = {
                'asset_id': asset_id,
                'asset_url': asset_url,
                'local_path': downloaded_path
            }

        return self.asset_image_cache[asset_id]['local_path']


    def to_graphviz(self, scene_graph: SceneHierarchyGraph) -> Digraph:
        """Create graphviz Digraph from nodes and edges in this SceneHierarchyGraph
        """
        # Number of pixels per inch (set to be same as points per inch which is 72)
        dpi = 72
        # See https://graphviz.gitlab.io/_pages/doc/info/attrs.html for graphviz attributes
        dot = Digraph(name=scene_graph.id, engine='dot', graph_attr={
                      'rankdir': 'LR',
                      'concentrate': 'true',  # Consolidate two unidir arrows into one bidir arrow 
                      'bgcolor': 'white', 'dpi': str(dpi), 'inputscale': str(dpi)})

        nodes = [node for node in scene_graph.nodes if node is not None]

        for node in nodes:
            color = 'black'
            linestyle = 'solid'
            image_local_path = None
            if self.use_asset_image and 'modelId' in node.info:
                image_local_path = self.get_local_image_path(node.info.modelId)
            if image_local_path is None:
                dot.node(node.id, node.label, shape="rectangle",
                         color=color, style=linestyle)
            else:
                print(f"use image path {image_local_path} for {node.info.modelId}")
                dot.node(node.id, node.label, shape="rectangle",
                         labelloc="b",
                         image=image_local_path, fixedsize="true", imagescale="true",
                         height="1px",
                         imagepos="tc",
                         color=color, style=linestyle)

        dot.edge_attr.update(arrowhead='vee', penwidth='3',
                             tailclip='true', headclip='true')
        for edge in scene_graph.edges:
            edge_label = None
            edge_color = 'black'
            dot.edge(edge.start_node.id, edge.end_node.id,
                     edge_label, color=edge_color)

        return dot

def str2list(text: str) -> List[str]:
    return [x.strip() for x in text.split(',')]

if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='Visualize scene hierarchy')
    parser.add_argument('-i', '--input_scene', type=str, help='Input scene json file', required=True)
    parser.add_argument('-a', '--input_arch', type=str, help='Input arch file', required=False)
    parser.add_argument('-o', '--output_dir', type=str, help='Output dir', required=True)
    parser.add_argument('-of', '--output_formats', type=str2list, default=['png'], help='comma delimited graphviz format: dot,json,svg,png,pdf')
    parser.add_argument('-d', '--download_images', action='store_true', help='Download images for models')
    parser.add_argument('-df', '--force_download_images', action='store_true', help='Force download images for models')
    parser.add_argument('--stk-url', type=str, help='STK url', require=True)
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)
    download_images = args.download_images or args.force_download_images
    scene_hierarchy = SceneHierarchyGraph(scene_json_file=args.input_scene, arch_json_file=args.input_arch)
    scene_hierarchy_viz = SceneHierarchyViz(use_asset_image=download_images,
                                            stk_path=args.stk_url,
                                            local_image_path=args.output_dir + '/images',
                                            force_download=args.force_download_images)
    digraph = scene_hierarchy_viz.to_graphviz(scene_hierarchy)
    for out_format in args.output_formats:
        digraph.render(args.output_dir + '/' + scene_hierarchy.id, format=out_format)

