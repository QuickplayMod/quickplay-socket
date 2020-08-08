import Action from '../actions/Action.class'
import pool from '../mysqlPool'


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
     * Pull an aliased action from the database and fill in it's serialized fields.
     * @param key {string} The key of the action to pull.
     */
    static async pull(key: string): Promise<AliasedAction> {
        const res = await pool.query('SELECT * FROM aliased_actions WHERE `key`=?', [key])
        if (res.length <= 0) {
            return null
        }
        const aa = new AliasedAction(res[0].key)
        aa.availableOn = JSON.parse(res[0].availableOn)
        aa.protocol = res[0].protocol
        aa.action = new Action()
        const args = JSON.parse(res[0].args)
        for(let i = 0; i < args.length; i++) {
            aa.action.addPayload(Buffer.from(args[0]))
        }
        return aa
    }
}

export default AliasedAction
