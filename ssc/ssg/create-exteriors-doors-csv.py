#!/usr/bin/env python3

import argparse
import glob
import json
import csv
import os


def merge_exterior_doors(basedir, output_csv):
    doors_json_paths = glob.glob(os.path.join(basedir, '*.exteriorDoors.json'))

    entries = []
    for doors_json_path in doors_json_paths:
      info = json.load(open(doors_json_path))
      if '.' in info['id']:
          info['id'] = info['id'].split('.',2)[1]
          info['exteriorDoorIds'] = ','.join(info['exteriorDoorIds'])
      entries.append(info)
    entries.sort(key=lambda s: s['id'])

    with open(output_csv, 'w') as output:
        writer = csv.writer(output)
        writer.writerow(['id','exteriorDoorIds'])
        for entry in entries:
            writer.writerow([entry['id'], entry['exteriorDoorIds']])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Collate exterior doors')
    parser.add_argument('--input_dir', '-i', required=True, help='Directory containing exterior door json files.')
    parser.add_argument('--output', '-o', required=True, help='Where to store merged csv file')
    args = parser.parse_args()

    merge_exterior_doors(args.input_dir, args.output)
