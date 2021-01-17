class GlyphInvalidURLError extends Error {
    constructor(...args: string[]) {
        super(...args)
        Error.captureStackTrace(this, GlyphInvalidURLError)
    }
}
export default GlyphInvalidURLError
