import {Action, ChatFormatting, Message, Subscriber} from '@quickplaymod/quickplay-actions-js'
import SessionContext from '../SessionContext'
import mysqlPool from '../mysqlPool'
import StateAggregator from '../StateAggregator'
import {getRedis} from '../redis'
import RemoveAliasedActionAction
    from '@quickplaymod/quickplay-actions-js/dist/actions/clientbound/RemoveAliasedActionAction'

class DeleteAliasedActionSubscriber extends Subscriber {

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
            await (await getRedis()).hdel('aliasedActions', aaKey)
            ctx.sendAction(new RemoveAliasedActionAction(aaKey))
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
