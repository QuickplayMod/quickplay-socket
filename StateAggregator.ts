import {AliasedAction, Button, ChatComponent, Resolver, Screen} from '@quickplaymod/quickplay-actions-js'
import {sprintf} from 'sprintf-js'
import {getRedis} from './redis'
import mysqlPool from './mysqlPool'
import pool from './mysqlPool'
import {RowDataPacket} from 'mysql2'

/**
 * Aggregator for stateful data from the database and Redis.
 */
class StateAggregator {

    /**
     * Populate Redis with data from the database.
     * TODO this function should probably be removed or used somewhere else.
     *  It does not make sense to repopulate Redis every time an instance restarts.
     */
    static async populate() : Promise<void> {
        const redis = await getRedis()
        await redis.del('aliasedActions')
        const [actionResponse] = <RowDataPacket[]> await pool.query('SELECT `key` FROM aliased_actions;')
        for(let i = 0; i < actionResponse.length; i++) {
            const res = await  StateAggregator.pullAliasedAction(actionResponse[i].key)
            await redis.hset('aliasedActions', actionResponse[i].key, JSON.stringify(res))
        }

        await redis.del('buttons')
        const [buttonResponse] = <RowDataPacket[]> await pool.query('SELECT `key` FROM buttons;')
        for(let i = 0; i < buttonResponse.length; i++) {
            const res = await StateAggregator.pullButton(buttonResponse[i].key)
            await redis.hset('buttons', buttonResponse[i].key, JSON.stringify(res))
        }

        await redis.del('screens')
        const [screenResponse] = <RowDataPacket[]> await pool.query('SELECT `key` FROM screens;')
        for(let i = 0; i < screenResponse.length; i++) {
            const res = await StateAggregator.pullScreen(screenResponse[i].key)
            await redis.hset('screens', screenResponse[i].key, JSON.stringify(res))
        }

        await redis.del('regexes')
        const [regexResponse] = <RowDataPacket[]> await pool.query('SELECT * FROM regexes;')
        for(let i = 0; i < regexResponse.length; i++) {
            await redis.hset('regexes', regexResponse[i].key, regexResponse[i].value)
        }

        await redis.del('glyphs')
        // Get all glyph data for users which have an active Premium subscription and aren't banned.
        const [glyphResponse] = <RowDataPacket[]> await pool.query('SELECT g.uuid, g.height, g.yOffset, g.path, g.displayInGames \
            FROM glyphs g, premium_subscriptions p, accounts a WHERE \
            p.activate_date > NOW() AND \
            p.expires < NOW() AND \
            p.user = a.id AND \
            a.mc_uuid = g.uuid AND \
            a.banned = 0')
        for(let i = 0; i < glyphResponse.length; i++) {
            await redis.hset('glyphs', glyphResponse[i].uuid, JSON.stringify(glyphResponse[i]))
        }

        // Delete all current language values
        const [languages] = <RowDataPacket[]> await pool.query('SELECT distinct(lang) from translations')
        for(let i = 0; i < languages.length; i++) {
            await redis.del('lang:' + languages[i].lang)
        }
        // Insert all language values back into redis
        const [translationResponse] = <RowDataPacket[]> await pool.query('SELECT * from translations;')
        for(let i = 0; i < translationResponse.length; i++) {
            await redis.hset('lang:' + translationResponse[i].lang, translationResponse[i].key, translationResponse[i].value)
        }
    }

    /**
     * Create a new chat component from the translation for a given key, in a given language, if it exists.
     * @param lang {string} The language to translate to. If the translation does not exist in this language, the
     * default is used: en_us.
     * @param key {string} The translation key to get.
     * @param args {string[]} Arguments to be passed to the translation formatter.
     * @returns {ChatComponent} a new ChatComponent containing the translated string, or the original key if
     * the translation could not be found.
     */
    static async translateComponent(lang: string, key: string, ... args: string[]) : Promise<ChatComponent> {
        const redis = await getRedis()
        if(!lang || !await redis.exists('lang:' + lang.toLowerCase())) {
            lang = 'en_us'
        }
        let res = await redis.hget('lang:' + lang, key)
        if(res == null && lang != 'en_us') {
            res = await(redis.hget('lang:en_us', key))
        }
        if(res == null) {
            return new ChatComponent(key)
        }
        return new ChatComponent(sprintf(res, ...args))
    }

