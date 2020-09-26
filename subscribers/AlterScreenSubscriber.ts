import {
    Action,
    AlterScreenAction,
    ChatFormatting,
    Message,
    Screen,
    Subscriber
} from '@quickplaymod/quickplay-actions-js'
import SessionContext from '../SessionContext'
import mysqlPool from '../mysqlPool'
import StateAggregator from '../StateAggregator'
import {getRedis} from '../redis'
import {RowDataPacket} from 'mysql2'

class AlterScreenSubscriber extends Subscriber {

    async run(action: Action, ctx: SessionContext): Promise<void> {
        if(!ctx.authed || !(await ctx.getIsAdmin())) {
            ctx.sendChatComponentMessage(new Message(
                (await StateAggregator.translateComponent(ctx.data.language as string || 'en_us',
                    'quickplay.noPermission'))
                    .setColor(ChatFormatting.red)
            ))
            return
        }

        const newScreenKey = action.getPayloadObjectAsString(0)
        const newScreen = await Screen.deserialize(action.getPayloadObjectAsString(1))
        const [screenRes] = <RowDataPacket[]> await mysqlPool.query('SELECT * FROM screens WHERE `key`=?',
            [newScreenKey])

        const newScreenType = newScreen.screenType === undefined ? screenRes[0].screenType : newScreen.screenType
        const newAvailableOn = newScreen.availableOn === undefined ? screenRes[0].availableOn : newScreen.availableOn
        const newTranslationKey = newScreen.translationKey === undefined ? screenRes[0].translationKey : newScreen.translationKey
        const newImageUrl = newScreen.imageURL === undefined ? screenRes[0].imageURL : newScreen.imageURL
        const newScreenButtons = newScreen.buttons === undefined ? screenRes[0].buttons : newScreen.buttons
        const newBackButtonActions = newScreen.backButtonActions === undefined ? screenRes[0].backButtonActions : newScreen.backButtonActions
        const newVisible = newScreen.visible === undefined ? screenRes[0].visible : newScreen.visible
        const newAdminOnly = newScreen.adminOnly === undefined ? screenRes[0].adminOnly : newScreen.adminOnly
        const newHypixelLocrawRegex = newScreen.hypixelLocrawRegex === undefined ?
            screenRes[0].hypixelLocrawRegex : newScreen.hypixelLocrawRegex
        const newHypixelRankRegex = newScreen.hypixelRankRegex === undefined ?
            screenRes[0].hypixelRankRegex : newScreen.hypixelRankRegex
        const newHypixelPackageRankRegex = newScreen.hypixelPackageRankRegex === undefined ?
            screenRes[0].hypixelPackageRankRegex : newScreen.hypixelPackageRankRegex
        const newHypixelBuildTeamOnly = newScreen.hypixelBuildTeamOnly === undefined ?
            screenRes[0].hypixelBuildTeamOnly : newScreen.hypixelBuildTeamOnly
        const newHypixelBuildTeamAdminOnly = newScreen.hypixelBuildTeamAdminOnly === undefined ?
            screenRes[0].hypixelBuildTeamAdminOnly : newScreen.hypixelBuildTeamAdminOnly

        // Validation
        let validationFailed = false
        // Keys are required and must be less than 64 chars
        if(!newScreen.key || newScreen.key.length > 64) {
            validationFailed = true
        }
        // Image urls can only be 512 chars long
        if(newScreen.imageURL && newScreen.imageURL.length > 512) {
            validationFailed = true
        }
        // Screen type can only be buttons or images
        if(newScreen.screenType && newScreen.screenType !== 'BUTTONS' && newScreen.screenType !== 'IMAGES') {
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
            if(screenRes.length > 0) {
                await mysqlPool.query('UPDATE screens SET screenType=?, availableOn=?, translationKey=?, imageURL=?, \
                    buttons=?, backButtonActions=?, visible=?, adminOnly=?, hypixelLocrawRegex=?, hypixelRankRegex=?, \
                    hypixelPackageRankRegex=?, hypixelBuildTeamOnly=?, hypixelBuildTeamAdminOnly=?  WHERE `key`=?',
                [newScreenType, JSON.stringify(newAvailableOn), newTranslationKey, newImageUrl,
                    JSON.stringify(newScreenButtons), JSON.stringify(newBackButtonActions), newVisible, newAdminOnly,
                    JSON.stringify(newHypixelLocrawRegex), newHypixelRankRegex, newHypixelPackageRankRegex,
                    newHypixelBuildTeamOnly, newHypixelBuildTeamAdminOnly, newScreenKey])
            } else {
                await mysqlPool.query('INSERT INTO screens (`key`, screenType, availableOn, translationKey, imageURL, \
                    buttons, backButtonActions, visible, adminOnly, hypixelLocrawRegex, hypixelRankRegex, \
                    hypixelPackageRankRegex, hypixelBuildTeamOnly, hypixelBuildTeamAdminOnly) VALUES \
                    (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                [newScreenKey, newScreenType, JSON.stringify(newAvailableOn), newTranslationKey, newImageUrl,
                    JSON.stringify(newScreenButtons), JSON.stringify(newBackButtonActions), newVisible, newAdminOnly,
                    JSON.stringify(newHypixelLocrawRegex), newHypixelRankRegex, newHypixelPackageRankRegex,
                    newHypixelBuildTeamOnly, newHypixelBuildTeamAdminOnly])
            }

            // Log the edit to the edit log
            await mysqlPool.query('INSERT INTO edit_log (edited_by, item_type, item_key, deleted, prev_version) \
                VALUES (?,?,?,?,?)', [ctx.accountId, 'screen', newScreenKey, false, JSON.stringify(screenRes[0])])

            const pulledNewScreen = await StateAggregator.pullScreen(newScreenKey)
            const redis = await getRedis()
            await redis.hset('screens', newScreenKey, JSON.stringify(pulledNewScreen))
            await redis.publish('list-change', AlterScreenAction.id + ',' + newScreenKey)
        } catch (e) {
            console.error(e)
            ctx.sendChatComponentMessage(new Message(
                (await StateAggregator.translateComponent(ctx.data.language as string || 'en_us',
                    'quickplay.alterScreenFailed'))
                    .setColor(ChatFormatting.red)
            ))
        }
    }
}

export default AlterScreenSubscriber
