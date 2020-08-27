import {Action, ChatFormatting, Message, RemoveTranslationAction, Subscriber} from '@quickplaymod/quickplay-actions-js'
import SessionContext from '../SessionContext'
import mysqlPool from '../mysqlPool'
import StateAggregator from '../StateAggregator'
import {getRedis} from '../redis'

class DeleteTranslationSubscriber extends Subscriber {

    async run(action: Action, ctx: SessionContext): Promise<void> {
        if(!ctx.authed || !(await ctx.getIsAdmin())) {
            ctx.sendChatComponentMessage(new Message(
                (await StateAggregator.translateComponent(ctx.data.language as string || 'en_us',
                    'quickplay.noPermission'))
                    .setColor(ChatFormatting.red)
            ))
            return
        }

        const translationKey = action.getPayloadObjectAsString(0)
        const translationLang = action.getPayloadObjectAsString(1)

        try {
            await mysqlPool.query('DELETE FROM translations WHERE `key`=? AND lang=?', [translationKey, translationLang])
            await (await getRedis()).hdel('lang:' + translationLang, translationKey)
            ctx.sendAction(new RemoveTranslationAction(translationKey, translationLang))
        } catch (e) {
            console.error(e)
            ctx.sendChatComponentMessage(new Message(
                (await StateAggregator.translateComponent(ctx.data.language as string || 'en_us',
                    'quickplay.alterTranslationFailed'))
                    .setColor(ChatFormatting.red)
            ))
        }
    }
}

export default DeleteTranslationSubscriber
