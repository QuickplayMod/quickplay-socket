import Action from './Action.class'
import EnableModAction from './clientbound/EnableModAction.class'
import DisableModAction from './clientbound/DisableModAction.class'
import SendChatComponentAction from './clientbound/SendChatComponentAction.class'
import SystemOutAction from './clientbound/SystemOutAction.class'
import ResetConfigAction from './clientbound/ResetConfigAction.class'
import SendChatCommandAction from './clientbound/SendChatCommandAction.class'
import SetAliasedActionAction from './clientbound/SetAliasedActionAction.class'
import SetButtonAction from './clientbound/SetButtonAction.class'
import SetScreenAction from './clientbound/SetScreenAction.class'
import OpenGuiAction from './clientbound/OpenGuiAction.class'
import OpenScreenAction from './clientbound/OpenScreenAction.class'
import RefreshCacheAction from './clientbound/RefreshCacheAction.class'
import SetCurrentServerAction from './clientbound/SetCurrentServerAction.class'
import SetGlyphForUserAction from './clientbound/SetGlyphForUserAction.class'
import SetKeybindsAction from './clientbound/SetKeybindsAction.class'
import SetPremiumAboutAction from './clientbound/SetPremiumAboutAction.class'
import SetTranslationAction from './clientbound/SetTranslationAction.class'
import ButtonPressedAction from './serverbound/ButtonPressedAction.class'
import ExceptionThrownAction from './serverbound/ExceptionThrownAction.class'
import HypixelLocationChangedAction from './serverbound/HypixelLocationChangedAction.class'
import MigrateKeybindsAction from './serverbound/MigrateKeybindsAction.class'
import LanguageChangedAction from './serverbound/LanguageChangedAction.class'
import ServerJoinedAction from './serverbound/ServerJoinedAction.class'
import ServerLeftAction from './serverbound/ServerLeftAction.class'
import InitializeClientAction from './serverbound/InitializeClientAction.class'
import AuthBeginHandshakeAction from './clientbound/AuthBeginHandshakeAction.class'
import AuthEndHandshakeAction from './serverbound/AuthEndHandshakeAction.class'
import AuthCompleteAction from './clientbound/AuthCompleteAction.class'

export default class ActionResolver {

    private static actionMap = [
        Action,
        EnableModAction,
        DisableModAction,
        SendChatComponentAction,
        SystemOutAction,
        ResetConfigAction,
        SendChatCommandAction,
        SetAliasedActionAction,
        SetButtonAction,
        SetScreenAction,
        OpenGuiAction,
        OpenScreenAction,
        RefreshCacheAction,
        SetCurrentServerAction,
        SetGlyphForUserAction,
        SetKeybindsAction,
        SetPremiumAboutAction,
        SetTranslationAction,
        ButtonPressedAction,
        ExceptionThrownAction,
        HypixelLocationChangedAction,
        MigrateKeybindsAction,
        LanguageChangedAction,
        ServerJoinedAction,
        ServerLeftAction,
        InitializeClientAction,
        AuthBeginHandshakeAction,
        AuthEndHandshakeAction,
        AuthCompleteAction
    ]

    /**
     * Get an action from an ID.
     * @param id ID of the action to get.
     * @returns the Action, or null if there is no Action for the specified ID.
     */
    static get (id: number) : typeof Action {
        if(id < 0 || id >= this.actionMap.length) {
            return null
        }
        return this.actionMap[id]
    }

    /**
     * Decode an Action from a buffer
     * @param buf {Buffer} Buffer to decode
     */
    static from (buf: Buffer) : Action {
        const id = buf.readInt16BE()
        const action = new ActionResolver.actionMap[id]()
        action.id = id
        let offset = 2
        // Loop until the end of the buffer is reached
        while(buf.byteLength > offset) {
            // Read length of payload slice
            const length = buf.readInt32BE(offset)
            offset += 4
            // Read payload slice
            action.addPayload(buf.slice(offset, offset + length))
            offset += length
        }
        return action
    }

    static async deserialize(json: string): Promise<Action> {
        const obj = JSON.parse(json)
        const action = new ActionResolver.actionMap[obj.id]()
        for(const prop in obj) {
            if(!obj.hasOwnProperty(prop)) {
                continue
            }
            action[prop] = obj[prop]
        }
        // Convert all Buffers from Objects into Buffer instances.
        if(action.payloadObjs != null) {
            for(let i = 0; i < action.payloadObjs.length; i++) {
                action.payloadObjs[i] = Buffer.from((action.payloadObjs[i] as unknown as {data: number[]}).data)
            }
        }
        return action
    }
}
