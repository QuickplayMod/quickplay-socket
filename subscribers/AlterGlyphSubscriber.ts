import {Action, ChatFormatting, Glyph, Message, Subscriber} from '@quickplaymod/quickplay-actions-js'
import SessionContext from '../SessionContext'
import StateAggregator from '../StateAggregator'
import mysqlPool from '../mysqlPool'
import {RowDataPacket} from 'mysql2'
import sns from '../sns'
import * as validURL from 'valid-url'
import axios from 'axios'
import * as sharp from 'sharp'
import {createHash} from 'crypto'
import GlyphTooLargeError from '../exceptions/GlyphTooLargeError'
import GlyphUnknownFiletypeError from '../exceptions/GlyphUnknownFiletypeError'
import GlyphWrongFiletypeError from '../exceptions/GlyphWrongFiletypeError'
import GlyphInvalidURLError from '../exceptions/GlyphInvalidURLError'
import {ShareServiceClient, StorageSharedKeyCredential} from '@azure/storage-file-share'
import {getRedis} from '../redis'

class AlterGlyphSubscriber extends Subscriber {
    /**
     * Max number of bytes allowed in an image
     * @type {number}
     */
    static maxImageSize = 1000000;
    /**
     * X by Y dimensions that glyphs should be
     * @type {number}
     */
    static imageDimensions = 400;

    async run(action: Action, ctx: SessionContext): Promise<void> {
        let isAdmin
        // User is required to be both authed and either an admin or a premium user to alter glyphs.
        if(!ctx.authed || !(isAdmin = await ctx.getIsAdmin() || await ctx.getIsPremium())) {
            ctx.sendChatComponentMessage(new Message(
                (await StateAggregator.translateComponent(ctx.data.language as string || 'en_us',
                    'quickplay.noPermission'))
                    .setColor(ChatFormatting.red)
            ))
            return
        }

        try {
            const json = action.getPayloadObjectAsString(0)
            const obj = JSON.parse(json)

            if(!obj) {
                console.warn('Warning: received object in AlterGlyphAction from account ' + ctx.accountId +
                    ' is false-y.')
                ctx.sendChatComponentMessage(new Message(
                    (await StateAggregator.translateComponent(ctx.data.language as string || 'en_us',
                        'quickplay.commands.quickplay.premium.glyph.error'))
                        .setColor(ChatFormatting.red)
                ))
                return
            }

            const uuid = await ctx.getMinecraftUuid()
            if(!obj.uuid || typeof obj.uuid != 'string') {
                console.warn('Warning: Received UUID in AlterGlyphAction from account ' + ctx.accountId +
                    ' is improper format.')
                ctx.sendChatComponentMessage(new Message(
                    (await StateAggregator.translateComponent(ctx.data.language as string || 'en_us',
                        'quickplay.commands.quickplay.premium.glyph.error'))
                        .setColor(ChatFormatting.red)
                ))
                return
            }
            obj.uuid = obj.uuid.replace(/-/g, '')
            // Only admins are able to edit glyphs of other accounts.
            if(!isAdmin && uuid != obj.uuid) {
                ctx.sendChatComponentMessage(new Message(
                    (await StateAggregator.translateComponent(ctx.data.language as string || 'en_us',
                        'quickplay.noPermission'))
                        .setColor(ChatFormatting.red)
                ))
                return
            }

            await AlterGlyphSubscriber.alterGlyph(obj)

            ctx.sendChatComponentMessage(new Message(
                (await StateAggregator.translateComponent(ctx.data.language as string || 'en_us',
                    'quickplay.commands.quickplay.premium.glyph.complete'))
                    .setColor(ChatFormatting.green)
            ))

        } catch(e) {
            console.error(e)
            ctx.sendChatComponentMessage(new Message(
                (await StateAggregator.translateComponent(ctx.data.language as string || 'en_us',
                    'quickplay.commands.quickplay.premium.glyph.error'))
                    .setColor(ChatFormatting.red)
            ))
        }
    }

