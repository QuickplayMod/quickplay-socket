import {Action, AuthCompleteAction, AuthFailedAction, Subscriber} from '@quickplaymod/quickplay-actions-js'
import SessionContext from '../SessionContext'
import mysqlPool from '../mysqlPool'
import * as moment from 'moment'
import DisableModAction from '@quickplaymod/quickplay-actions-js/dist/actions/clientbound/DisableModAction'
import {RowDataPacket} from 'mysql2'

class AuthReestablishAuthedConnectionSubscriber extends Subscriber {
    async run(action: Action, ctx: SessionContext): Promise<void> {
        if(ctx.accountId == -1) {
            console.log('Auth failed: User attempted to reestablish an anonymous connection.')
            ctx.sendAction(new AuthFailedAction())
            return
        }
        const sessionToken = action.getPayloadObjectAsString(0)
        if(!sessionToken) {
            console.log('Auth failed: Connection reestablishment did not contain a valid session token.')
            ctx.sendAction(new AuthFailedAction())
            return
        }
        const [sessionRes] = <RowDataPacket[]> await mysqlPool.query('SELECT * FROM sessions WHERE token=? AND \
            created > NOW() - INTERVAL 3 HOUR',
        [sessionToken])
        if(sessionRes.length <= 0) {
            console.log('Auth failed: Connection reestablishment contained a session token not in the database.')
            ctx.sendAction(new AuthFailedAction())
            return
        }
        const accountId = sessionRes[0].user
        if(accountId != ctx.accountId) {
            console.log('Auth failed: Account ID of session and linked account ID don\'t match.')
            ctx.sendAction(new AuthFailedAction())
            return
        }
        const [accountRes] = <RowDataPacket[]> await mysqlPool.query('SELECT * FROM accounts WHERE id=?',
            [accountId])
        if(accountRes.length <= 0) {
            console.log('Auth failed: Session is linked to an account which doesn\'t exist anymore.')
            ctx.sendAction(new AuthFailedAction())
            return
        }
        if(accountRes[0].banned) {
            ctx.sendAction(new DisableModAction(await ctx.translate('quickplay.bannedFromOfficialApi')))
            return
        }

        // Get Premium status info
        const [premiumRes] = <RowDataPacket[]> await mysqlPool.query('SELECT * FROM premium_subscriptions WHERE \
            user=? AND activate_date < NOW() AND expires > NOW() LIMIT 1', [ctx.accountId])
        const premiumExpiration = premiumRes.length > 0 ? premiumRes[0].expires : null

        const sessionExpiration = moment(sessionRes[0].created)
        const sessionTtl = moment().diff(sessionExpiration)
        ctx.authed = true
        if(ctx.authedResetTimeout != null) {
            clearTimeout(ctx.authedResetTimeout)
        }
        ctx.authedResetTimeout = setTimeout(() => {
            ctx.authed = false
            ctx.authenticate()
        }, sessionTtl)

        const userRankData = await ctx.getHypixelRankData()
        ctx.sendAction(new AuthCompleteAction(sessionToken, sessionExpiration.toDate(),
            accountRes[0].mc_uuid, accountRes[0].discord_id || '',
            !!accountRes[0].is_admin, (premiumRes.length > 0), premiumExpiration,
            userRankData.rank, userRankData.packageRank, userRankData.isBuildTeam, userRankData.isBuildTeamAdmin))

        await ctx.beginSendingCurrentUserCount()
        await ctx.sendConnectionHistory()
        await ctx.sendEditHistory()
    }

}

export default AuthReestablishAuthedConnectionSubscriber
