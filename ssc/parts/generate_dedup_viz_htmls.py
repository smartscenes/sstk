#!/usr/bin/env python3

import argparse
import glob
import json
import os
import sys


class HtmlWriter:
    def __init__(self, output, images_dir):
        self.output = output
        self.images_dir = images_dir

    def __get_image_src(self,id,pid):
        return f'{self.images_dir}/{id}/{id}_part_{pid}.png'

    def __get_part_image_html(self,id,pid):
        img_src = self.__get_image_src(id,pid)
        return f'<image height="100px" src="{img_src}" title="{pid}"/>'

    def write(self, string):
        print(string, file=self.output)

    def write_header(self):
        self.write('<html lang="en">')
        self.write('<head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8">')
        self.write('<title>Parts</title>')
        self.write('</head>')
        self.write('<body>')
    def write_footer(self):
        self.write('</body></html>')
    def write_record(self, id, metadata):
        all_parts = metadata["parts"]
        ref_parts = [part for part in all_parts if part.get("isRef", True)]
        ref_parts_by_label = {}
        for ref_part in ref_parts:
            label = ref_part["label"]
            parts = ref_parts_by_label.setdefault(label, [])
            parts.append(ref_part)
        self.write(f'<div>{id}')
        for label,parts in ref_parts_by_label.items():
            self.write(f'<div>{label}')
            for ref_part in parts:
                ref_partid = ref_part["partId"]
                dup_partids = ref_part.get("dupPartIds", [])
                self.write(f'<div>')
                self.write(self.__get_part_image_html(id, ref_partid))
                for partid in dup_partids:
                    self.write(self.__get_part_image_html(id, partid))
                self.write('</div>')
            self.write('</div>')
        self.write('</div>')


def load_metadata(input_filename):
    with open(input_filename, 'r') as input:
        ann = json.load(input)
        return ann

def process_files(input_dir, pattern, output_dir, images_dir):
    files = glob.glob(f'{input_dir}/**/{pattern}', recursive=True)
    files.sort()
    print(f'Find {len(files)} total files', file=sys.stderr)

    nfiles = len(files)
    for ifile, file in enumerate(files):
        print(f'Processing {ifile}/{nfiles} {file}', file=sys.stderr)
        id = os.path.basename(file).split(".")[0]
        metadata = load_metadata(file)
        output_file = f'{output_dir}/{id}.dedup.html'
        with open(output_file, 'w') as output:
            writer = HtmlWriter(output, images_dir)
            writer.write_header()
            writer.write_record(id, metadata)
            writer.write_footer()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create a html summarizing the part decomposition")
    parser.add_argument("--input", "-i", required=True, help="the input directory containing exported parts and deduplications files")
    parser.add_argument("--renders", "-r", required=True, help="the renderings")
    parser.add_argument("--output", "-o", required=True, help="output visualization directory")
    args = parser.parse_args()
    process_files(args.input, "*.parts.metadata.json", args.output, args.renders)


