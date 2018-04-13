
#### Building the STK client

Run `build.sh` to build the STK client using [webpack](https://webpack.js.org/).

After building, you will have in `build` the main STK client library and various other bundles
that you can include in your webpage.

```
  STK-core.bundle.js    # Core STK client bundle (no UI elements, can be used in headless mode)
  STK.bundle.js         # STK bundle to be used in webpages 
```

Example of using `STK.SimpleModelViewer` from `STK.bundle.js`
```html
...
<div id="main">
  <div id="canvas">
  </div>
</div>
...
<script src="https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js"></script>
<script src="https://ajax.googleapis.com/ajax/libs/jqueryui/1.11.4/jquery-ui.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/3.5.12/d3.min.js"></script>
<script src="three.min.js"></script>
<script src="STK.bundle.js"></script>
<script>
  var canvas = document.getElementById('canvas');
  var modelViewer = new STK.SimpleModelViewer({
    container: canvas
  });
  modelViewer.redisplay();
</script>
```

#### Advanced build instructions
* Type `npm install` to get base dependencies
* Run `npm run build` to package the `scene-toolkit` source files
  * Use `NODE_ENV=dev npm run build` to build source maps and have webpack watch for changes.
  * Use `NODE_ENV=prod npm run build` to optimize (including minify) the JS assets.


#### Building the [jsdoc](http://usejsdoc.org/index.html)
- run `npm run jsdoc`
- Open the generated `jsdoc/index.html` page with a browser

#### Directory Structure
```
  # Existing files
  js/                   # Main javascript code
    apps/               # Bundled apps built on top of the STK client library 
       model-scaler/    # Tools for scaling models
       model-tools/     # Tools for annotating model category
       part-annotator/  # Tools for annotating model parts
       scan-net/        # Tools for annotating scans
       scene-viewer/    # Tools for viewing scenes
       taxonomy-viewer/ # Tools for viewing ShapeNet taxonomy
       viz/             # Visualization tools
    lib/                # Main STK library code
    vendor/             # External third-party javascript code used by the STK 
                        #  such as three.js, d3, etc.
    
  # Generated files
  build/             # Output of build
  config/            # Add your configuration here
  jsdoc/             # jsdoc will go here
  node_modules/      # dependent node modules (populated by npm install)
```
