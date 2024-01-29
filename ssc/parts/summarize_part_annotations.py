#!/usr/bin/env python3

import argparse
import csv
import glob
import json
import os
import sys

def load_annotation(input_filename):
    with open(input_filename, 'r') as input:
        ann = json.load(input)
        return ann

def process_annotation(id, ann, label_stats, parts, object_stats):
    stats = ann["stats"]
    stats['id'] = id
    stats['num_parts'] = len(ann["parts"])
    object_stats[id] = stats
    labels_for_object = {}
    for part in ann["parts"]:
        label = part["label"]
        if not label in label_stats:
            label_stats[label] = { "label": label, "num_parts": 0, "num_objects": 0 }
        if not label in labels_for_object:
            labels_for_object[label] = True
            label_stats[label]["num_objects"] += 1
        label_stats[label]["num_parts"] += 1
        parts.append({ "id": part["id"], "modelId": id, "partId": part["partId"], "label": part["label"]})


def load_csv(filename, key):
    with open(filename, 'r') as input:
        reader = csv.DictReader(input)
        entries_by_key = {row[key]: row for row in reader}
        return entries_by_key


def write_csv(items, filename, fieldnames):
    writer = csv.DictWriter(filename, fieldnames=fieldnames, extrasaction='ignore')
    writer.writeheader()
    for item in items:
        writer.writerow(item)


def add_wnsynset(items, label_to_synset, verbose=False):
    for item in items:
        label = item['label']
        wnsynset = label_to_synset.get(label, None)
        wnsynsetkey = wnsynset.get('wnsynsetkey','') if wnsynset else ''
        item['wnsynsetkey'] = wnsynsetkey
        if verbose and len(wnsynsetkey) == 0:
            print(f'No wnsynset for label {label}', file=sys.stderr)

def add_wnsynset_category(items, synset_to_category, fields, verbose=False):
    for item in items:
        wnsynsetkey = item['wnsynsetkey']
        cat_info = synset_to_category.get(wnsynsetkey)
        if cat_info is not None:
            for field in fields:
                item[field] = cat_info[field]
        else:
            for field in fields:
                item[field] = ''
            if verbose and len(wnsynsetkey) > 0:
                print(f'No category info for wnsynsetkey: {wnsynsetkey}', file=sys.stderr)


def process_files(files, label_stats, parts, object_stats):
    nfiles = len(files)
    for ifile, file in enumerate(files):
        print(f'Processing {ifile}/{nfiles} {file}', file=sys.stderr)
        id = os.path.basename(file).split(".")[0]
        ann = load_annotation(file)
        process_annotation(id, ann, label_stats, parts, object_stats)

def process_dir(input_dir, pattern, label_stats, parts, object_stats):
    files = glob.glob(f'{input_dir}/**/{pattern}', recursive=True)
    files.sort()
    print(f'Find {len(files)} total files', file=sys.stderr)
    process_files(files, label_stats, parts, object_stats)

def read_lines(file_path):
    lines = []
    with open(file_path, "r") as file:
        for line in file:
            # Remove leading/trailing whitespace and add the line to the list
            lines.append(line.strip())
    return lines


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Summarize part annotations as csv")
    parser.add_argument("--input", "-i", required=True, help="the input annotation json file, a list of json files, or an directory containing annotation json files")
    parser.add_argument("--objects", "-o", help="output filename for objects", type=argparse.FileType('w'), default=sys.stdout)
    parser.add_argument("--parts", help="output filename for parts", type=argparse.FileType('w'))
    parser.add_argument("--labels", help="output filename for labels", type=argparse.FileType('w'))
    parser.add_argument("--pattern", help="File pattern to look for", default="*.parts.json")
    parser.add_argument("--label-to-synset", help="label to synset mappings")
    parser.add_argument("--synset-to-category", help="synset to category mappings")
    args = parser.parse_args()

    object_stats = {}
    label_stats = {}
    parts = []
    if os.path.isdir(args.input):
        process_dir(args.input, args.pattern, label_stats, parts, object_stats)
    elif args.input.endswith('.txt'):
        files = read_lines(args.input)
        process_files(files, label_stats, parts, object_stats)
    else:
        filename = args.input
        ann = load_annotation(filename)
        id = os.path.basename(filename).split(".")[0]
        process_annotation(id, ann, label_stats, parts, object_stats)

    fieldnames=["id", "num_parts", "percentComplete", "annotatedFaces", "totalFaces", "annotatedFaceArea", "totalFaceArea"]
    write_csv(object_stats.values(), args.objects, fieldnames)

    if args.label_to_synset:
        label_to_synset = load_csv(args.label_to_synset, 'label')
    else:
        label_to_synset = None

    if args.synset_to_category:
        synset_to_category = load_csv(args.synset_to_category, 'wnsynsetkey')
    else:
        synset_to_category = None

    if args.parts:
        fieldnames=["id", "modelId", "partId", "label"]
        if label_to_synset:
            add_wnsynset(parts, label_to_synset)
            fieldnames.append('wnsynsetkey')
        write_csv(parts, args.parts, fieldnames)

    if args.labels:
        fieldnames=["label", "num_parts", "num_objects"]
        if label_to_synset:
            add_wnsynset(label_stats.values(), label_to_synset, verbose=True)
            fieldnames.insert(0, 'wnsynsetkey')
        if synset_to_category:
            additional_fields = ['main_wnsynsetkey','main_category','super_category']
            add_wnsynset_category(label_stats.values(), synset_to_category, additional_fields, verbose=True)
            fieldnames.extend(additional_fields)
        write_csv(label_stats.values(), args.labels, fieldnames)