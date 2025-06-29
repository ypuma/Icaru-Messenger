"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyPassword = exports.hashPassword = exports.generateDeviceId = exports.generateHandle = exports.generateApiKey = exports.generateSessionToken = void 0;
const crypto_1 = __importDefault(require("crypto"));
/**
 * Generate a secure session token
 */
const generateSessionToken = () => {
    return crypto_1.default.randomBytes(32).toString('hex');
};
exports.generateSessionToken = generateSessionToken;
/**
 * Generate a secure API key
 */
const generateApiKey = () => {
    return crypto_1.default.randomBytes(64).toString('hex');
};
exports.generateApiKey = generateApiKey;
/**
 * Generate a secure handle (6 character alphanumeric)
 */
const generateHandle = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz23456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};
exports.generateHandle = generateHandle;
/**
 * Generate a secure device ID
 */
const generateDeviceId = () => {
    return crypto_1.default.randomUUID();
};
exports.generateDeviceId = generateDeviceId;
/**
 * Hash a password with salt
 */
const hashPassword = async (password) => {
    const bcrypt = await Promise.resolve().then(() => __importStar(require('bcrypt')));
    return bcrypt.hash(password, 12);
};
exports.hashPassword = hashPassword;
/**
 * Verify a password against a hash
 */
const verifyPassword = async (password, hash) => {
    const bcrypt = await Promise.resolve().then(() => __importStar(require('bcrypt')));
    return bcrypt.compare(password, hash);
};
exports.verifyPassword = verifyPassword;
//# sourceMappingURL=auth.js.map