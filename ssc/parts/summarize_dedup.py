#!/usr/bin/env python3

import argparse
import csv
import glob
import itertools
import json
import os
import sys

def load_metadata(input_filename):
    with open(input_filename, 'r') as input:
        ann = json.load(input)
        return ann

def load_csv(filename, key):
    with open(filename, 'r') as input:
        reader = csv.DictReader(input)
        entries_by_key = {row[key]: row for row in reader}
        return entries_by_key


def process_metadata(id, metadata, object_label_stats, parts):
    label_stats = {}
    for part in metadata["parts"]:
        label = part["label"]
        if not label in label_stats:
            label_stats[label] = { "object_id": id, "label": label, "total": 0, "unique": 0 }
        label_stats[label]["total"] += 1
        if part.get("isRef", True):
            label_stats[label]["unique"] += 1
            part = { "id": f"{id}_part_{part['partId']}",
                     "decomposedFrom": id,
                     "name": label,
                     "nvertices": part['nvertices'],
                     "nfaces": part['nfaces']}
            parts.append(part)
    for label,stats in label_stats.items():
        object_label_stats.append(stats)

def process_files(input_dir, pattern, object_label_stats, parts):
    files = glob.glob(f'{input_dir}/**/{pattern}', recursive=True)
    files.sort()
    print(f'Find {len(files)} total files', file=sys.stderr)

    nfiles = len(files)
    for ifile, file in enumerate(files):
      print(f'Processing {ifile}/{nfiles} {file}', file=sys.stderr)
      id = os.path.basename(file).split(".")[0]
      ann = load_metadata(file)
      process_metadata(id, ann, object_label_stats, parts)

def write_csv(items, filename, fieldnames):
    print(f'Writing {filename}', file=sys.stderr)
    writer = csv.DictWriter(filename, fieldnames=fieldnames, extrasaction='ignore')
    writer.writeheader()
    for item in items:
        writer.writerow(item)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Summarize deduplicated parts as csv")
    parser.add_argument("--input", "-i", required=True, help="the input annotation json file or an directory containing annotation json files")
    parser.add_argument("--output", "-o", help="output summary filename", type=argparse.FileType('w'), default=sys.stdout)
    parser.add_argument("--index_decomposed", "-d", help="output csv for updating decomposed models", type=argparse.FileType('w'))
    parser.add_argument("--index_decomposed_parts", "-p", help="output csv for updating decomposed parts", type=argparse.FileType('w'))
    parser.add_argument("--label-to-synset", "-l", help="mapping from label to synset")
    parser.add_argument("--models", "-m", help="original csv with model info (with alignment information)")
    parser.add_argument("--pattern", help="File pattern to look for", default="*.parts.metadata.json")
    args = parser.parse_args()

    object_label_stats = []
    parts = []
    if os.path.isdir(args.input):
        process_files(args.input, args.pattern, object_label_stats, parts)
    else:
        filename = args.input
        ann = load_metadata(filename)
        id = os.path.basename(filename).split(".")[0]
        process_metadata(id, ann, object_label_stats, parts)

    write_csv(object_label_stats, args.output, ["object_id", "label", "total", "unique"])

    if args.label_to_synset:
        label_to_synset = load_csv(args.label_to_synset, 'label')
        for part in parts:
            label = part['name']
            if label in label_to_synset:
                part['wnsynsetkey'] = label_to_synset[label]['wnsynsetkey']
            else:
                part['wnsynsetkey'] = ''
    else:
        label_to_synset = None

    if args.models:
        models = load_csv(args.models, 'id')
        for part in parts:
            base_model_id = part['decomposedFrom']
            if base_model_id in models:
                part['up'] = models[base_model_id]['up']
                part['front'] = models[base_model_id]['front']
            else:
                part['up'] = ''
                part['front'] = ''
    else:
        models = None

    if args.index_decomposed:
        aggregated_parts = []
        for object_id,g in itertools.groupby(parts, lambda part: part['decomposedFrom']):
            part_ids = [p['id'] for p in g]
            aggregated_parts.append({ 'id': object_id, 'decomposedInto': ",".join(part_ids) })
        write_csv(aggregated_parts, args.index_decomposed, ["id", "decomposedInto"])

    if args.index_decomposed_parts:
        fields = ["id", "decomposedFrom", "wnsynsetkey", "name", "nvertices", "nfaces", "up", "front"]
        if label_to_synset is None:
            fields = [f for f in fields if f not in ["wnsynsetkey"]]
        if models is None:
            fields = [f for f in fields if f not in ["up","front"]]
        write_csv(parts, args.index_decomposed_parts, fields)
