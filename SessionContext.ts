import * as crypto from 'crypto'
import * as Hypixel from 'hypixel-api'
import {
    Action,
    AddUserCountHistoryAction,
    AliasedAction,
    AuthBeginHandshakeAction,
    Button,
    ChatComponent,
    ChatFormatting,
    DisableModAction,
    Glyph,
    IdentifierTypes,
    Message,
    PushEditHistoryEventAction,
    RegularExpression,
    Screen,
    SendChatCommandAction,
    SendChatComponentAction,
    SetAliasedActionAction,
    SetButtonAction,
    SetCurrentUserCountAction,
    SetGlyphForUserAction,
    SetRegexAction,
    SetScreenAction,
    SetTranslationAction,
    Translation,
} from '@quickplaymod/quickplay-actions-js'
import mysqlPool from './mysqlPool'
import {getRedis} from './redis'
import {sprintf} from 'sprintf-js'
import {RowDataPacket} from 'mysql2'
import SetCurrentServerAction from '@quickplaymod/quickplay-actions-js/dist/actions/clientbound/SetCurrentServerAction'
import WebSocket = require('ws');
import Timer = NodeJS.Timer;

const hypixelApi = new Hypixel(process.env.HYPIXEL_API_KEY)

/**
 * Generate a handshake token and add it to the database for a specific session context.
 * Returns null if the user has initiated authentication within the past 5 seconds.
 * @param ctx {SessionContext} Session context to generate the token for.
 */
async function generateHandshakeToken(ctx: SessionContext) : Promise<string> {

    const bytes = crypto.randomBytes(32)
    const token = bytes.toString('hex')

    // Since Discord authentication doesn't support unauthenticated account IDs, and thus we can't save the
    // token to the database.
    if(ctx.authMode == IdentifierTypes.DISCORD) {
        ctx.data.discordState = token
        return token
    }

    // Handshakes can only be generated every 5 seconds per user
    let res
    try {
        [res] = await mysqlPool.query('SELECT COUNT(id) FROM sessions WHERE user=? AND created > NOW() - INTERVAL 5 SECOND',
            [ctx.accountId])
    } catch(e) {
        console.error(e)
        ctx.sendChatComponentMessage(new Message(
            new ChatComponent('Quickplay authentication failed: Something went wrong! Try again in a few seconds.')
                .setColor(ChatFormatting.red)
        ))
        return null
    }
    if(res[0]['COUNT(id)'] > 2) {
        ctx.sendChatComponentMessage(new Message(
            new ChatComponent('Quickplay authentication failed: You\'re doing that too fast! Try again in a few seconds.')
                .setColor(ChatFormatting.red)
        ))
        return null
    }

    try {
        await mysqlPool.query('INSERT INTO sessions (handshake, user) VALUES (?,?)', [token, ctx.accountId])
    } catch(e) {
        console.error(e)
        ctx.sendChatComponentMessage(new Message(
            new ChatComponent('Quickplay authentication failed: Something went wrong! Try again in a few seconds.')
                .setColor(ChatFormatting.red)
        ))
        return null
    }

    return token
}


let lastApiRequest = -1
let apiQueueSize = 0
const apiFrequency = 1000 * (60 / 100) /* 60 seconds / 100 requests */
async function waitForApiTurn() : Promise<void> {
    const now = Date.now()
    if(apiQueueSize == 0 && now - lastApiRequest > apiFrequency) {
        lastApiRequest = now
        return
    }

    let timeToWait = (apiFrequency - (now - lastApiRequest)) || 1
    timeToWait += apiQueueSize * apiFrequency
    apiQueueSize++

    await new Promise((resolve) => {
        setTimeout(() => {
            lastApiRequest = Date.now()
            apiQueueSize--
            resolve()
        }, timeToWait)
    })
}

export default class SessionContext {

    constructor(conn: WebSocket) {
        this.conn = conn
    }

    conn: WebSocket
    data: Record<string, unknown> = {}
    lastPong: number
    authed = false
    accountId = -1
    authMode = IdentifierTypes.ANONYMOUS
    authedResetTimeout: Timer = null

