If you have an archive from MapLiberator, unzip it. Tracks and routes are GPX files, which almost any
map app can open. Waypoints and areas are GeoJSON, which QGIS and most GIS tools read. Photos are
the original files. Apps that can import a whole archive at once, folders and photos included, will
be listed here as they ship.

If you're writing an importer, start with [Reading an archive](#sec-14) and the
[reference reader](https://github.com/mapliberator/extension/blob/main/tools/pma-validate/reader.ts).
[`pma-validate`](https://github.com/mapliberator/extension/tree/main/tools/pma-validate) checks any
archive against this specification and can print its contents as a tree. If you ship an importer,
or something here is unclear, [open an issue](https://github.com/mapliberator/extension/issues).
