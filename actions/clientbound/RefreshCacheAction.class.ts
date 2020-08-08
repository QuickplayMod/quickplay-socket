import Action from '../Action.class'

/**
 * ID: 12
 * Delete all cached files/images/etc on the client and force them to be recreated.
 * Does not delete session cache (e.g. screen list), but cache that persists across
 * sessions (e.g. directory with Glyph images).
 */
class RefreshCacheAction extends Action {

    /**
	 * Create a new RefreshCacheAction.
	 */
    constructor () {
        super()
        this.id = 12
    }
}

export default RefreshCacheAction
