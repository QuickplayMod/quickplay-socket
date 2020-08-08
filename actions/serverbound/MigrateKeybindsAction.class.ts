import Action from '../Action.class'
import SessionContext from '../SessionContext'
import SetKeybindsAction from '../clientbound/SetKeybindsAction.class'
import Message from '../../chat-components/Message.class'
import ChatComponent from '../../chat-components/ChatComponent.class'
import ChatFormattingEnum from '../../chat-components/ChatFormatting.enum'

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


    run(ctx: SessionContext) : void {
        try {
            const keybinds = JSON.parse(this.getPayloadObjectAsString(0))
            const setKeybindsAction = new SetKeybindsAction(keybinds)
            ctx.conn.send(setKeybindsAction.build())
            ctx.sendChatComponentMessage(new Message(new ChatComponent(
                'Migration complete!')
                .setColor(ChatFormattingEnum.green), true))
        } catch(e) {
            console.log(e)
            ctx.sendChatComponentMessage(new Message(new ChatComponent(
                'Something went wrong while migrating your keybinds. Sorry for the inconvenience!')
                .setColor(ChatFormattingEnum.red), true))
        }
    }
}

export default MigrateKeybindsAction
