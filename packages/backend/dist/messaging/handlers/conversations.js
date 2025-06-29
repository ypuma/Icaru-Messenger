"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createConversation = exports.getConversations = void 0;
const logger_1 = require("@/utils/logger");
const db_1 = __importDefault(require("@/db"));
/**
 * Get conversations for current user
 */
const getConversations = async (request, reply) => {
    try {
        const userId = request.user.userId;
        const messages = await db_1.default.message.findMany({
            where: {
                OR: [
                    { senderId: userId },
                    { receiverId: userId },
                ],
            },
            orderBy: {
                timestamp: 'desc',
            },
            include: {
                sender: { select: { id: true, handle: true } },
                receiver: { select: { id: true, handle: true } },
            },
        });
        const conversationsMap = new Map();
        for (const message of messages) {
            const contact = message.senderId === userId ? message.receiver : message.sender;
            if (conversationsMap.has(contact.id))
                continue;
            const contactRelation = await db_1.default.contact.findFirst({
                where: {
                    OR: [
                        { userId: userId, contactId: contact.id },
                        { userId: contact.id, contactId: userId },
                    ],
                },
            });
            const unreadCount = await db_1.default.message.count({
                where: {
                    senderId: contact.id,
                    receiverId: userId,
                    deliveredAt: null, // Using deliveredAt to track read status
                },
            });
            conversationsMap.set(contact.id, {
                contactHandle: contact.handle,
                contact: {
                    id: contact.id,
                    handle: contact.handle,
                    verified: contactRelation?.isVerified || false,
                },
                lastMessage: {
                    content: message.content,
                    timestamp: message.timestamp,
                    isOwn: message.senderId === userId,
                },
                unreadCount,
            });
        }
        const formattedConversations = Array.from(conversationsMap.values());
        return reply.send({
            success: true,
            conversations: formattedConversations,
        });
    }
    catch (error) {
        logger_1.logger.error('Get conversations error:', error);
        return reply.status(500).send({
            error: 'Internal Server Error',
            message: 'Failed to get conversations'
        });
    }
};
exports.getConversations = getConversations;
/**
 * Create or get conversation with a contact
 */
const createConversation = async (request, reply) => {
    try {
        const { contactHandle } = request.body;
        const userId = request.user.userId;
        // Find the contact
        const contact = await db_1.default.user.findUnique({
            where: { handle: contactHandle },
            select: { id: true, handle: true }
        });
        if (!contact) {
            return reply.status(404).send({
                error: 'Not Found',
                message: 'Contact not found'
            });
        }
        if (contact.id === userId) {
            return reply.status(400).send({
                error: 'Bad Request',
                message: 'Cannot create conversation with yourself'
            });
        }
        // Check if contact relationship exists
        let contactRelation = await db_1.default.contact.findUnique({
            where: {
                userId_contactId: {
                    userId,
                    contactId: contact.id
                }
            }
        });
        // Create contact relationship if it doesn't exist
        if (!contactRelation) {
            contactRelation = await db_1.default.contact.create({
                data: {
                    userId,
                    contactId: contact.id,
                    isVerified: false
                }
            });
        }
        return reply.status(201).send({
            success: true,
            conversation: {
                contactHandle: contact.handle,
                contact: {
                    id: contact.id,
                    handle: contact.handle,
                    verified: contactRelation.isVerified
                },
                lastMessage: null,
                unreadCount: 0
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Create conversation error:', error);
        return reply.status(500).send({
            error: 'Internal Server Error',
            message: 'Failed to create conversation'
        });
    }
};
exports.createConversation = createConversation;
//# sourceMappingURL=conversations.js.map