Server-side computing scripts
=============================

To run, make sure that you have first built the STK client code (run `./build.sh` in the main scene-toolkit directory).

After that, the following script commands are available:

Use `--help` to get help for specific scripts.

See [`config`](config/README.md) for example configuration files and how to use `--config_file` option.

Rendering scripts:

1. `./render  --id <id> --dir=<baseDir> [--source <source>] [--width w] [--height h]` - Renders model or scene using default cameras
    
    1. Render scenes colored by object category
        
        `./render --color_by category`
    
    2. Render canonical views for a scene

        `./render --render_all_views`

    3. Render encoded semantic segmentation by objectId and exports index for a scene
       Use `--encode_index` for encoded index and flat coloring for computers (leave out for human consumption)

        `./render --color_by objectId --encode_index --write_index`

    5. Render encoded semantic segmentation by objectPartId and exports index for a scene

        `./render --color_by objectPartId --encode_index --write_index`

    6. Render encoded semantic segmentation by modelId (same color for same model) and exports index for a scene

        `./render --color_by modelId --encode_index --write_index`

    7. Render encoded semantic segmentation by object category and exports index for a scene

        `./render --color_by objectType --encode_index --write_index`
  
       The exported index can be updated with color and additional categories and additional object types.  Use for consistent coloring across scenes.
        `./render --color_by objectType --encode_index  --index <filename> --model_category_mapping <custom_model_id_to_category_mapping`

    8. Render scenes with neutral coloring
        
        `./render --color_by color --color '#fef9ed'`

1. `./render-file  --input <filename>` - Renders model from file

2. `./scn2img --limit <n> --cameras <camfile> --id <sceneId>` - Renders images for scene based on set of camera viewpoints 
  (use `--limit` to limit number of camera viewpoints to render)

Voxels:

1. `./color-voxels` - Create colored voxels for a model
   
   `NODE_BASE_URL=path/to/data ./color-voxels.js --source 3dw --id b192cda468f9390aa3f22b4b00de6dfb --format obj --resolution 128`
   
2. `./render-voxels` - Renders voxels (size of voxel determined by alpha channel, use --size 0.8 to render fixed size voxels)
    1. Render single view

      `./render-voxels.js --input b192cda468f9390aa3f22b4b00de6dfb.nrrd`

    2. Render single view compress png (requires [pngquant](https://pngquant.org/))
    
      `./render-voxels.js --input b192cda468f9390aa3f22b4b00de6dfb.nrrd --compress_png`
    
    3. Render turntable mp4 at steps of 10 degrees (requires [ffmpeg](https://ffmpeg.org/))
    
      `./render-voxels.js --input b192cda468f9390aa3f22b4b00de6dfb.nrrd --render_turntable --turntable_step 10`

Annotation tools:

1. `./export-annotated-ply` - Takes semantically annotated segments and outputs a PLY with semantic data on vertices

1. `./recolor-ply` - Recolors ply with face annotations using prettier colors

1. `./transfer-property-ply` - Transfers face annotation in ply directly onto vertex colors

    1. Transfer vertex label to vertex color

       `./transfer-property-ply.js --input scene0166_00_vh_clean_2.labels.ply --property label --incr_by 1 --from vertex --use_pretty_colors`

    2. Transfer face segment_id to vertex color

       `./transfer-property-ply.js --input scene0166_00_vh_clean_2.segment_id.ply --property segment_id --incr_by 1 --from face --use_pretty_colors`

1. `./clean-segment-annotations` - Cleans aggregated segment annotations

1. `./compare-segment-annotations` - Compares two sets of segment annotations

1. `./project-annotations` - Project segment annotations from one mesh to another mesh
    
    1. Project annotations from one mesh to another (the two meshes should represent the same environment)

       `./project-annotations.js --source <id> --target <id> --output_dir <dir>  --sourceSegmentType segment-annotations-latest --targetSegmentType surfaces --max_dist 0.01`       


1. `./export-scan-model-alignments` - Export scan to model alignment provided by turkers

1. `./export-annotated-parts` - Export part annotations

1. `./export-part-meshes` - Export part meshes as OBJ/MTL

   1. Export part meshes (each leaf part is a separate OBJ/MTL with json file specifying the hierarchy) to output directory and aligned

      `./export-part-meshes --output_dir out/meshes --input 3dw.25524f6bfa80e05b713decb1a0563b12 --use_ids --filter_empty --auto_align --collapse_nested --world_front 0,0,1 --use_search_controller`

1. `./export-mesh` - Export mesh

1. `./create-pts-bvh` - Create BVH given a directory of object point clouds

1. `./sample-points` - Samples points from a mesh (sampled points are output as a PLY file)

Other scripts:

1. `./print-mesh-index-mapping.js` - Print array of meshes to indicate how the STK linearizes the meshes.  Currently works for loaded GLTF files.
    1.  `./print-mesh-index-mapping.js --input <FILENAME.GLB> --inputType path`
        Will produce `<FILENAME>.meshIndex.json` with information about how the linearized meshes maps to the original information from the GLB.
        ```json
          "meshMapping": [
             {"index":0,"meshIndex":3,"primitiveIndex":0,"nodePath":[19,3]}, 
             ... 
          ]
        ```
        The `meshMapping` field contains an array indicating the STK mesh `index`, the original GLB `meshIndex` and `primitiveIndex` as well as
        the indices of the nodes used to instantiate this mesh (starting from the scene node and traversing the children).

1. `./get-info.js` - Print out information for a 3D asset for indexing


See `scripts` directory for examples of how to batch run these scripts.

Known Issues:

1. Load via local filesystem not supported for all scripts