    /**
     * Pull an aliased action from the database and fill in it's serialized fields.
     * @param key {string} The key of the action to pull.
     */
    static async pullAliasedAction(key: string) : Promise<AliasedAction> {
        const [res] = <RowDataPacket[]> await mysqlPool.query('SELECT * FROM aliased_actions WHERE `key`=?',
            [key])
        if (res.length <= 0) {
            return null
        }
        const aa = new AliasedAction(res[0].key)
        aa.availableOn = res[0].availableOn
        aa.action = new (Resolver.get(res[0].action))()
        aa.visible = res[0].visible
        aa.adminOnly = res[0].adminOnly
        aa.hypixelLocrawRegex = res[0].hypixelLocrawRegex
        aa.hypixelRankRegex = res[0].hypixelRankRegex
        aa.hypixelPackageRankRegex = res[0].hypixelPackageRankRegex
        aa.hypixelBuildTeamOnly = res[0].hypixelBuildTeamOnly
        aa.hypixelBuildTeamAdminOnly = res[0].hypixelBuildTeamAdminOnly
        const args = res[0].args || []
        for(let i = 0; i < args.length; i++) {
            aa.action.addPayload(Buffer.from(args[0]))
        }
        return aa
    }

    /**
     * Pull a button from the database and fill in it's serialized fields.
     * @param key {string} The key of the button to pull.
     */
    static async pullButton(key: string) : Promise<Button> {
        const [res] = <RowDataPacket[]> await mysqlPool.query('SELECT * FROM buttons WHERE `key`=?', [key])

        if (res.length <= 0) {
            return null
        }
        const b = new Button(res[0].key)
        b.availableOn = res[0].availableOn
        b.imageURL = res[0].imageURL
        b.translationKey = res[0].translationKey
        b.visible = res[0].visible
        b.adminOnly = res[0].adminOnly
        b.hypixelLocrawRegex = res[0].hypixelLocrawRegex
        b.hypixelRankRegex = res[0].hypixelRankRegex
        b.hypixelPackageRankRegex = res[0].hypixelPackageRankRegex
        b.hypixelBuildTeamOnly = res[0].hypixelBuildTeamOnly
        b.hypixelBuildTeamAdminOnly = res[0].hypixelBuildTeamAdminOnly
        b.visibleInPartyMode = res[0].visibleInPartyMode
        b.partyModeScopeTranslationKey = res[0].partyModeScopeTranslationKey
        const actions = res[0].actions || []
        for(let i = 0; i < actions.length; i++) {
            b.actions.push(actions[i])
        }
        return b
    }

    /**
     * Pull a screen from the database and fill in it's serialized fields.
     * @param key {string} The key of the screen to pull.
     */
    static async pullScreen(key: string) : Promise<Screen> {
        const [res] = <RowDataPacket[]> await mysqlPool.query('SELECT * FROM screens WHERE `key`=?', [key])

        if (res.length <= 0) {
            return null
        }
        const s = new Screen(res[0].key, res[0].screenType)
        s.availableOn = res[0].availableOn
        s.translationKey = res[0].translationKey
        s.imageURL = res[0].imageURL
        s.visible = res[0].visible
        s.adminOnly = res[0].adminOnly
        s.hypixelLocrawRegex = res[0].hypixelLocrawRegex
        s.hypixelRankRegex = res[0].hypixelRankRegex
        s.hypixelPackageRankRegex = res[0].hypixelPackageRankRegex
        s.hypixelBuildTeamOnly = res[0].hypixelBuildTeamOnly
        s.hypixelBuildTeamAdminOnly = res[0].hypixelBuildTeamAdminOnly

        const actions = res[0].backButtonActions || []
        for(let i = 0; i < actions.length; i++) {
            s.backButtonActions.push(actions[i])
        }
        const buttons = res[0].buttons || []
        for(let i = 0; i < buttons.length; i++) {
            s.buttons.push(buttons[i])
        }
        return s
    }
}

export default StateAggregator
