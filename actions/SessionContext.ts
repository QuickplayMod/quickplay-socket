import ChatComponent from '../chat-components/ChatComponent.class'
import SendChatComponentAction from './clientbound/SendChatComponentAction.class'
import SendChatCommandAction from './clientbound/SendChatCommandAction.class'
import Message from '../chat-components/Message.class'
import Action from './Action.class'
import WebSocket = require('ws');

export default class SessionContext {

    constructor(conn: WebSocket) {
        this.conn = conn
    }

    conn: WebSocket
    data: Record<string, unknown> = {}
    lastPong: number

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
        this.conn.send(action.build())
    }

    /**
     * Send an Action to the client.
     * @param action {Action} Action to send. If null, nothing is sent.
     */
    sendAction(action: Action) {
        if(action == null) {
            return
        }
        this.conn.send(action.build())
    }
}
