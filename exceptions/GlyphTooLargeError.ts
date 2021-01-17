class GlyphTooLargeError extends Error {
    constructor(...args: string[]) {
        super(...args)
        Error.captureStackTrace(this, GlyphTooLargeError)
    }
}
export default GlyphTooLargeError
