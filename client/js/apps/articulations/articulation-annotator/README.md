## Articulation Annotator

The general setup of the code is as follows:

* Part annotations and model loaded in `initScene()` and `displayParts()` respectively (the former calls the latter). Request is also made to `/articulation-annotations/load-annotations` to load any existing annotations.
* Scene is set up and model is divided up into `n` separate meshes where `n` is number of parts-- `this.parts` is an array of all these meshes. Each has a `pid` which is essentially just its index in this array.
* Request is also made to `/articulation-annotations/load-hierarchy` in `createConnectivityGraph()` to load the part hierarchy; if it doesn't exist, it is generated and then stored in the database.

When you select a part to annotate, the following more or less happens:
* Part hierarchy is generated with selected part as root in `setChildren()`
	* Children are updated when user changes base parts in `updateChildren()`
* Axis options are generated using OBB from OBBFitter (see `setAxisOptions()`, `suggestAxis()`)
* Controls displayed for the user to specify base parts, axis, axis range, etc. (see `displayStartDialog()`, `displayBaseOptions()`, `displayRotationAxisOptions()`, `displayTranslationAxisOptions()`)

### URL

The annotator can be accessed from [http://localhost:8010/motion-annotator](http://localhost:8010/motion-annotator). The following URL arguments are accepted:
* `modelId`: by accepted, I mean this is basically required right now
* `reset`: accepts a boolean to indicate whether to force regenerate part hierarchy even if it already exists

### Server side

The server side code can be found in `server/proj/articulations`.
Code for connectiong to the database can be found in `sqlArticulationAnnotationDb.js`. If it is your first time running don't forget to initalize the database/tables. Unfortunately I never wrote something fancy for this; rather I just run `run()` at the bottom of the class as a script. 

#### Special Notice for Viscompchat
The Viscompchat VM uses the MariaDB client which apparently means the NodeJS `mysql` driver doesn't work (or at least, I couldn't get it to after many _years_ of trying...) It turns out you need to use the `mariadb` package in _Node_.

Run `npm install mariadb`. Replace the following line in `sqlArticulationAnnotationDb.js`:

```const mysql = require('mysql');```

with the following:

```const mysql = require('mariadb/callback');```

Using the callback package keeps the syntax more or less the same.
