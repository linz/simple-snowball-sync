# [1.1.0](https://github.com/linz/simple-snowball-sync/compare/v1.0.1...v1.1.0) (2021-07-06)


### Bug Fixes

* **validate:** force listing with a trailing slash to prevent extra matches ([841f8f8](https://github.com/linz/simple-snowball-sync/commit/841f8f8f1890d7629719b08f80303f22e8bbd521))
* allow listing really large buckets ([9e6bafa](https://github.com/linz/simple-snowball-sync/commit/9e6bafaab3be961751cf1496ec648bbeb9bd129c))
* allow small files in sample ([1215b15](https://github.com/linz/simple-snowball-sync/commit/1215b15d97e3ec181cd94073bd3940fe7ce5f3e9))
* catch errors and report the paths that failed ([586ec8f](https://github.com/linz/simple-snowball-sync/commit/586ec8f85b0f80c0fd1176399c2816b971f217f3))
* correct validation percentage ([2203ac1](https://github.com/linz/simple-snowball-sync/commit/2203ac148807adaa2bf5c0d69025ef4996cd0976))
* leading/trailing slashes should be removed ([eaa4ce3](https://github.com/linz/simple-snowball-sync/commit/eaa4ce3c6100dfb2e30c475916832c23478b36da))
* log extra files first so everything gets logged ([5044e8d](https://github.com/linz/simple-snowball-sync/commit/5044e8d5ff10adecf5c06efb9b5309d5c78d106a))


### Features

* **sync:** disable tar compression if not uploading to a snowball ([f658714](https://github.com/linz/simple-snowball-sync/commit/f658714011d849a3547b4f4b5f593b207dd30ec5))
* **validate:** reduce verbosity of logging file paths when extra or missing files are found ([a60ca5e](https://github.com/linz/simple-snowball-sync/commit/a60ca5eb6762bbd6dab3790be89625851ce72f3f))
* **validate:** show the full path when files are missing ([0254ecc](https://github.com/linz/simple-snowball-sync/commit/0254ecc16fd064ae3b4429255d44b67913ad7b6f))
* allow fractional percents like 0.5 when validating ([0816cf8](https://github.com/linz/simple-snowball-sync/commit/0816cf8956377c5b5227cd1e73c322d3afd6b23b))
* read/write to local or s3 ([88cf78b](https://github.com/linz/simple-snowball-sync/commit/88cf78bd51bbff71167861baae872f1617b55481))



## [1.0.1](https://github.com/linz/simple-snowball-sync/compare/v1.0.0...v1.0.1) (2021-04-19)



