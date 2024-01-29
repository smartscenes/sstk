## Specifying RLSD services

For development task testing, you can specify a specific remote host to use for the `RLSD_HOST`:

In the `/client` folder
```
RLSD_HOST=https://<remote-server-name> NODE_ENV=dev npm run build
```

In the `/server` folder
```
RLSD_HOST=https://<remote-server-name>  npm run watch
```

Note that you can specify the endpoints for the scene wizard and scene manager separately:
In the `/client` folder
```
RLSD_SHAPE_SUGGESTER_ENDPOINT=https://<remote-server-name>/api/wizard/shape_suggester RLSD_POSE_SUGGESTOR_ENDPOINT=https://<remote-server-name>/api/wizard/pose_suggester RLSD_BACKEND_URL_PREFIX=https://<remote-server-name>/rlsd/api/scene-manager/ NODE_ENV=dev npm run build
```

In the `/server` folder
```
RLSD_SHAPE_SUGGESTER_ENDPOINT=https://<remote-server-name>/api/wizard/shape_suggester RLSD_POSE_SUGGESTOR_ENDPOINT=https://<remote-server-name>/api/wizard/pose_suggester RLSD_BACKEND_URL_PREFIX=https://<remote-server-name>/api/scene-manager/ npm run watch
```

## RLSD SceneEditor

Once running, go to:
`https://localhost:8010/rlsd-scene-editor.html?archId=mp3dArch.5LpN3gDmAk7_L0&viewpointSource=mp3dPano`

## RLSD URL Params
- showAllMasks = 1: Shows all masks
- proMode = 1: Enables pro model
- showSearchOptions=1: Show search options


