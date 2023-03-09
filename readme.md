# About

This package makes uploading files to S3 very simple by providing helper functions

<br/><br/>

# How to use

You can set the following environment variables. Alternatively, you can pass the config to the function directly.

    FILES_S3_BUCKET="Bucket name"
    FILES_S3_REGION="Region"

<br/><br/>

# Example

    import { uploadFile } from '@404-software/s3-upload'

    const imageUrl = await uploadFile({
      folder: 'users-images',
      file,
      config: {
        bucket: 'MY-S3-BUCKET',
        region: 'me-south-1'
      }, // ONLY if env var not set
    })
