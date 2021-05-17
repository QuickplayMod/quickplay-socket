import {Action, AlterRegexAction, ChatFormatting, Message, Subscriber} from '@quickplaymod/quickplay-actions-js'
import SessionContext from '../SessionContext'
import mysqlPool from '../mysqlPool'
import StateAggregator from '../StateAggregator'
import {getRedis} from '../redis'
import {RowDataPacket} from 'mysql2'

class AlterRegexSubscriber extends Subscriber {

    async run(action: Action, ctx: SessionContext): Promise<void> {
        if(!ctx.authed || !(await ctx.getIsAdmin())) {
            ctx.sendChatComponentMessage(new Message(
                (await StateAggregator.translateComponent(ctx.data.language as string || 'en_us',
                    'quickplay.noPermission'))
                    .setColor(ChatFormatting.red)
            ))
            return
        }

        const newRegexKey = action.getPayloadObjectAsString(0)
        const newRegexValue = action.getPayloadObjectAsString(1)


        // Validation
        let validationFailed = false
        // Keys are required and must be less than or equal to 256 chars
        if(!newRegexKey || newRegexKey.length > 256) {
            validationFailed = true
        }
        // Value is required and must be less than or equal to 16000 characters
        if(!newRegexValue || newRegexValue.length > 16000) {
            validationFailed = true
        }

        if(validationFailed) {
            ctx.sendChatComponentMessage(new Message(
                (await StateAggregator.translateComponent(ctx.data.language as string || 'en_us',
                    'quickplay.noPermission'))
                    .setColor(ChatFormatting.red)
            ))
            return
        }

        const [regexRes] = <RowDataPacket[]> await mysqlPool.query(
            'SELECT * FROM regexes WHERE `key`=?', [newRegexKey])
        try {
            if(regexRes.length > 0) {
                await mysqlPool.query('UPDATE regexes SET value=? WHERE `key`=?',
                    [newRegexValue, newRegexKey])
            } else {
                await mysqlPool.query('INSERT INTO regexes (`key`, value) VALUES (?,?)',
                    [newRegexKey, newRegexValue])
            }

            // Log the edit to the edit log
            await mysqlPool.query('INSERT INTO edit_log (edited_by, item_type, item_key, deleted, prev_version) \
                VALUES (?,?,?,?,?)', [ctx.accountId, 'regex', newRegexKey, false,
                JSON.stringify(regexRes[0])])


            const redis = await getRedis()
            await redis.hset('regexes', newRegexKey, newRegexValue)
            await redis.publish('list-change',
                AlterRegexAction.id + ',' + newRegexKey)
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

export default AlterRegexSubscriber
