import {Action, ChatFormatting, DeleteTranslationAction, Message, Subscriber} from '@quickplaymod/quickplay-actions-js'
import SessionContext from '../SessionContext'
import mysqlPool from '../mysqlPool'
import StateAggregator from '../StateAggregator'
import {getRedis} from '../redis'
import * as WebSocket from 'ws'

class DeleteTranslationSubscriber extends Subscriber {

    ws: WebSocket.Server

    constructor(websocket: WebSocket.Server) {
        super()
        this.ws = websocket
    }

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
            const redis = await getRedis()
            await redis.hdel('lang:' + translationLang, translationKey)
            await redis.publish('list-change',
                DeleteTranslationAction.id + ',' + translationKey + ',' + translationLang)
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
