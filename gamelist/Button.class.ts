import pool from '../mysqlPool'

class Button {

    id: number
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
     * Pull a button from the database and fill in it's serialized fields.
     * @param idOrKey {number|string} The ID or key of the button to pull.
     */
    static async pull(idOrKey: number|string): Promise<Button> {
        let query

        if(typeof idOrKey == 'number') {
            query = 'SELECT * FROM buttons WHERE id=?'
        } else {
            query = 'SELECT * FROM buttons WHERE `key`=?'
        }
        const res = await pool.query(query, [idOrKey])

        if (res.length <= 0) {
            return null
        }
        const b = new Button(res[0].key)
        b.id = res[0].id
        b.availableOn = JSON.parse(res[0].availableOn)
        b.protocol = res[0].protocol
        b.imageURL = res[0].imageURL
        b.translationKey = res[0].translationKey
        const actions = JSON.parse(res[0].actions)
        for(let i = 0; i < actions.length; i++) {
            b.actions.push(actions[i])
        }
        return b
    }
}

export default Button