    /**
     * Take an input object received by this subscriber and alter the relevant glyph in the database.
     * @param obj Object containing the relevant edit data. Required to be a non-null object with a property 'uuid'
     *   which is a 32-character string.
     * @private
     */
    private static async alterGlyph(obj): Promise<void> {
        const glyph = new Glyph()
        glyph.uuid = obj.uuid

        // Load the current data if it exists, otherwise load the defaults.
        const [currentGlyphRes] = <RowDataPacket[]> await mysqlPool
            .query('SELECT * FROM glyphs WHERE uuid = ?', [obj.uuid])
        if(currentGlyphRes.length > 0 && currentGlyphRes[0]) {
            glyph.displayInGames = currentGlyphRes[0].displayInGames
            glyph.height = currentGlyphRes[0].height
            glyph.path = currentGlyphRes[0].path
            glyph.yOffset = currentGlyphRes[0].yOffset
        } else {
            glyph.displayInGames = true
            glyph.height = 20
            glyph.path = ''
            glyph.yOffset = 0
        }

        if(obj.displayInGames != null) {
            glyph.displayInGames = !!obj.displayInGames
        }
        if(obj.height != null) {
            glyph.height = parseInt(obj.height)
            // Use default value if provided value is not a number
            if(isNaN(glyph.height)) {
                glyph.height = 20
            }
        }
        if(obj.yOffset != null) {
            glyph.yOffset = parseFloat(obj.yOffset)
            // Use default value if provided value is not a number
            if(isNaN(glyph.yOffset)) {
                glyph.yOffset = 0
            }
        }
        if(obj.path != null) {
            glyph.path = obj.path.toString()

            const filename = await this.fetchAndUploadGlyph(glyph.path)
            const url = process.env.GLYPH_PROXY + filename
            glyph.path = filename

            // Send text alert
            if(process.env.GLYPH_SNS_ALERTS) {
                sns.publish('New glyph needs approval. \n Glyph: ' + url)
                    .catch(console.error)
            }
        }

        // Update if a glyph already exists - Create otherwise.
        if(currentGlyphRes.length > 0) {
            await mysqlPool.query('UPDATE glyphs SET height=?,yOffset=?,path=?,displayInGames=?, needsReview=? WHERE uuid=?',
                [glyph.height, glyph.yOffset, glyph.path, glyph.displayInGames, !!obj.path, glyph.uuid])
        } else {
            await mysqlPool.query('INSERT INTO glyphs (uuid, height, yOffset, path, displayInGames) VALUES (?,?,?,?,?)',
                [glyph.uuid, glyph.height, glyph.yOffset, glyph.path, glyph.displayInGames])
        }

        const redis = await getRedis()
        const glyphJson = JSON.stringify(glyph)
        await redis.hset('glyphs', glyph.uuid, glyphJson)
        await redis.publish('glyph-updates', glyphJson)
    }

    /**
     * Validate the passed URL, and if valid, set it as the user's new Glyph.
     * @param url URL of the new Glyph.
     * @returns {Promise}
     */
    private static async fetchAndUploadGlyph(url): Promise<string> {
        if(!validURL.is_web_uri(url)) {
            throw new GlyphInvalidURLError()
        }

        // Send HEAD request to get content-length and content-type.
        // Content-type is required, but content-length is not.
        const head = await axios.head(url)

        if(head && head.headers && head.headers['content-length'] &&
            head.headers['content-length'] > this.maxImageSize) {
            throw new GlyphTooLargeError()
        }
        if(!head || !head.headers || !head.headers['content-type']) {
            throw new GlyphUnknownFiletypeError()
        }
        if(!['image/png', 'image/jpeg', 'image/jpg'].includes(head.headers['content-type'])) {
            throw new GlyphWrongFiletypeError()
        }

        // Send request to image itself to check image size
        const imgDownload = await axios.get(url, {
            responseType: 'stream',
            maxContentLength: this.maxImageSize
        })

        const imgData = await new Promise<Buffer>((resolve, reject) => {
            let buf = Buffer.alloc(0)
            imgDownload.data.on('data', (chunk) => {
                buf = Buffer.concat([buf, chunk])
            })
            imgDownload.data.on('end', () => resolve(buf))
            imgDownload.data.on('error', reject)
        })

        // Authenticate with Azure file storage for file upload
        const account = process.env.AZURE_ACCOUNT_NAME || ''
        const accountKey = process.env.AZURE_ACCOUNT_KEY || ''
        const sharedKeyCredential = new StorageSharedKeyCredential(account, accountKey)
        const serviceClient = new ShareServiceClient(
            // When using AnonymousCredential, following url should include a valid SAS
            `https://${account}.file.core.windows.net`,
            sharedKeyCredential
        )
        const directoryClient = serviceClient.getShareClient('glyphs').getDirectoryClient('')

        const fileHash = createHash('sha256').update(imgData).digest('hex')
        const fileName = fileHash + '.png'
        const fileClient = directoryClient.getFileClient(fileName)

        // To sterilize image, resize it to be +1 pixels, pixels, and then back to +0 pixels. This forces a
        // resize regardless of whether the image is already +0 x +0 or not.
        const finalImg: Buffer = await sharp(imgData).resize(this.imageDimensions + 1, this.imageDimensions + 1, {
            kernel: sharp.kernel.nearest,
            fit: 'fill'
        }).resize(this.imageDimensions, this.imageDimensions, {fit: 'fill'})
            .toFormat('png')
            .toBuffer()

        await fileClient.create(finalImg.length)
        await fileClient.uploadData(finalImg)

        return fileName
    }
}

export default AlterGlyphSubscriber
