import {
    Action,
    Button,
    ChatComponent,
    ChatFormatting,
    Message,
    SetKeybindsAction,
    Subscriber
} from '@quickplaymod/quickplay-actions-js'
import SessionContext from '../SessionContext'
import {getRedis} from '../redis'
import StateAggregator from '../StateAggregator'

class MigrateKeybindsSubscriber extends Subscriber {

    async run(action: Action, ctx: SessionContext): Promise<void> {
        try {
            const result = await this.convert(action, ctx.data.language as string)
            ctx.sendAction(result.action)
            if(result.failedKeybinds && result.failedKeybinds.length > 0) {
                ctx.sendChatComponentMessage(new Message(
                    (await StateAggregator.translateComponent(ctx.data.language as string || 'en_us',
                        'quickplay.migrationPartiallyFailed', result.failedKeybinds.join(',\n')))
                        .setColor(ChatFormatting.yellow), true
                ))
            }

        } catch(e) {
            console.log(e)
            ctx.sendChatComponentMessage(new Message(new ChatComponent(
                'quickplay.keybinds.migratingFailed')
                .setColor(ChatFormatting.red), true))
        }
    }

    /**
     * Get the translation key which has a value matching this translation.
     * @param lang {string} The language key to search in Redis.
     * @param translationValue {string} The translation value we're attempting to find the key for.
     */
    async getKeyMatchingTranslation(lang: string, translationValue: string) : Promise<string> {
        const redis = await getRedis()
        const scanner = redis.hscanStream(lang)
        return await new Promise((resolve) => {
            let resolved = false
            scanner.on('data', (result) => {
                if(resolved) {
                    return
                }
                for(let i = 0; i < result.length / 2; i++) {
                    if(result[i*2+1] === translationValue) {
                        resolve(result[i*2])
                        resolved = true
                        return
                    }
                }
            })
            scanner.on('end', () => {
                resolve(null)
            })
        })
    }

    /**
     * Convert the old keybinds structure into the new keybinds structure
     * @param incoming {Action} The incoming action which triggered this subscription.
     * @param lang {string} The language the client is using. For simplicity, we only search for
     * translation matches for the user's current language, as this will cover 99% of users. To search all
     * languages would be much more complex in terms of runtime (O(ltbk) where l is the total number of languages,
     * t is the total number of translations, b is the total number of buttons, and k is the total number of keybinds,
     * as opposed to O(tbk) with current language).
     */
    async convert(incoming: Action, lang: string) : Promise<{ action: SetKeybindsAction, failedKeybinds: unknown[] }> {
        // Find translations with the matching name
        // Get the key of that translation
        // Find the first button that is using that translation key
        // Set that button's key as the target button of the keybind

        const userKeybinds = JSON.parse(incoming.getPayloadObjectAsString(0))
        if(!Array.isArray(userKeybinds) || userKeybinds.length <= 0) {
            return {
                action: new SetKeybindsAction([]),
                failedKeybinds: []
            }
        }
        const redis = await getRedis()
        // Get all buttons in {buttonKey: buttonJson} object
        const buttons = await redis.hgetall('buttons')

        // const langKeys = new Set()
        // // Get all languages keys
        // await new Promise((resolve) => {
        //     const stream = redis.scanStream({ match: 'lang:*' })
        //     stream.on('data', (res) => {
        //         for(let i = 0; i < res.length; i++) {
        //             langKeys.add(res[i])
        //         }
        //     })
        //     stream.on('end', resolve)
        // })

        const failedKeybinds = []
        const newKeybinds = []
        for(let i = 0; i < userKeybinds.length; i++) {
            // Mark keybinds as failed if they are null or don't have a name
            if(userKeybinds[i] == null || userKeybinds[i].name == null) {
                failedKeybinds.push(null) // This will at least tell the user one keybind failed
            }
            // Skip keybinds which already have a target
            if(userKeybinds[i].target != null && userKeybinds[i].target != '') {
                continue
            }
            // For each OLD keybind, look for a matching translation key for the name of the keybind
            const key = await this.getKeyMatchingTranslation('lang:' + lang, userKeybinds[i].name)
            // If translation key isn't found, mark this keybind as failed and continue
            if(key == null) {
                failedKeybinds.push(userKeybinds[i].name)
                continue
            }

            let buttonKey = null
            // For each button, look for a button whose translation key is equal to the translation key we just got
            for(const btn in buttons) {
                if(!buttons.hasOwnProperty(btn)) {
                    continue
                }
                const btnVal = await Button.deserialize(buttons[btn])
                if(btnVal.translationKey === key) {
                    buttonKey = btnVal.key
                    break
                }
            }
            // If none found, mark this keybind as failed and continue
            if(buttonKey == null) {
                failedKeybinds.push(userKeybinds[i].name)
                continue
            }
            userKeybinds[i].target = buttonKey
            newKeybinds.push(userKeybinds[i])
        }

        return {
            action: new SetKeybindsAction(newKeybinds),
            failedKeybinds: failedKeybinds
        }
    }
}

export default MigrateKeybindsSubscriber
