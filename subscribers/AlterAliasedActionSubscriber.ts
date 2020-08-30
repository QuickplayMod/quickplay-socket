import {
    Action,
    AliasedAction,
    AlterAliasedActionAction,
    ChatFormatting,
    Message,
    Subscriber
} from '@quickplaymod/quickplay-actions-js'
import SessionContext from '../SessionContext'
import mysqlPool from '../mysqlPool'
import StateAggregator from '../StateAggregator'
import {getRedis} from '../redis'

class AlterAliasedActionSubscriber extends Subscriber {

    async run(action: Action, ctx: SessionContext): Promise<void> {
        if(!ctx.authed || !(await ctx.getIsAdmin())) {
            ctx.sendChatComponentMessage(new Message(
                (await StateAggregator.translateComponent(ctx.data.language as string || 'en_us',
                    'quickplay.noPermission'))
                    .setColor(ChatFormatting.red)
            ))
            return
        }

        const newAliasedActionKey = action.getPayloadObjectAsString(0)
        const newAliasedAction = await AliasedAction.deserialize(action.getPayloadObjectAsString(1))
        const [aliasedActionRes] = await mysqlPool.query('SELECT * FROM aliased_actions WHERE `key`=?', [newAliasedActionKey])

        const newAvailableOn = newAliasedAction.availableOn === undefined ? aliasedActionRes[0].availableOn : newAliasedAction.availableOn
        const newAdminOnly = newAliasedAction.adminOnly === undefined ? aliasedActionRes[0].adminOnly : newAliasedAction.adminOnly
        const newAction = newAliasedAction.action === undefined ? aliasedActionRes[0].action : newAliasedAction.action

        // Validation
        let validationFailed = false
        if(newAliasedAction.action) {
            const bannedCommands = [
                'me', 'msg', 'message', 'w', 'whisper', 'tell', 'r', 'reply', 'ac',
                'achat', 'gc', 'gchat', 'pc', 'pchat', 'oc', 'ochat', 'staff', 'sc', 'schat',
                'f', 'friend', 'g', 'guild', 'ignore', 'chatreport', 'wdr', 'ban', 'mute'
            ]
            // Only OpenScreenAction and SendChatCommandActions allowed.
            if(newAliasedAction.action.id !== 6 && newAliasedAction.action.id !== 11) {
                validationFailed = true
            } else if(newAliasedAction.action.id == 6) {
                let cmd = newAliasedAction.action.getPayloadObjectAsString(0)
                if(!cmd.startsWith('/')) {
                    cmd = '/' + cmd
                }
                // Some commands are banned for SendChatCommandActions.
                for(let i = 0; i < bannedCommands.length; i++) {
                    if(cmd.startsWith('/' + bannedCommands[i] + ' ') || cmd === '/' + bannedCommands[i]) {
                        validationFailed = true
                        break
                    }
                }
            }


        }
        // Keys are required and must be less than 64 chars
        if(!newAliasedAction.key || newAliasedAction.key.length > 64) {
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
            if(aliasedActionRes.length > 0) {
                await mysqlPool.query('UPDATE aliased_actions SET availableOn=?, adminOnly=?, action=?, args=? WHERE `key`=?',
                    [JSON.stringify(newAvailableOn), newAdminOnly, newAction.id, JSON.stringify(newAction.payloadObjs), newAliasedActionKey])
            } else {
                await mysqlPool.query('INSERT INTO aliased_actions (`key`, availableOn, adminOnly, action, args) VALUES (?,?,?,?,?)',
                    [newAliasedActionKey, JSON.stringify(newAvailableOn), newAdminOnly, newAction.id, JSON.stringify(newAction.payloadObjs)])
            }

            const pulledNewAliasedAction = await StateAggregator.pullAliasedAction(newAliasedActionKey)
            const redis = await getRedis()
            await redis.hset('aliasedActions', newAliasedActionKey, JSON.stringify(pulledNewAliasedAction))
            await redis.publish('list-change', AlterAliasedActionAction.id + ',' + newAliasedActionKey)
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

export default AlterAliasedActionSubscriber