    async getIsAdmin() : Promise<boolean> {
        if(!this.authed || this.accountId == -1) {
            return false
        }

        // Admin state is cached for 5 minutes.
        if(!this.data.adminStateCachedTimestamp || this.data.adminStateCachedTimestamp < Date.now() - 300000) {
            const [res] = <RowDataPacket[]> await mysqlPool.query(
                'SELECT is_admin FROM accounts WHERE id=?', [this.accountId])
            if(res.length <= 0) {
                this.authed = false
                return false
            }
            this.data.adminStateCachedTimestamp = Date.now()
            this.data.adminStateCachedValue = !!res[0].is_admin
        }

        return this.data.adminStateCachedValue as boolean
    }

    async getIsPremium() : Promise<boolean> {
        if(!this.authed || this.accountId == -1) {
            return false
        }

        // Premium state is cached for 5 minutes.
        if(!this.data.premiumStateCachedTimestamp || this.data.premiumStateCachedTimestamp < Date.now() - 300000) {
            // Count users who have an active premium subscription and aren't banned.
            const [res] = <RowDataPacket[]> await mysqlPool.query('SELECT count(user) AS count FROM \
            premium_subscriptions p, accounts a WHERE \
            p.user=? AND \
            p.activate_date < NOW() AND \
            p.expires > NOW() AND \
            p.user = a.id AND \
            a.banned = 0', [this.accountId])
            this.data.premiumStateCachedTimestamp = Date.now()
            this.data.premiumStateCachedValue = res[0].count > 0
        }

        return this.data.premiumStateCachedValue as boolean
    }

    async getMinecraftUuid() : Promise<string> {
        if(!this.authed || this.accountId == -1) {
            return null
        }

        // Minecraft UUID is cached for 5 minutes.
        if(!this.data.mcUUIDCachedTimestamp || this.data.mcUUIDCachedTimestamp < Date.now() - 300000) {
            const [res] = <RowDataPacket[]> await mysqlPool.query('SELECT mc_uuid FROM accounts WHERE id=?',
                [this.accountId])

            this.data.mcUUIDCachedTimestamp = Date.now()

            if(res.length <= 0) {
                this.data.mcUUIDCachedValue = null
            } else {
                this.data.mcUUIDCachedValue = res[0].mc_uuid
            }
        }

        return this.data.mcUUIDCachedValue as string
    }

    /**
     * Initiate authentication with the client. This function generates a handshake token for the user and
     * sends a new AuthBeginHandshakeAction. Authentication is periodically redone, specifically once every 3 hours.
     */
    async authenticate() : Promise<void> {
        // Anonymous user -- Discord auth modes require full authentication before accountId is retrieved.
        if(this.accountId == -1 && this.authMode != IdentifierTypes.DISCORD) {
            return
        }
        this.authed = false
        if(this.authedResetTimeout != null) {
            clearTimeout(this.authedResetTimeout)
            this.authedResetTimeout = null
        }
        try {
            const token = await generateHandshakeToken(this)
            if(token == null) {
                return
            }
            this.sendAction(new AuthBeginHandshakeAction(token))
        } catch(e) {
            console.error(e)
            this.sendChatComponentMessage(new Message(
                new ChatComponent('Quickplay authentication failed: Something went wrong! Try again in a few seconds.')
                    .setColor(ChatFormatting.red)
            ))
        }
    }

    /**
     * Send a chat component to the user's chat via a {@link SendChatComponentAction}
     * @param component {ChatComponent} The component to send. Should not be null.
     */
    sendChatComponentMessage(component: Message) : void {
        if(component == null) {
            return
        }
        const action = new SendChatComponentAction(component)
        this.conn.send(action.build())
    }

    /**
     * Send a chat command on behalf of the user via a {@link SendChatCommandAction}.
     * @param command {string} The command to send. Beginning slash will automatically be removed if provided,
     * and the client will add it back. To run a command that begins with two slashes (e.g. //wand, like WorldEdit), you
     * must provide both slashes.
     */
    sendChatCommand(command: string) : void {
        if(command == null || command.length < 0) {
            return
        }
        const action = new SendChatCommandAction(command)
        this.sendAction(action)
    }

    /**
     * Send an Action to the client.
     * @param action {Action} Action to send. If null, nothing is sent.
     */
    sendAction(action: Action) : void {
        if(action == null) {
            return
        }
        this.conn.send(action.build())
    }

