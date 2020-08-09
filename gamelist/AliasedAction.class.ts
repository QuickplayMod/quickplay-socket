import Action from '../actions/Action.class'
import pool from '../mysqlPool'
import ActionResolver from "../actions/ActionResolver";


class AliasedAction {

    key: string
    availableOn: string[] = []
    protocol = ''
    action: Action

    /**
     * Constructor
     * @param key {string} The key of this item.
     */
    constructor (key: string) {
        this.key = key

    }

    /**
     * Deserialize a JSON-stringified AliasedAction into an AliasedAction object.
     * @param json {string} The JSON to deserialize.
     * @return {Promise<AliasedAction>} The AliasedAction that was deserialized.
     */
    static async deserialize(json: string) : Promise<AliasedAction> {
        const obj = JSON.parse(json)
        const aa = new AliasedAction(obj.key)
        for(const prop in obj) {
            if(!obj.hasOwnProperty(prop)) {
                continue
            }
            aa[prop] = obj[prop]
        }
        aa.action = await ActionResolver.deserialize(JSON.stringify(obj.action))
        return aa
    }

    /**
     * Pull an aliased action from the database and fill in it's serialized fields.
     * @param key {string} The key of the action to pull.
     */
    static async pull(key: string): Promise<AliasedAction> {
        const [res] = await pool.query('SELECT * FROM aliased_actions WHERE `key`=?', [key])
        if (res.length <= 0) {
            return null
        }
        const aa = new AliasedAction(res[0].key)
        aa.availableOn = res[0].availableOn
        aa.protocol = res[0].protocol
        aa.action = new (ActionResolver.get(res[0].action))()
        const args = res[0].args || []
        for(let i = 0; i < args.length; i++) {
            aa.action.addPayload(Buffer.from(args[0]))
        }
        return aa
    }
}

export default AliasedAction
