import {Action, AlterTranslationAction, ChatFormatting, Message, Subscriber} from '@quickplaymod/quickplay-actions-js'
import SessionContext from '../SessionContext'
import mysqlPool from '../mysqlPool'
import StateAggregator from '../StateAggregator'
import {getRedis} from '../redis'

class AlterTranslationSubscriber extends Subscriber {

    async run(action: Action, ctx: SessionContext): Promise<void> {
        if(!ctx.authed || !(await ctx.getIsAdmin())) {
            ctx.sendChatComponentMessage(new Message(
                (await StateAggregator.translateComponent(ctx.data.language as string || 'en_us',
                    'quickplay.noPermission'))
                    .setColor(ChatFormatting.red)
            ))
            return
        }

        const newTranslationKey = action.getPayloadObjectAsString(0)
        const newTranslationLang = action.getPayloadObjectAsString(1).toLowerCase()
        const newTranslationValue = action.getPayloadObjectAsString(2)


        // Validation
        let validationFailed = false
        // Keys are required and must be less than 256 chars
        if(!newTranslationKey || newTranslationKey.length > 256) {
            validationFailed = true
        }
        // Language is required and must be less than 16 characters
        if(!newTranslationLang || newTranslationLang.length > 16) {
            validationFailed = true
        }
        // Commas are not allowed in translation keys or langs
        if(newTranslationKey.includes(',') || newTranslationLang.includes(',')) {
            validationFailed = true
        }
        // Translation values are required and must be less than 512 chars
        if(!newTranslationValue || newTranslationValue.length > 512) {
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

        const [translationRes] = await mysqlPool.query('SELECT * FROM translations WHERE `key`=? AND lang=?',
            [newTranslationKey, newTranslationLang])
        try {
            if(translationRes.length > 0) {
                await mysqlPool.query('UPDATE translations SET value=? WHERE `key`=? AND lang=?',
                    [newTranslationValue, newTranslationKey, newTranslationLang])
            } else {
                await mysqlPool.query('INSERT INTO translations (`key`, lang, value) VALUES (?,?,?)',
                    [newTranslationKey, newTranslationLang, newTranslationValue])
            }

            const redis = await getRedis()
            await redis.hset('lang:' + newTranslationLang, newTranslationKey, newTranslationValue)
            await redis.publish('list-change',
                AlterTranslationAction.id + ',' + newTranslationKey + ',' + newTranslationLang)
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

export default AlterTranslationSubscriber