    /**
     * Send the (recent) edit history to the user. If this user is not an admin, nothing is sent.
     */
    async sendEditHistory(): Promise<void> {
        if(!this.authed || ! await this.getIsAdmin()) {
            return
        }
        const [editHistory] = <RowDataPacket[]> await mysqlPool.query(
            'SELECT * from edit_log ORDER BY timestamp DESC LIMIT 1000')

        for(let i = 0; i < editHistory.length; i++) {
            const e = editHistory[i]
            if(!e) {
                continue
            }
            const editAction = new PushEditHistoryEventAction(new Date(e.timestamp), e.edited_by, e.item_type,
                e.item_key, !!e.deleted, e.prev_version)
            this.sendAction(editAction)
        }
    }

    /**
     * Send the connection history from the last 7 days to the client if they're an admin
     */
    async sendConnectionHistory(): Promise<void> {
        if(await this.getIsAdmin()) {
            try {
                const [resultsFromLastTen] = <RowDataPacket[]> await mysqlPool.query('SELECT `timestamp`, connection_count FROM \
                    connection_chart_datapoints WHERE `timestamp` > NOW() - INTERVAL 24 HOUR')
                for(let i = 0; i < resultsFromLastTen.length; i++) {

                    this.sendAction(new AddUserCountHistoryAction(new Date(resultsFromLastTen[i].timestamp),
                        resultsFromLastTen[i].connection_count, i == 0))
                }
            } catch(e) {
                console.error(e)
            }

        }
    }

    /**
     * Start a loop to send the client current user count once every second while the connection is open (and while
     * the user is admin). Checking admin status every second would be pretty pointlessly inefficient, so it's
     * checked once every 2 minutes. The loop stops if the user is no longer admin or the connection closes.
     */
    async beginSendingCurrentUserCount(): Promise<void> {
        if(!await this.getIsAdmin()) {
            return
        }
        let loopsDone = 0
        const checkAdminFrequency = 120
        const currentUserCountTimer = setInterval(async () => {
            loopsDone++
            if(loopsDone >= checkAdminFrequency) {
                if(!await this.getIsAdmin()) {
                    clearInterval(currentUserCountTimer)
                    return
                }
                loopsDone = 0
            }
            if(this.conn.readyState == this.conn.CLOSED ||
                this.conn.readyState == this.conn.CLOSING) {
                clearInterval(currentUserCountTimer)
                return
            }
            const redis = await getRedis()
            this.sendAction(new SetCurrentUserCountAction(parseInt(await redis.get('connections'))))
        }, 1000)
    }

    /**
     * Send data about the screens, buttons, actions, and translations to the user. This should be done after an
     * InitializeClientAction action because it depends on the user's language. If no language is present,
     * English is used.
     */
    async sendGameListData() : Promise<void> {
        const redis = await getRedis()
        const screens = await redis.hgetall('screens')
        const buttons = await redis.hgetall('buttons')
        const aliasedActions = await redis.hgetall('aliasedActions')
        const regexes = await redis.hgetall('regexes')

        // Translations default to English. If a translation is available in the user's language, it is
        // overwritten with the translation value.
        const translations = await redis.hgetall('lang:en_us')
        if(this.data.language != 'en_us' && await redis.exists('lang:' + this.data.language)) {
            const localTranslations = await redis.hgetall('lang:' + this.data.language)
            for(const item in localTranslations) {
                if(!localTranslations.hasOwnProperty(item)) {
                    continue
                }
                translations[item] = localTranslations[item]
            }
        }

        for(const translationKey in translations) {
            if(!translations.hasOwnProperty(translationKey)) {
                continue
            }
            const translation = new Translation(translationKey)
            translation.lang = this.data.language as string
            translation.value = translations[translationKey]
            this.sendAction(new SetTranslationAction(translation))
        }
        for(const regexKey in regexes) {
            if(!regexes.hasOwnProperty(regexKey)) {
                continue
            }
            this.sendAction(new SetRegexAction(new RegularExpression(regexKey, regexes[regexKey])))
        }
        for(const action in aliasedActions) {
            if(!aliasedActions.hasOwnProperty(action)) {
                continue
            }
            const parsedAction = await AliasedAction.deserialize(aliasedActions[action])
            this.sendAction(new SetAliasedActionAction(parsedAction))
        }
        for(const button in buttons) {
            if(!buttons.hasOwnProperty(button)) {
                continue
            }
            const parsedButton = await Button.deserialize(buttons[button])
            this.sendAction(new SetButtonAction(parsedButton))
        }
        for(const screen in screens) {
            if(!screens.hasOwnProperty(screen) || !screens[screen]) {
                continue
            }
            const parsedScreen = await Screen.deserialize(screens[screen])
            this.sendAction(new SetScreenAction(parsedScreen))
        }
    }

