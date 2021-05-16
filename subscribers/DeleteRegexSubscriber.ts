import {Action, ChatFormatting, DeleteScreenAction, Message, Subscriber} from '@quickplaymod/quickplay-actions-js'
import SessionContext from '../SessionContext'
import mysqlPool from '../mysqlPool'
import StateAggregator from '../StateAggregator'
import {getRedis} from '../redis'

class DeleteRegexSubscriber extends Subscriber {

    async run(action: Action, ctx: SessionContext): Promise<void> {
        if(!ctx.authed || !(await ctx.getIsAdmin())) {
            ctx.sendChatComponentMessage(new Message(
                (await StateAggregator.translateComponent(ctx.data.language as string || 'en_us',
                    'quickplay.noPermission'))
                    .setColor(ChatFormatting.red)
            ))
            return
        }

        const regexKey = action.getPayloadObjectAsString(0)

        try {
            const [regexRes] = await mysqlPool.query('SELECT * FROM regexes WHERE `key`=?', [regexKey])
            await mysqlPool.query('DELETE FROM regexes WHERE `key`=?', [regexKey])

            // Log the edit to the edit log
            await mysqlPool.query('INSERT INTO edit_log (edited_by, item_type, item_key, deleted, prev_version) \
                VALUES (?,?,?,?,?)', [ctx.accountId, 'regex', regexKey, true, JSON.stringify(regexRes[0])])

            const redis = await getRedis()
            await redis.hdel('regexes', regexKey)
            await redis.publish('list-change', DeleteScreenAction.id + ',' + regexKey)
        } catch (e) {
            console.error(e)
            ctx.sendChatComponentMessage(new Message(
                (await StateAggregator.translateComponent(ctx.data.language as string || 'en_us',
                    'quickplay.alterRegexFailed'))
                    .setColor(ChatFormatting.red)
            ))
        }
    }
}

export default DeleteRegexSubscriber
