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
        InitializeClientAction
    ]

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
}