    /**
     * Send user a list of all the glyphs. Unlike sendGameListData, this isn't language-dependent.
     */
    async sendGlyphs() : Promise<void> {
        const redis = await getRedis()
        const glyphs = await redis.hgetall('glyphs')

        for(const uuid in glyphs) {
            if(!glyphs.hasOwnProperty(uuid) || !glyphs[uuid]) {
                continue
            }
            const glyph: Glyph = JSON.parse(glyphs[uuid])
            let glyphPath = glyph.path
            // Don't send glyph if this glyph does not contain a URL
            if(!glyphPath) {
                continue
            }
            if(!glyphPath.startsWith('http')) {
                glyphPath = process.env.GLYPH_PROXY + glyph.path
            }
            this.sendAction(new SetGlyphForUserAction(glyph.uuid, glyphPath, glyph.height,
                glyph.yOffset, glyph.displayInGames))
        }
    }

    async disable(reason: string): Promise<void> {
        this.sendAction(new DisableModAction(reason || 'No reason provided'))
        this.conn.close()
    }

    async getHypixelRankData(): Promise<{ rank: string, packageRank: string, isBuildTeam: boolean, isBuildTeamAdmin: boolean }> {
        const redis = await getRedis()

        const mcUuid = await this.getMinecraftUuid()
        if(!mcUuid) {
            return {
                rank: 'NONE',
                packageRank: 'NONE',
                isBuildTeamAdmin: false,
                isBuildTeam: false
            }
        }

        try {
            // Attempt to read the Redis cache. If there is a cached value for this user, use that.
            const cachedValue = await redis.hget('rankcache', mcUuid)
            if(cachedValue) {
                const parsedCachedValue = JSON.parse(cachedValue)
                // 1200000 ms = 20 minutes
                if(parsedCachedValue && parsedCachedValue.createdAt > Date.now() - 1200000) {
                    return parsedCachedValue
                }
            }

            await waitForApiTurn()

            // Get the player's data from the API
            const hypixelRes = await hypixelApi.getPlayer('uuid', mcUuid)

            // Calculate the user's package rank
            let packageRank = 'NONE'
            if(hypixelRes.player && hypixelRes.player.newPackageRank && hypixelRes.player.newPackageRank != 'NONE') {
                packageRank = hypixelRes.player.newPackageRank
            }
            if(hypixelRes.player && hypixelRes.player.oldPackageRank && hypixelRes.player.oldPackageRank != 'NONE') {
                packageRank = hypixelRes.player.oldPackageRank
            }
            if(hypixelRes.player && hypixelRes.player.monthlyPackageRank && hypixelRes.player.monthlyPackageRank != 'NONE') {
                packageRank = hypixelRes.player.monthlyPackageRank
            }

            // Save result object to cache and return it
            const result = {
                createdAt: Date.now(),
                rank: hypixelRes.rank || 'NONE',
                packageRank: packageRank,
                isBuildTeam: hypixelRes.buildTeam as boolean,
                isBuildTeamAdmin: hypixelRes.buildTeamAdmin as boolean
            }

            await redis.hset('rankcache', mcUuid, JSON.stringify(result))

            return result
        } catch(e) {
            console.error(e)
            return {
                rank: 'NONE',
                packageRank: 'NONE',
                isBuildTeamAdmin: false,
                isBuildTeam: false
            }
        }
    }

    /**
     * Notify the client of the recognized server that they have connected to.
     * @param serverName Name/ID of the server they've connected to.
     */
    async setCurrentServer(serverName: string): Promise<void> {
        this.data.currentServer = serverName
        this.sendAction(new SetCurrentServerAction(serverName))
    }

    /**
     * Translate a given key into the preferred language of this session.
     * @param key {string} Translation key to translate
     * @param args {string[]} Arguments to be used to replace variables in the translation, if necessary.
     * @return {Promise<string>} The translated string, or the original key if no translation was found
     */
    async translate(key: string, ...args: string[]): Promise<string> {
        const redis = await getRedis()
        const result = await redis.hget('lang:' + this.data.language, key)
        if(result != null) {
            return sprintf(result, ...args)
        }
        const englishResult = await redis.hget('lang:en_us', key)
        if(englishResult != null) {
            return sprintf(englishResult, ...args)
        }
        return key
    }
}
