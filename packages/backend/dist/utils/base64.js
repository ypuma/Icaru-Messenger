"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fromB64 = exports.toB64 = void 0;
const libsodium_wrappers_1 = __importDefault(require("libsodium-wrappers"));
/**
 * Encode a Uint8Array to URL-safe base64 without padding.
 */
const toB64 = (bytes) => {
    return libsodium_wrappers_1.default.to_base64(bytes, libsodium_wrappers_1.default.base64_variants.URLSAFE_NO_PADDING);
};
exports.toB64 = toB64;
/**
 * Decode a URL-safe base64 (no padding) string into a Uint8Array.
 */
const fromB64 = (b64) => {
    return libsodium_wrappers_1.default.from_base64(b64, libsodium_wrappers_1.default.base64_variants.URLSAFE_NO_PADDING);
};
exports.fromB64 = fromB64;
//# sourceMappingURL=base64.js.map