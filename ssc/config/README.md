Example config files for use with various ssc scripts.

```
  default.json - Default configurations (intended to be used by all ssc scripts)
  
  # Rendering config files
  render-model-normalized.json - Shows how to specify camera/view settings
  render_scan.json - Configuration for rendering screenshot of a scan
  render_shapenetv1_obj.json - Specifies up/front for ShapeNetCore v1 OBJ files (for use with render_file.js)
  render_shapenetv2_obj.json - Specifies up/front for ShapeNetCore v2 OBJ files (for use with render_file.js)
  render_suncg.json - Configuration for rendering suncg scenes
  render_turntable.json - Configuration for rendering turntable 
  render_turntable_neutral.json - Configuration for rendering turntable with a neutral coloring
```

Use `--config_file <filename>` to specify configuration file with use with script. 
Multiple config files can be specified (settings from later ones will take override settings from earlier config files).

Example illustrating use of multiple config files to render turntable images for a ShapeNetCore v2 model.
Requires [`ffmpeg`](https://www.ffmpeg.org/) for generating the final `mp4` video.
```
./render-file.js --config_file config/render_shapenetv2_obj.json --config_file config/render_turntable.json --input <PATH_TO_ShapeNetCorev2>/04004475/13a521e846eaa8599c6f3626936936a0/models/model_normalized.obj --output_dir 13a521e846eaa8599c6f3626936936a0
```

It is also possible for a config file to refer to another config file
```
{
  "key_name": { "$ref": "path relative to this config file" }
}
```


