import {
    Action,
    AuthFailedAction,
    ChatComponent,
    ChatFormatting,
    Message,
    SendChatComponentAction,
    Subscriber
} from '@quickplaymod/quickplay-actions-js'
import SessionContext from '../SessionContext'
import mysqlPool from '../mysqlPool'
import {RowDataPacket} from 'mysql2'

class LinkDiscordSubscriber extends Subscriber {

    async run(action: Action, ctx: SessionContext): Promise<void> {
        const code = action.getPayloadObjectAsString(0).replace(/-/g, '')
        // In order to link, user is required to have provided a code and is required to have been previously prompted
        // during this connection to link their Discord.
        if(!code || ctx.authed || !ctx.data.awaitingDiscordLink || !ctx.data.discordLinkId) {
            ctx.sendAction(new SendChatComponentAction(new Message(
                new ChatComponent('Failed to link Discord!').setColor(ChatFormatting.red)
            )))
            return
        }

        const [authCodes] = <RowDataPacket[]> await mysqlPool.query('SELECT account FROM mc_auth_codes WHERE code=? \
            AND timestamp > NOW() - INTERVAL 5 MINUTE', [code])
        if(!authCodes || authCodes.length <= 0) {
            ctx.sendAction(new SendChatComponentAction(new Message(
                new ChatComponent('Invalid authentication code!').setColor(ChatFormatting.red)
            )))
            ctx.sendAction(new AuthFailedAction('UNLINKED_DISCORD'))
            return
        }

        const [accounts] = <RowDataPacket[]> await mysqlPool.query('SElECT discord_id FROM accounts WHERE id=? AND \
            discord_id IS NULL', [authCodes[0].account])
        if(!accounts || accounts.length == 0) {
            ctx.sendAction(new SendChatComponentAction(new Message(
                new ChatComponent('Sorry, we weren\'t able to find your account! Have you already linked Discord?')
                    .setColor(ChatFormatting.red)
            )))
        }

        // Attempt to delete this code and all other codes which have previously expired.
        await mysqlPool.query('DELETE FROM mc_auth_codes WHERE code=? OR timestamp < NOW() - INTERVAL 5 MINUTE', [code])
        await mysqlPool.query('UPDATE accounts SET discord_id=? WHERE id=?', [ctx.data.discordLinkId, authCodes[0].account])

        // Attempt re-authentication after Discord has been linked.
        await ctx.authenticate()
    }
}

export default LinkDiscordSubscriber
