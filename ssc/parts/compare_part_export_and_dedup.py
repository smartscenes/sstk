#!/usr/bin/env python3

import argparse
import csv
import glob
import json
import os
import sys

class DiffRecord:
    def __init__(self, id: str):
        self.id = id
        self.mismatches = []


class MyEncoder(json.JSONEncoder):
    def default(self, o):
        return o.__dict__

def load_json(input_filename):
    with open(input_filename, 'r') as input:
        ann = json.load(input)
        return ann

def compare_dict(dict1, dict2, ignore_keys=[]):
    # Find the differences between the two dictionaries
    keys = set(dict1.keys()).union(set(dict2.keys()))
    differences = {}
    for key in keys:
        if key in ignore_keys:
            continue
        if dict1.get(key) != dict2.get(key):
            differences[key] = [dict1.get(key), dict2.get(key)]
    return differences

def compare_parts_metadata(parts1, parts2, diff):
    if len(parts1) == len(parts2):
        unique_parts1 = []
        unique_parts2 = []
        for part1,part2 in zip(parts1, parts2):
            if part1.get('refPartId') is None or part1.get('isRef') == True:
                unique_parts1.append(part1)
            if part2.get('refPartId') is None or part2.get('isRef') == True:
                unique_parts2.append(part2)
            result = compare_dict(part1, part2, ignore_keys=['alignedUsing'])
            if len(result):
                note = f"{len(result)} differences for part {part1.get('partId')} vs {part2.get('partId')}"
                diff.mismatches.append({ 'reason': 'part-mismatch', 'note': note, 'mismatches': result })
        if len(unique_parts1) != len(unique_parts2):
            note = f"Number of unique parts mismatch: {len(unique_parts1)}, {len(unique_parts2)}"
            diff.mismatches.append({ 'reason': 'part-number-uniq-mismatch', 'note': note })
    else:
        note = f"Number of parts mismatch: {len(parts1)}, {len(parts2)}"
        diff.mismatches.append({ 'reason': 'part-number-mismatch', 'note': note })


def compare_parts_details(parts1, parts2, diff):
    if len(parts1) == len(parts2):
        for part1,part2 in zip(parts1, parts2):
            result = compare_dict(part1, part2, ignore_keys=['meshTri'])
            if len(result):
                note = f"{len(result)} differences for part {part1.get('partId')} vs {part2.get('partId')}"
                diff.mismatches.append({ 'reason': 'part-mismatch', 'note': note, 'mismatches': result })
    else:
        note = f"Number of parts mismatch: {len(parts1)}, {len(parts2)}"
        diff.mismatches.append({ 'reason': 'part-number-mismatch', 'note': note })
def compare_parts(entry, do_detailed_compare):
    metadata1 = load_json(entry.get('metadata1'))
    metadata2 = load_json(entry.get('metadata2'))
    diff = DiffRecord(entry.get('id'))
    compare_parts_metadata(metadata1.get('parts'), metadata2.get('parts'), diff)
    if do_detailed_compare and len(diff.mismatches) == 0:
        parts1 = load_json(entry.get('parts1'))
        parts2 = load_json(entry.get('parts2'))
        compare_parts_details(parts1.get('parts'), parts2.get('parts'), diff)
    return diff


def compare_dir(input1, input2, metadata_suffix, parts_suffix, do_detailed_compare):
    files1 = glob.glob(f'{input1}/**/*{metadata_suffix}', recursive=True)
    files1.sort()
    files2 = glob.glob(f'{input2}/**/*{metadata_suffix}', recursive=True)
    files2.sort()
    print(f'Found {len(files1)} total files in {input1}', file=sys.stderr)
    print(f'Found {len(files2)} total files in {input2}', file=sys.stderr)

    # try to match files1 and files2
    id_to_files = {}
    for file in files1:
        filename = os.path.basename(file)
        id = filename.replace(metadata_suffix, '')
        entry = id_to_files.setdefault(id, { 'id': id })
        entry['metadata1'] = file
        entry['parts1'] = file.replace(metadata_suffix, parts_suffix)
    for file in files2:
        filename = os.path.basename(file)
        id = filename.replace(metadata_suffix, '')
        entry = id_to_files.setdefault(id, { 'id': id })
        entry['metadata2'] = file
        entry['parts2'] = file.replace(metadata_suffix, parts_suffix)

    common_ids = []
    file1_ids = []
    file2_ids = []
    diffs = []
    for id, entry in id_to_files.items():
        file1 = entry.get('metadata1')
        file2 = entry.get("metadata2")
        if file1 and file2:
            common_ids.append(id)
            diff = compare_parts(entry, do_detailed_compare)
            if len(diff.mismatches):
                diffs.append(diff)
        elif file1:
            file1_ids.append(id)
        elif file2:
            file2_ids.append(id)

    print(f'Found {len(common_ids)} common files, with {len(file1_ids)} in {input1} only, and {len(file2_ids)} in {input2} only', file=sys.stderr)
    if len(file1_ids):
        diffs.append({ 'reason': 'mismatch1', 'ids': file1_ids, 'note': f'Only in  {input1}' })
    if len(file2_ids):
        diffs.append({ 'reason': 'mismatch2', 'ids': file2_ids, 'note': f'Only in  {input2}' })
    return diffs

def write_csv(items, filename, fieldnames):
    print(f'Writing {filename}', file=sys.stderr)
    writer = csv.DictWriter(filename, fieldnames=fieldnames, extrasaction='ignore')
    writer.writeheader()
    for item in items:
        writer.writerow(item)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Compares export of parts and deduplication")
    parser.add_argument("input", nargs=2, help="the input parts prefix or an directory containing annotation json files")
    parser.add_argument("--output", "-o", help="output summary filename", type=argparse.FileType('w'), default=sys.stdout)
    parser.add_argument('--detailed-compare', "-d", default=False, action='store_true', help='Whether to do detailed comparison or not')
    parser.add_argument("--metadata-suffix", help="File suffix to look for (for metadata)", default=".parts.metadata.json")
    parser.add_argument("--parts-suffix", help="File suffix to look for (for part details)", default=".parts.json")
    args = parser.parse_args()

    input1 = args.input[0]
    input2 = args.input[1]
    if os.path.isdir(input1) and os.path.isdir(input2):
        diffs = compare_dir(input1, input2, args.metadata_suffix, args.parts_suffix, args.detailed_compare)
        print(json.dumps(diffs,cls=MyEncoder), file=args.output)
    else: # assume prefix
        diff = compare_parts({ 'id': f'{input1}-vs-{input2}',
                        'metadata1': input1 + args.metadata_suffix,
                        'metadata2': input2 + args.metadata_suffix,
                        'parts1': input1 + args.parts_suffix,
                        'parts2': input2 + args.parts_suffix
                       },
                      args.detailed_compare)
        print(f'{len(diff.mismatches)} mismatches for {diff.id}')
        if len(diff.mismatches):
            print(json.dumps(diff,cls=MyEncoder), file=args.output)