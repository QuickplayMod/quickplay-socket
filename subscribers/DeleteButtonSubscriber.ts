import {Action, ChatFormatting, DeleteButtonAction, Message, Subscriber} from '@quickplaymod/quickplay-actions-js'
import SessionContext from '../SessionContext'
import mysqlPool from '../mysqlPool'
import StateAggregator from '../StateAggregator'
import {getRedis} from '../redis'

class DeleteButtonSubscriber extends Subscriber {

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
            const [buttonRes] = await mysqlPool.query('SELECT * FROM buttons WHERE `key`=?', [buttonKey])
            await mysqlPool.query('DELETE FROM buttons WHERE `key`=?', [buttonKey])

            // Log the edit to the edit log
            await mysqlPool.query('INSERT INTO edit_log (edited_by, item_type, item_key, deleted, prev_version) \
                VALUES (?,?,?,?,?)', [ctx.accountId, 'button', buttonKey, true, JSON.stringify(buttonRes[0])])

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
