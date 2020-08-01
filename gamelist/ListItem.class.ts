
class ListItem {

    key: string
    availableOn: string[] = []
    protocol = ''

    /**
     * Constructor
     * @param key {string} The key/ID of this item.
     */
    constructor(key: string) {
        this.key = key
    }
}

export default ListItem
