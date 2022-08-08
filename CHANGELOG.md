## [1.4.1](https://github.com/linz/simple-snowball-sync/compare/v1.4.0...v1.4.1) (2022-08-08)


### Features

* include caller accountId ([4aefcc6](https://github.com/linz/simple-snowball-sync/commit/4aefcc6ef0bb6d799ef063d1bf2e12fa5234df85))



# [1.4.0](https://github.com/linz/simple-snowball-sync/compare/v1.3.2...v1.4.0) (2022-08-08)


### Features

* standardise the logging across all the commands ([#487](https://github.com/linz/simple-snowball-sync/issues/487)) ([21617b3](https://github.com/linz/simple-snowball-sync/commit/21617b33b782ab56e33bb543d66bf4e814c0d5fd))
* **log:** sync logs to aws s3 if permission is enabled ([#486](https://github.com/linz/simple-snowball-sync/issues/486)) ([f91df09](https://github.com/linz/simple-snowball-sync/commit/f91df09e8ade0069912fac6efc185968602aea75))
* **sync:** force --scan after upload completes to validate everything was uploaded ([#483](https://github.com/linz/simple-snowball-sync/issues/483)) ([c545c66](https://github.com/linz/simple-snowball-sync/commit/c545c662266400e9231bbbf2580633558987c416))
* replace oclif with cmd-ts as oclif  ([#482](https://github.com/linz/simple-snowball-sync/issues/482)) ([829ed69](https://github.com/linz/simple-snowball-sync/commit/829ed699c0e51d4f1394910c480c4d67a805e32b))



## [1.3.2](https://github.com/linz/simple-snowball-sync/compare/v1.3.1...v1.3.2) (2022-02-02)


### Bug Fixes

* throw errors rather than quitting the sync ([3662cf5](https://github.com/linz/simple-snowball-sync/commit/3662cf5d9ebabfe6c8a2474c353168f5aa1b64c5))



## [1.3.1](https://github.com/linz/simple-snowball-sync/compare/v1.3.0...v1.3.1) (2022-02-02)


### Bug Fixes

* allow rename to fail upto three times before crashing the application ([#320](https://github.com/linz/simple-snowball-sync/issues/320)) ([d5dbe33](https://github.com/linz/simple-snowball-sync/commit/d5dbe335ee80f16dc26d75cb4f8af9ffcd84d68c))



# [1.3.0](https://github.com/linz/simple-snowball-sync/compare/v1.2.0...v1.3.0) (2021-11-02)


### Bug Fixes

* **sync:** correctly upload unhashed files ([#186](https://github.com/linz/simple-snowball-sync/issues/186)) ([6f9379c](https://github.com/linz/simple-snowball-sync/commit/6f9379c6c799104f4a144ba6e2722c28f3e325c5))
* upload all files that are missing a SRI hash inside the manifest ([#112](https://github.com/linz/simple-snowball-sync/issues/112)) ([22cd735](https://github.com/linz/simple-snowball-sync/commit/22cd73532bcb09e5c8f3ca82e6719379cec62532))


### Features

* **validate:** do not hash the files when validating by default ([0bb1223](https://github.com/linz/simple-snowball-sync/commit/0bb12232e6e9fb09bdefa6132049bd6deedca3dc))
* manually configure buckets using a config object ([#90](https://github.com/linz/simple-snowball-sync/issues/90)) ([6478476](https://github.com/linz/simple-snowball-sync/commit/6478476a9fa80b204a207d32f984cab4f0e66da0))
* upload retries 3 times in case of issue ([#101](https://github.com/linz/simple-snowball-sync/issues/101)) ([8345fba](https://github.com/linz/simple-snowball-sync/commit/8345fba3eaf71a32ca862897ee0d6ab0427b085a))



# [1.2.0](https://github.com/linz/simple-snowball-sync/compare/v1.1.0...v1.2.0) (2021-07-12)


### Bug Fixes

* **validate:** do not ignore 0 byte files ([d401447](https://github.com/linz/simple-snowball-sync/commit/d401447a5de572370d8c8725fb5b83098521cf10))
* write to the main manifest file too but keep a backup ([cbf58a9](https://github.com/linz/simple-snowball-sync/commit/cbf58a9d537e65fd46588c12ff66396c84c0cf04))


### Features

* only load the backup manifest if the manifest is corrupt ([5dcf73e](https://github.com/linz/simple-snowball-sync/commit/5dcf73e57ff4bfbdd5115e15fe3ef97c6a340cdf))
* **sync:** hash any file that is missing a hash ([2ce4843](https://github.com/linz/simple-snowball-sync/commit/2ce48439df4be672d394133ea1514afd366c8437))
* **sync:** increase search range to validate all files have actually been uploaded ([eb58689](https://github.com/linz/simple-snowball-sync/commit/eb586895b1e20cada7702aa5fb2d04d34f16dbd4))
* **sync:** introduce --scan to scan the target location and look for missing files ([e99d4e2](https://github.com/linz/simple-snowball-sync/commit/e99d4e202c2764a4bc5f7f694f851f89f77ea2e6))



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



