#!/usr/bin/env python

import argparse
import csv
import logging
import os
import fnmatch
import re
import sys

FORMAT = '%(asctime)-15s [%(levelname)s] %(message)s'
logging.basicConfig(format=FORMAT)
log = logging.getLogger('parse-assimp-info')
log.setLevel(logging.INFO)

def infoSummary(dir, outfile):
    fields = {
        'Nodes': 'nnodes',
        'Maximum depth': 'maxNodeDepth',
        'Meshes': 'nmeshes',
        'Materials': 'nmaterials',
        'Vertices': 'nvertices',
        'Faces': 'nfaces',
        'Minimum point': 'minPoint',
        'Maximum point': 'maxPoint'
    }
    fieldnames = ['id', 'path']
    fieldnames.extend(fields.values())
    writer = csv.DictWriter(outfile, fieldnames=fieldnames, extrasaction='ignore')
    writer.writeheader()
    infoRegex = re.compile(r'([a-zA-Z ]+?):?\s+([0-9.,() +-]+)')

    def outputEntry(fullpath):
        basename = os.path.basename(fullpath).replace('.info', '')
        with open(fullpath, 'r') as infile:
            entry = {'id': basename, 'path': fullpath}
            for line in infile:
                if line.startswith('Center point'):
                    break  # DONE!
                match = infoRegex.match(line)
                if match:
                    f = fields.get(match.group(1))
                    if f:
                        entry[f] = match.group(2)
            writer.writerow(entry)

    if os.path.isdir(dir):
        for root, dirnames, filenames in os.walk(dir):
            for filename in fnmatch.filter(filenames, '*.info'):
                fullpath = os.path.join(root, filename)
                outputEntry(fullpath)
    else:
        outputEntry(dir)


def main():
    desc = 'Print assimp info stats.'
    parser = argparse.ArgumentParser(description=desc)
    parser.add_argument('dir', type=str, default='.',
                        help='directory with info files (default is ".")')
    args = parser.parse_args()

    infoSummary(args.dir, sys.stdout)

if __name__ == '__main__':
    main()
