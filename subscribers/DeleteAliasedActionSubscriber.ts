import {
    Action,
    ChatFormatting,
    DeleteAliasedActionAction,
    Message,
    Subscriber
} from '@quickplaymod/quickplay-actions-js'
import SessionContext from '../SessionContext'
import mysqlPool from '../mysqlPool'
import StateAggregator from '../StateAggregator'
import {getRedis} from '../redis'
import * as WebSocket from 'ws'

class DeleteAliasedActionSubscriber extends Subscriber {

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

        const aaKey = action.getPayloadObjectAsString(0)

        try {
            await mysqlPool.query('DELETE FROM aliased_actions WHERE `key`=?', [aaKey])
            const redis = await getRedis()
            await redis.hdel('aliasedActions', aaKey)
            await redis.publish('list-change', DeleteAliasedActionAction.id + ',' + aaKey)
        } catch (e) {
            console.error(e)
            ctx.sendChatComponentMessage(new Message(
                (await StateAggregator.translateComponent(ctx.data.language as string || 'en_us',
                    'quickplay.alterAliasedActionFailed'))
                    .setColor(ChatFormatting.red)
            ))
        }
    }
}

export default DeleteAliasedActionSubscriber
