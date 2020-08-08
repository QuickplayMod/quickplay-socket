import Action from '../Action.class'

/**
 * ID: 10
 * Open a class with the specified classpath as a GUI on the client. Should extend GuiScreen.
 *
 * Payload Order:
 * class path
 * Each argument is an individual item
 */
class OpenGuiAction extends Action {

    /**
     * Create a new OpenGuiAction.
     * @param classpath {string} The path of the class to open as a GUI.
     * @param args {string[]} The arguments to pass to the class constructor.
     */
    constructor (classpath?: string, ...args: string[]) {
        super()
        this.id = 10

        // Don't add payload if the first payload item wasn't provided
        if(classpath == undefined) {
            return
        }

        this.addPayload(Buffer.from(classpath))
        if(args.length <= 0) {
            return
        }
        for(let i = 0; i < args.length; i++) {
            this.addPayload(Buffer.from(args[i]))
        }
    }
}

export default OpenGuiAction
