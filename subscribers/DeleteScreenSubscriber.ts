import {Action, ChatFormatting, DeleteScreenAction, Message, Subscriber} from '@quickplaymod/quickplay-actions-js'
import SessionContext from '../SessionContext'
import mysqlPool from '../mysqlPool'
import StateAggregator from '../StateAggregator'
import {getRedis} from '../redis'
import * as WebSocket from 'ws'

class DeleteScreenSubscriber extends Subscriber {

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

        const screenKey = action.getPayloadObjectAsString(0)

        try {
            await mysqlPool.query('DELETE FROM screens WHERE `key`=?', [screenKey])
            const redis = await getRedis()
            await redis.hdel('screens', screenKey)
            await redis.publish('list-change', DeleteScreenAction.id + ',' + screenKey)
        } catch (e) {
            console.error(e)
            ctx.sendChatComponentMessage(new Message(
                (await StateAggregator.translateComponent(ctx.data.language as string || 'en_us',
                    'quickplay.alterScreenFailed'))
                    .setColor(ChatFormatting.red)
            ))
        }
    }
}

export default DeleteScreenSubscriber
