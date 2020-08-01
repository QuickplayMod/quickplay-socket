import Action from '../Action.class'

/**
 * ID: 1
 * Enable the Quickplay mod for the receiving client.
 */
class EnableModAction extends Action {

    /**
	 * Create a new EnableModAction.
	 */
    constructor () {
        super()
        this.id = 1
    }
}

export default EnableModAction
