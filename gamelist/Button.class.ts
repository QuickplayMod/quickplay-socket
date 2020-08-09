import pool from '../mysqlPool'

class Button {

    key: string
    availableOn: string[] = []
    protocol = ''
    actions: string[] = [] // Keys of AliasedActions
    imageURL = ''
    translationKey = ''

    /**
     * Constructor
     * @param key {string} The key/ID of this item.
     */
    constructor (key: string) {
        this.key = key
    }

    /**
     * Deserialize a JSON-stringified Button into an Button object.
     * @param json {string} The JSON to deserialize.
     * @return {Promise<Button>} The Button that was deserialized.
     */
    static async deserialize(json: string) : Promise<Button> {
        const obj = JSON.parse(json)
        const btn = new Button(obj.key)
        for(const prop in obj) {
            if(!obj.hasOwnProperty(prop)) {
                continue
            }
            btn[prop] = obj[prop]
        }
        return btn
    }

    /**
     * Pull a button from the database and fill in it's serialized fields.
     * @param key {string} The key of the button to pull.
     */
    static async pull(key: string): Promise<Button> {
        const [res] = await pool.query('SELECT * FROM buttons WHERE `key`=?', [key])

        if (res.length <= 0) {
            return null
        }
        const b = new Button(res[0].key)
        b.availableOn = res[0].availableOn
        b.protocol = res[0].protocol
        b.imageURL = res[0].imageURL
        b.translationKey = res[0].translationKey
        const actions = res[0].actions || []
        for(let i = 0; i < actions.length; i++) {
            b.actions.push(actions[i])
        }
        return b
    }
}

export default Button
