
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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNextDocNumber = void 0;
const admin = __importStar(require("firebase-admin"));
/**
 * Gets the next sequential number for a given document type within a transaction.
 * This is a more robust and scalable method than querying all documents.
 *
 * @param transaction - The Firestore transaction to run this operation in.
 * @param type - The document type (e.g., "Sales Order", "Sales Invoice").
 * @param configs - The array of prefix configurations.
 * @returns A promise that resolves to the next formatted document number (e.g., "SO-2407-0001").
 */
async function getNextDocNumber(transaction, type, configs) {
    const db = admin.firestore();
    const safeConfigs = configs || [];
    const config = safeConfigs.find(c => c?.type?.toLowerCase() === type?.toLowerCase());
    if (!config || !config.prefix) {
        console.warn(`No valid prefix configuration found for type: ${type}. Using fallback.`);
        const fallbackPrefix = type.substring(0, 2).toUpperCase();
        return `${fallbackPrefix}-${Date.now()}`;
    }
    const prefix = config.prefix;
    const now = new Date();
    // Use YYMM format for the date part, consistent with other parts of the app.
    const yearShort = String(now.getFullYear()).slice(-2);
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const dateStr = config.useDate ? `${yearShort}${month}` : '';
    const counterId = dateStr ? `${prefix}_${dateStr}` : prefix;
    const counterRef = db.doc(`counters/${counterId}`);
    const counterSnap = await transaction.get(counterRef);
    const currentCount = counterSnap.exists ? (counterSnap.data()?.next ?? config.startNumber ?? 1) : (config.startNumber ?? 1);
    transaction.set(counterRef, { next: currentCount + 1 }, { merge: true });
    const paddedNum = String(currentCount).padStart(config.digits || 4, '0');
    return dateStr ? `${prefix}-${dateStr}-${paddedNum}` : `${prefix}-${paddedNum}`;
}
exports.getNextDocNumber = getNextDocNumber;

