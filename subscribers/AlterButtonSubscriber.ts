import {Action, Button, ChatFormatting, Message, SetButtonAction, Subscriber} from '@quickplaymod/quickplay-actions-js'
import SessionContext from '../SessionContext'
import mysqlPool from '../mysqlPool'
import StateAggregator from '../StateAggregator'
import {getRedis} from '../redis'

class AlterButtonSubscriber extends Subscriber {

    async run(action: Action, ctx: SessionContext): Promise<void> {
        if(!ctx.authed || !(await ctx.getIsAdmin())) {
            ctx.sendChatComponentMessage(new Message(
                (await StateAggregator.translateComponent(ctx.data.language as string || 'en_us',
                    'quickplay.noPermission'))
                    .setColor(ChatFormatting.red)
            ))
            return
        }

        const newButtonKey = action.getPayloadObjectAsString(0)
        const newButton = await Button.deserialize(action.getPayloadObjectAsString(1))
        const [buttonRes] = await mysqlPool.query('SELECT * FROM buttons WHERE `key`=?', [newButtonKey])

        const newAvailableOn = newButton.availableOn === undefined ? buttonRes[0].availableOn : newButton.availableOn
        const newAdminOnly = newButton.adminOnly === undefined ? buttonRes[0].adminOnly : newButton.adminOnly
        const newTranslationKey = newButton.translationKey === undefined ? buttonRes[0].translationKey : newButton.translationKey
        const newImageUrl = newButton.imageURL === undefined ? buttonRes[0].imageURL : newButton.imageURL
        const newActions = newButton.actions === undefined ? buttonRes[0].actions : newButton.actions

        // Validation
        let validationFailed = false
        // Keys are required and must be less than 64 chars
        if(!newButton.key || newButton.key.length > 64) {
            validationFailed = true
        }
        // Image urls can only be 512 chars long
        if(newButton.imageURL && newButton.imageURL.length > 512) {
            validationFailed = true
        }
        // Translations are required for buttons
        if(!newButton.translationKey) {
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

        try {
            if(buttonRes.length > 0) {
                await mysqlPool.query('UPDATE buttons SET availableOn=?, translationKey=?, imageURL=?, adminOnly=?, actions=? WHERE `key`=?',
                    [JSON.stringify(newAvailableOn), newTranslationKey, newImageUrl, newAdminOnly, JSON.stringify(newActions), newButtonKey])
            } else {
                await mysqlPool.query('INSERT INTO buttons (`key`, availableOn, translationKey, imageURL, adminOnly, actions) VALUES (?,?,?,?,?,?)',
                    [newButtonKey, JSON.stringify(newAvailableOn), newTranslationKey, newImageUrl, newAdminOnly, JSON.stringify(newActions)])
            }

            const pulledNewButton = await StateAggregator.pullButton(newButtonKey)
            await (await getRedis()).hset('buttons', newButtonKey, JSON.stringify(pulledNewButton))
            ctx.sendAction(new SetButtonAction(pulledNewButton))
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

export default AlterButtonSubscriber
