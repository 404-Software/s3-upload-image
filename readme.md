# About

This package makes uploading files to S3 very simple by providing helper functions

<br/><br/>

# How to use

1- you can set the following environment variables:

    FILES_S3_BUCKET="Bucket name"

alternatively, you can pass the bucket to the function directly.

<br/><br/>

# Example

    import { uploadSingle } from '@404-software/s3-upload'

    const user = ... // GET USER FROM DB

    const userImageUrl = await uploadSingle({
      folder: 'users',
      file,
      oldFile: user.imageUrl, // OPTIONAL, The key will be found automatically
      bucket: 'MY-S3-BUCKET', // ONLY if env var not set
    })
