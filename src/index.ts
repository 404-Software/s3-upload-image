import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import fs from 'fs'
import stream from 'stream'

const client = new S3Client({ region: 'me-south-1' })

const IMAGES_S3_BUCKET = process.env.IMAGES_S3_BUCKET

function getImageKey(key: string) {
	return key.split('.com/')[1]
}

export interface UploadStream {
	folder: string
	readableStream: fs.ReadStream
	filename: string
	bucket?: string
}

async function uploadStream({
	readableStream,
	folder,
	filename,
	bucket,
}: UploadStream) {
	const Key = `${folder}/${Date.now()}-${filename}`
	const Bucket = IMAGES_S3_BUCKET || bucket

	if (!Bucket) throw new Error('No bucket provided')

	const passThroughStream = new stream.PassThrough()

	const upload = new Upload({
		client,
		params: {
			Bucket,
			Key,
			Body: passThroughStream,
			ACL: 'public-read',
		},
		leavePartsOnError: false,
	})

	readableStream.pipe(passThroughStream)

	type UploadDone = {
		Location: string
		Key: string
	}

	return (await upload.done()) as UploadDone
}

export interface SingleUpload {
	folder: string
	image: Image
	oldImage?: string | null
	bucket?: string
}

export const singleUpload = async ({
	folder,
	image,
	oldImage,
	bucket,
}: SingleUpload) => {
	if (typeof image === 'string') return image

	if (!image?.file) {
		if (oldImage) return oldImage

		throw Error('MALFORMED_INPUT: No image provided')
	}

	const { createReadStream } = image.file

	const { Location } = await uploadStream({
		readableStream: createReadStream(),
		filename: image.file.filename,
		folder,
		bucket,
	})

	return Location
}

export interface MultiUpload {
	folder: string
	images: Array<string | Image>
	oldImages?: string[]
	bucket?: string
}

export const multiUpload = async ({
	folder,
	images,
	oldImages,
	bucket,
}: MultiUpload) => {
	const newImages = await Promise.all(
		images.map(async image => {
			if (typeof image === 'string') return image

			const { createReadStream } = image.file

			return new Promise<string>((resolve, reject) =>
				uploadStream({
					readableStream: createReadStream(),
					folder,
					filename: image.file.filename,
					bucket,
				}).then(({ Location }) =>
					Location ? resolve(Location) : reject('error'),
				),
			)
		}),
	)

	await deleteImages({
		images: oldImages?.filter(image => !newImages.includes(image)),
		bucket,
	})

	return newImages
}

interface DeleteImage {
	image?: string | null
	bucket?: string
}

export const deleteImage = async ({ image, bucket }: DeleteImage) => {
	if (!image) return

	const key = getImageKey(image)

	const command = new DeleteObjectCommand({
		Bucket: bucket,
		Key: key,
	})

	await client.send(command)
}

export interface DeleteImages {
	images?: Array<string | undefined>
	bucket?: string
}

export const deleteImages = async ({ images, bucket }: DeleteImages) => {
	if (!images) return

	images.forEach(async image => {
		if (!image) return

		await deleteImage({ image, bucket })
	})
}

type Image =
	| {
			file: { createReadStream: () => fs.ReadStream; filename: string }
	  }
	| string
