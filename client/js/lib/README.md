## Directory Structure
```
# Javascript files
Constants.js - Common constants shared by the entire client codebase
PubSub.js - Publisher/Subscriber base class for event notification
STK-core.js - STK core (hook up js classes to STK for shared library between browser and nodejs)
STK.js - STK (with UI components for use in browser)
Viewer3D.js - Base viewer class (handles camera setup, datgui setup, etc)

# Directories
anim - Classes for character animation.  Not much is here yet.
annotate - General helper classes for annotation.  Not much is here yet.
assets - Classes for asset handling.  Currently some of them has too many layers of wrapping and need to be simplified.
audio - Classes for Audio.  Not much is here yet.
capabilities - Add various "capabilities" to models such as being a "Mirror", "VideoPlayer", something that can be "Articulated".  Registration of capabilities allows for programmatic control through the command console of the scene viewer.
controls - Various 3D controls/widgets (handles mouse interactions) for moving objects, rotating objects, creating bbox for querying, etc. 
data - Utilities for specifying data (schema, type information, etc).  Really useful abstraction and should be used more often. 
ds - Basic data structures
editor - 3D editing components 
exporters - Various exporters for different formats (save to GLTF, OBJ, etc).  Many are taken from THREE.js exporters but tweaked so that it would work in ssc (nodejs headless mode).
geo - Geometry utilities/classes
gfx - Graphics classes
interaction-viewer - Shows character interacting in a scene (used for Pigraphs)
io - Utilities for handling Input/Output
loaders - Various loaders for different formats (meshes, architecture files, etc).  Many are taken from THREE.js loaders and need to be updated to be based on the more current versions.  In addition, the loader API need to be made more consistent.
materials
math - Basic math functions
model - 3D model classes
model-viewer - Model viewer
nav - Navigation map
nlp - NLP components (interface to CoreNLP and WordNet)
part-annotator - Base classes and components for the PartAnnotator
parts - Part data structure
query - Query UIs
scene - 3D scene classes
scene-viewer - Scene Viewer
search - Search modules (mostly interfacing with Solr)
shape - Shape utilities (mostly generator for controlled generation of shapes)
sim - Simulator
stats - Statistic utilties (not much there)
taxonomy - Taxonomy Viewers (somewhat old)
ui - Reusable UI Components (manipulating DOM elements)
util - Basic utiity classes
viz - Visualization
```
    
