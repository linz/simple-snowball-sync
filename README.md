# Simple snowball sync 

Sync folders of data onto a snowball 

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

Syncing can be stopped and started at any time, When resuming the process will use a binary search to find the last uploaded item and compare the file size to make sure it finished uploading.

Useful options:

- `--filter` Filter out files smaller than size (Mb) `--filter 1` only upload files > 1MB
- `--concurrency` Number of files to upload at a single time 
- `--verbose` Log every file that has been uploaded