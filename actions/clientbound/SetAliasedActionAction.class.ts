import Action from '../Action.class'
import AliasedAction from '../../gamelist/AliasedAction.class'

/**
 * ID: 7
 * Set an aliased action in the client with the provided key and parameters.
 *
 * Payload Order:
 * key
 * availableOn JSON array
 * protocol
 * The Action built as normal
 */
class SetAliasedActionAction extends Action {

    /**
     * Create a new SetAliasedActionAction.
     * @param aliasedAction {AliasedAction} Aliased action to be saved to the client.
     */
    constructor (aliasedAction: AliasedAction) {
        super()
        this.id = 7
        this.addPayload(Buffer.from(aliasedAction.key))
        this.addPayload(Buffer.from(JSON.stringify(aliasedAction.availableOn)))
        this.addPayload(Buffer.from(aliasedAction.protocol))
        this.addPayload(aliasedAction.action.build())
    }
}

export default SetAliasedActionAction
