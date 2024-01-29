# Scripts for extracting parts and decomposing 3D assets

1. `./summarize_dedup.py` - Prepares part csv files that can be indexed and creates a summary file of extracted parts 
and their duplicates.

  Given an input `<parts_directory`, the following command will output `dedup_summary.csv` with information about the 
3D meshes that were decomposed and deduplicated.  It will also output `dedup_decomposed_models.csv` and 
`dedup_decomposed_parts.csv` that can be used to update the solr index.  These files contain information about what 
3D meshes were decomposed and what they were decomposed into, and the individual decomposed parts.  
The `--label-to-synsets` (`-l`) provide mappings from labels to WordNet synsets for the `dedup_decomposed_parts.csv`
The `--models` (`-m`) file is used to transfer alignment information onto the decomposed parts

    ```
    $STK/ssc/parts/summarize_dedup.py -i <parts_directory \
      -o dedup_summary.csv --index_decomposed dedup_decomposed_models.csv --index_decomposed_parts dedup_decomposed_parts.csv 
      -l $METADATA_DIR/decomposed-models/labels.csv -m $METADATA_DIR/fpmodels.csv
    ```

2. `./summarize_part_annotation.py` - Computes statistics over the decomposed parts.

  Given an input `<parts_directory`, the following command will output `parts.csv`, `objects.csv` and `labels.csv` with 
aggregate statistics.  The `--label-to-synsets` and `--synset-to-category` files are used to provide mappings from
labels to WordNet synsets and from the synsets to main categories.  

    ```
    $STK/ssc/parts/summarize_part_annotations.py -i <parts_directory> \
      --parts parts.csv --objects objects.csv --labels labels.csv \
      --label-to-synset $METADATA_DIR/decomposed-models/labels.csv \
      --synset-to-category $METADATA_DIR/decomposed-models/complete-category-mapping.csv
    ```

3. `./identify-dup-and-align.js` - Tries to identify duplicate parts and align them.


