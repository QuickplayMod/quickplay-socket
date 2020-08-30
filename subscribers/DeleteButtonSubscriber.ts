import {Action, ChatFormatting, DeleteButtonAction, Message, Subscriber} from '@quickplaymod/quickplay-actions-js'
import SessionContext from '../SessionContext'
import mysqlPool from '../mysqlPool'
import StateAggregator from '../StateAggregator'
import {getRedis} from '../redis'
import * as WebSocket from 'ws'

class DeleteButtonSubscriber extends Subscriber {

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

        const buttonKey = action.getPayloadObjectAsString(0)

        try {
            await mysqlPool.query('DELETE FROM buttons WHERE `key`=?', [buttonKey])
            const redis = await getRedis()
            await redis.hdel('buttons', buttonKey)
            await redis.publish('list-change', DeleteButtonAction.id + ',' + buttonKey)
        } catch (e) {
            console.error(e)
            ctx.sendChatComponentMessage(new Message(
                (await StateAggregator.translateComponent(ctx.data.language as string || 'en_us',
                    'quickplay.alterButtonFailed'))
                    .setColor(ChatFormatting.red)
            ))
        }
    }
}

export default DeleteButtonSubscriber
