import Action from '../Action.class'
import SessionContext from '../SessionContext'
import SetKeybindsAction from '../clientbound/SetKeybindsAction.class'
import Message from '../../chat-components/Message.class'
import ChatComponent from '../../chat-components/ChatComponent.class'
import ChatFormattingEnum from '../../chat-components/ChatFormatting.enum'
import {getRedis} from '../../redis'
import Button from "../../gamelist/Button.class";

/**
 * SERVERBOUND - Server should not instantiate.
 * ID: 21
 * Send the list keybinds to the server so the server can respond with a migrated keybinds list.
 * This is currently only used to migrate keybinds from pre-2.1.0 to post-2.1.0.
 * @see SetKeybindsAction
 *
 * Payload Order:
 * valid JSON that goes into keybinds.json FROM QP 2.0.3 or earlier.
 */
class MigrateKeybindsAction extends Action {

    /**
     * Create a new MigrateKeybindsAction.
     * @param keybinds {Record<string, ?>[]} New keybinds to serialize and send to the server.
     */
    constructor (keybinds?: Record<string, unknown>[]) {
        super()
        this.id = 21

        // Don't add payload if the first payload item wasn't provided
        if(keybinds == undefined) {
            return
        }

        this.addPayload(Buffer.from(JSON.stringify(keybinds)))
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
                for(let i = 0; i < result.length; i++) {
                    if(result[i][1] === translationValue) {
                        resolve(result[i][0])
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
     * @param lang {string} The language the client is using. For simplicity, we only search for
     * translation matches for the user's current language, as this will cover 99% of users. To search all
     * languages would be much more complex in terms of runtime (O(ltbk) where l is the total number of languages,
     * t is the total number of translations, b is the total number of buttons, and k is the total number of keybinds,
     * as opposed to O(tbk) with current language).
     */
    async convert(lang: string) : Promise<SetKeybindsAction> {
        // Find translations with the matching name
        // Get the key of that translation
        // Find the first button that is using that translation key
        // Set that button's key as the target button of the keybind

        const start = new Date()
        const keybinds = JSON.parse(this.getPayloadObjectAsString(0))
        if(!Array.isArray(keybinds)) {
            return new SetKeybindsAction([])
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
        for(let i = 0; i < keybinds.length; i++) {
            // Mark keybinds as failed if they are null or don't have a name
            if(keybinds[i] == null || keybinds[i].name == null) {
                failedKeybinds.push(null) // This will at least tell the user one keybind failed
            }
            // Skip keybinds which already have a target
            if(keybinds[i].target != null && keybinds[i].target != '') {
                continue
            }
            // For each OLD keybind, look for a matching translation key for the name of the keybind
            const key = await this.getKeyMatchingTranslation('lang:' + lang, keybinds[i].name)
            // If translation key isn't found, mark this keybind as failed and continue
            if(key == null) {
                failedKeybinds.push(keybinds[i].name)
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
                    buttonKey = key
                    break
                }
            }
            // If none found, mark this keybind as failed and continue
            if(buttonKey == null) {
                failedKeybinds.push(keybinds[i].name)
                continue
            }
            // Set the target; Gson will remove all other values on deserialization, so we don't need to remove them.
            keybinds[i].target = buttonKey
        }

        const end = new Date()
        console.log('Conversion time:', end.getTime() - start.getTime())
        return new SetKeybindsAction(keybinds)
    }


    run(ctx: SessionContext) : void {
        try {
            this.convert(ctx.data.language as string).then((action) => {
                ctx.sendAction(action)
                ctx.sendChatComponentMessage(new Message(new ChatComponent(
                    'Migration complete!')
                    .setColor(ChatFormattingEnum.green), true))
            }).catch(e => {
                throw e
            })

        } catch(e) {
            console.log(e)
            ctx.sendChatComponentMessage(new Message(new ChatComponent(
                'Something went wrong while migrating your keybinds. Sorry for the inconvenience!')
                .setColor(ChatFormattingEnum.red), true))
        }
    }
}

export default MigrateKeybindsAction
