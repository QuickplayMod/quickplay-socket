class GlyphUnknownFiletypeError extends Error {
    constructor(...args: string[]) {
        super(...args)
        Error.captureStackTrace(this, GlyphUnknownFiletypeError)
    }
}
export default GlyphUnknownFiletypeError
