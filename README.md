# Simple snowball sync 

Sync folders of data onto a snowball 

Features:
- Start and stop the process at any stage
- Compute [SRI](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity) sha256 hash of all files and stored inside of the snowball in a manifiest.json
- Compress small files into a tar.gz so snowball can [batch extract](https://docs.aws.amazon.com/snowball/latest/developer-guide/batching-small-files.html) when importing into s3
- Validate uploaded files against the computed hash

## Manifest
Create a list of files to be synced 

```bash
sss manifest /media/$USER/external-drive
```

## Sync
Start the syncing processes

```bash
sss sync manifest.json --endpoint 10.254.32.104 --target s3://linz-snowball-a/drive1
```

Syncing can be stopped and started at any time

Options:

- `--filter` Files under this limit will be compressed into a `.tar.gz` and uploaded using the [snowball batching](https://docs.aws.amazon.com/snowball/latest/developer-guide/batching-small-files.html) (Mb) `--filter 1` only directly upload files > 1MB
- `--concurrency` Number of files to upload at a single time 
- `--verbose` More verbose logging