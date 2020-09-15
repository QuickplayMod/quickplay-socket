import {Action, ChatFormatting, DeleteScreenAction, Message, Subscriber} from '@quickplaymod/quickplay-actions-js'
import SessionContext from '../SessionContext'
import mysqlPool from '../mysqlPool'
import StateAggregator from '../StateAggregator'
import {getRedis} from '../redis'

class DeleteScreenSubscriber extends Subscriber {

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
            const [screenRes] = await mysqlPool.query('SELECT * FROM screens WHERE `key`=?', [screenKey])
            await mysqlPool.query('DELETE FROM screens WHERE `key`=?', [screenKey])

            // Log the edit to the edit log
            await mysqlPool.query('INSERT INTO edit_log (edited_by, item_type, item_key, deleted, prev_version) \
                VALUES (?,?,?,?,?)', [ctx.accountId, 'screen', screenKey, true, JSON.stringify(screenRes[0])])

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
