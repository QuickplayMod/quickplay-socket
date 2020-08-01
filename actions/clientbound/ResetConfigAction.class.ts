import Action from '../Action.class'

/**
 * ID: 5
 * Reset the client's configuration. Use sparingly.
 */
class ResetConfigAction extends Action {

    /**
	 * Create a new ResetConfigAction.
	 */
    constructor () {
        super()
        this.id = 5
    }
}

export default ResetConfigAction
