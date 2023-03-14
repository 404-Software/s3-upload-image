import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import fs from 'fs'
import stream from 'stream'

const FILES_S3_BUCKET = process.env.FILES_S3_BUCKET
const FILES_S3_REGION = process.env.FILES_S3_REGION
const FILES_S3_URL = process.env.FILES_S3_URL

function getFileKey(key: string) {
	const split = key.split('.com/')

	return split.length === 2 ? split[1] : key
}

function getExtension(filename: string) {
	return `.${filename.split('.').pop()}`
}

function getRegion(region?: string) {
	const clientRegion = FILES_S3_REGION || region

	if (!clientRegion) throw new Error('No region provided as env var or config')

	return clientRegion
}

function getBucket(bucket?: string) {
	const clientBucket = FILES_S3_BUCKET || bucket

	if (!clientBucket) throw new Error('No bucket provided as env var or config')

	return clientBucket
}

function getUrl(url?: string) {
	const clientUrl = FILES_S3_URL || url

	return clientUrl
}

type Config = {
	region?: string
	bucket?: string
	url?: string
	keepOriginalFilename?: boolean
	keepOriginalUrl?: boolean
}
export interface CreateUploadStream {
	createReadStream: () => fs.ReadStream
	filename: string
	mimetype: string
	folder?: string
	config?: Config
}

type UploadDone = {
	Location: string
	Key: string
}

async function createUploadStream({
	createReadStream,
	filename,
	mimetype,
	folder,
	config,
}: CreateUploadStream) {
	const url = getUrl(config?.url)
	const bucket = getBucket(config?.bucket)

	const passThroughStream = new stream.PassThrough()

	const fileExtension = getExtension(filename)

	const upload = new Upload({
		client: new S3Client({ region: getRegion(config?.region) }),
		params: {
			Bucket: bucket,
			Key: `${folder ? `${folder}/` : ''}${
				config?.keepOriginalFilename
					? filename
					: `${Date.now()}${fileExtension}`
			}`,
			Body: passThroughStream,
			ACL: 'public-read',
			ContentType: mimetype,
		},
		leavePartsOnError: false,
	})

	createReadStream().pipe(passThroughStream)

	const uploaded = (await upload.done()) as UploadDone

	return {
		Location:
			!url || config?.keepOriginalUrl
				? uploaded.Location
				: uploaded.Location.replace(
						`${bucket}.s3.me-south-1.amazonaws.com`,
						url,
				  ),
	}
}

export interface UploadFile {
	file: File
	folder?: string
	config?: Config
}

export const uploadFile = async ({ file, folder, config }: UploadFile) => {
	if (typeof file === 'string') return file

	const { createReadStream, filename, mimetype } = file.file

	const { Location } = await createUploadStream({
		createReadStream,
		filename,
		mimetype,
		folder,
		config,
	})

	return Location
}

export interface UploadFiles {
	files: Array<string | File>
	folder?: string
	config?: Config
}

export const uploadFiles = async ({ files, folder, config }: UploadFiles) =>
	await Promise.all(
		files.map(async file => {
			if (typeof file === 'string') return file

			const { createReadStream, filename, mimetype } = file.file

			return new Promise<string>((resolve, reject) =>
				createUploadStream({
					createReadStream,
					folder,
					filename,
					mimetype,
					config,
				}).then(({ Location }) => (Location ? resolve(Location) : reject())),
			)
		}),
	)

interface DeleteFile {
	file?: string
	config?: Config
}

export const deleteFile = async ({ file, config }: DeleteFile) => {
	if (typeof file !== 'string') return

	const client = new S3Client({ region: getRegion(config?.region) })

	const command = new DeleteObjectCommand({
		Bucket: getBucket(config?.bucket),
		Key: getFileKey(file),
	})

	await client.send(command)
}

export interface DeleteFiles {
	files?: string[]
	config?: Config
}

export const deleteFiles = async ({ files, config }: DeleteFiles) => {
	if (!files) return

	await Promise.all(
		files.map(async file => {
			if (typeof file !== 'string') return

			await deleteFile({ file, config })
		}),
	)
}

type File =
	| {
			file: {
				createReadStream: () => fs.ReadStream
				filename: string
				mimetype: string
			}
	  }
	| string
