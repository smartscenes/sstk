Server-side computing scripts
=============================

To run you need to have first built the STK client code (run `./build.sh` in the main scene-toolkit directory).

Then, install all necessary dependencies by running `npm install`.  After that, the following script commands are available:

Use `--help` to get help for specific scripts.

Rendering scripts:

1. `./render  --id <id> --dir=<baseDir> [--source p5d|p5dScene] [--width w] [--height h]` - Renders model or scene using default cameras
    
    1. Render scenes colored by object category
        
        `./render --color_by category`
    
    2. Render canonical views for a scene

        `./render --render_all_views`

    3. Render encoded semantic segmentation by objectId and exports index for a scene

        `./render --color_by objectId --encode_index --write_index`

    4. Render encoded semantic segmentation by objectPartId and exports index for a scene

        `./render --color_by objectPartId --encode_index --write_index`

2. `./render-file  --input <filename>` - Renders model from file

3. `./scn2img --limit <n> --cameras <camfile> --id <sceneId>` - Renders images for scene based on set of camera viewpoints 
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

2. `./recolor-ply` - Recolors ply with face annotations using prettier colors

3. `./export-annotated-parts` - Export part annotations

4. `./clean-segment-annotations` - Cleans aggregated segment annotations

5. `./compare-segment-annotations` - Compares two sets of segment annotations

6. `./project-annotations` - Project segment annotations from one mesh to another mesh

7. `./export-scan-model-alignments` - Export scan to model alignment provided by turkers

Known Issues:

1. Loading of KMZ models does not work in SSC

2. Lighting and depth rendering not supported in master branch (supported in r8x branch)

3. Load via local filesystem not supported for all scripts
