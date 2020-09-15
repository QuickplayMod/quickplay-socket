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
            const [aliasedActionRes] = await mysqlPool.query('SELECT * FROM aliased_actions WHERE `key`=?', [aaKey])
            await mysqlPool.query('DELETE FROM aliased_actions WHERE `key`=?', [aaKey])

            // Log the edit to the edit log
            await mysqlPool.query('INSERT INTO edit_log (edited_by, item_type, item_key, deleted, prev_version) \
                VALUES (?,?,?,?,?)', [ctx.accountId, 'aliased_action', aaKey, true, JSON.stringify(aliasedActionRes[0])])


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
