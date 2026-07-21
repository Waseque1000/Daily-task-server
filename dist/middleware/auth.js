"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = void 0;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }
        const token = authHeader.split('Bearer ')[1];
        if (!firebase_admin_1.default.apps.length) {
            // If Firebase isn't initialized, accept a test token for development
            if (process.env.NODE_ENV === 'development') {
                req.userId = 'dev-user';
                return next();
            }
            return res.status(401).json({ error: 'Auth not configured' });
        }
        const decodedToken = await firebase_admin_1.default.auth().verifyIdToken(token);
        req.userId = decodedToken.uid;
        next();
    }
    catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};
exports.authenticate = authenticate;
//# sourceMappingURL=auth.js.map