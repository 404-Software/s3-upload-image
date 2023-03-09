import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import fs from 'fs'
import stream from 'stream'

const client = new S3Client({ region: 'me-south-1' })

const FILES_S3_BUCKET = process.env.FILES_S3_BUCKET

function getFileKey(key: string) {
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
	const Bucket = FILES_S3_BUCKET || bucket

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
	file: File
	oldFile?: string | null
	bucket?: string
}

export const singleUpload = async ({
	folder,
	file,
	oldFile,
	bucket,
}: SingleUpload) => {
	if (typeof file === 'string') return file

	if (!file?.file) {
		if (oldFile) return oldFile

		throw Error('MALFORMED_INPUT: No file provided')
	}

	const { createReadStream } = file.file

	const { Location } = await uploadStream({
		readableStream: createReadStream(),
		filename: file.file.filename,
		folder,
		bucket,
	})

	return Location
}

export interface MultiUpload {
	folder: string
	files: Array<string | File>
	oldFiles?: string[]
	bucket?: string
}

export const multiUpload = async ({
	folder,
	files,
	oldFiles,
	bucket,
}: MultiUpload) => {
	const newFiles = await Promise.all(
		files.map(async file => {
			if (typeof file === 'string') return file

			const { createReadStream } = file.file

			return new Promise<string>((resolve, reject) =>
				uploadStream({
					readableStream: createReadStream(),
					folder,
					filename: file.file.filename,
					bucket,
				}).then(({ Location }) =>
					Location ? resolve(Location) : reject('error'),
				),
			)
		}),
	)

	await deleteFiles({
		files: oldFiles?.filter(file => !newFiles.includes(file)),
		bucket,
	})

	return newFiles
}

interface DeleteFile {
	file?: string | null
	bucket?: string
}

export const deleteFile = async ({ file, bucket }: DeleteFile) => {
	if (!file) return

	const key = getFileKey(file)

	const command = new DeleteObjectCommand({
		Bucket: bucket,
		Key: key,
	})

	await client.send(command)
}

export interface DeleteFiles {
	files?: Array<string | undefined>
	bucket?: string
}

export const deleteFiles = async ({ files, bucket }: DeleteFiles) => {
	if (!files) return

	files.forEach(async file => {
		if (!file) return

		await deleteFile({ file, bucket })
	})
}

type File =
	| {
			file: { createReadStream: () => fs.ReadStream; filename: string }
	  }
	| string
