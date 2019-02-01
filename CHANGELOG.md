# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [0.6.1] - 2019-01-31
### Fixes
- Make sure Simulator opts is updated after configure (fix undefined during check of scene id startWith mp3d)

## [0.6.0] - 2018-09-03
### Fixes
- Preliminary object coloring functionality
- Preliminary semantic segmentation texture support
- Using sstk-metadata v0.5.3 (rendering differences due to basic material use)
- Updated to suncg version v2

## [0.5.3] - 2018-04-25
### Fixes
- Improved downloading and packing of asset metadata
- Fix over-eager cache clearing logic leading to occasional crashes
- Add support for semantic segmentation annotation tool used in ScanNet

## [0.5.2] - 2018-03-25
### Fixes
- Adjust depth buffer unpacking to return zero pixel value when no depth

## [0.5.1] - 2018-03-16
### Fixes
- Robustify room sampling routine
- Fix depth RGBA unpacking

## [0.5.0] - 2017-12-11
### Initial beta release
