import Action from '../Action.class'
import ChatComponent from '../../chat-components/ChatComponent.class'

/**
 * ID: 3
 * Send a chat component to the client's chat.
 */
class SendChatComponentAction extends Action {

    /**
	 * Create a new SendChatComponentAction.
	 * @param component {ChatComponent} Chat component for the client to send
	 */
    constructor (component: ChatComponent) {
        super()
        this.id = 3
        this.addPayload(Buffer.from(JSON.stringify(component)))
    }
}

export default SendChatComponentAction
