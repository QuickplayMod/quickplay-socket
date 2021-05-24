import {Action, ChatFormatting, Message, Subscriber} from '@quickplaymod/quickplay-actions-js'
import SessionContext from '../SessionContext'
import StateAggregator from '../StateAggregator'
import mysqlPool from '../mysqlPool'
import {getRedis} from '../redis'

class DeleteGlyphSubscriber extends Subscriber {

    async run(action: Action, ctx: SessionContext): Promise<void> {
        let isAdmin
        // User is required to be both authed and either an admin or a premium user to delete glyphs.
        if(!ctx.authed || !(isAdmin = await ctx.getIsAdmin() || await ctx.getIsPremium())) {
            ctx.sendChatComponentMessage(new Message(
                (await StateAggregator.translateComponent(ctx.data.language as string || 'en_us',
                    'quickplay.noPermission'))
                    .setColor(ChatFormatting.red)
            ))
            return
        }

        try {
            let givenUuid = action.getPayloadObjectAsString(0)

            if(!givenUuid || typeof givenUuid != 'string') {
                console.warn('Warning: Received UUID in AlterGlyphAction from account ' + ctx.accountId +
                    ' is improper format.')
                ctx.sendChatComponentMessage(new Message(
                    (await StateAggregator.translateComponent(ctx.data.language as string || 'en_us',
                        'quickplay.commands.quickplay.premium.glyph.error'))
                        .setColor(ChatFormatting.red)
                ))
                return
            }

            const ctxUuid = await ctx.getMinecraftUuid()
            givenUuid = givenUuid.replace(/-/g, '')

            // Only admins are able to edit glyphs of other accounts.
            if(!isAdmin && (!ctxUuid || ctxUuid != givenUuid)) {
                ctx.sendChatComponentMessage(new Message(
                    (await StateAggregator.translateComponent(ctx.data.language as string || 'en_us',
                        'quickplay.noPermission'))
                        .setColor(ChatFormatting.red)
                ))
                return
            }

            await DeleteGlyphSubscriber.deleteGlyph(ctxUuid)

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
     * Delete the Glyph belonging to the passed UUID
     * @param uuid UUID ofthe account whose glyph should be deleted.
     * @private
     */
    private static async deleteGlyph(uuid: string): Promise<void> {
        await mysqlPool.query('DELETE FROM glyphs WHERE uuid=?', [uuid])

        const redis = await getRedis()
        await redis.hdel('glyphs', uuid)
        await redis.publish('glyph-removals', uuid)
    }
}

export default DeleteGlyphSubscriber
