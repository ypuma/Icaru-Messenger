"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.markMessageDelivered = exports.getMessages = exports.sendMessage = void 0;
const zod_1 = require("zod");
const logger_1 = require("@/utils/logger");
const db_1 = __importDefault(require("@/db"));
// Validation schemas - Updated to enforce E2EE
const sendMessageSchema = zod_1.z.object({
    receiverHandle: zod_1.z.string(),
    content: zod_1.z.string().min(1), // This should be "[Encrypted Message]" for E2EE
    messageType: zod_1.z.string().default('TEXT'),
    replyToId: zod_1.z.string().optional(),
    metadata: zod_1.z.string().optional(),
    encrypted: zod_1.z.boolean().refine((val) => val === true, {
        message: "Only encrypted messages are allowed"
    }),
    encryptedData: zod_1.z.string().min(1, "Encrypted data is required"),
});
const getMessagesSchema = zod_1.z.object({
    contactHandle: zod_1.z.string(),
    limit: zod_1.z.number().min(1).max(100).default(50),
    offset: zod_1.z.number().min(0).default(0),
});
const sendMessage = async (request, reply) => {
    try {
        const body = sendMessageSchema.parse(request.body);
        const userId = request.user.userId;
        const deviceId = request.user.deviceId;
        // Find the receiver
        const receiver = await db_1.default.user.findUnique({
            where: { handle: body.receiverHandle },
            select: { id: true, handle: true }
        });
        if (!receiver) {
            return reply.status(404).send({
                error: 'Not Found',
                message: 'Receiver not found'
            });
        }
        if (receiver.id === userId) {
            return reply.status(400).send({
                error: 'Bad Request',
                message: 'Cannot send message to yourself'
            });
        }
        // Check if they are contacts
        const contact = await db_1.default.contact.findUnique({
            where: {
                userId_contactId: {
                    userId,
                    contactId: receiver.id
                }
            }
        });
        if (!contact || contact.isBlocked) {
            return reply.status(403).send({
                error: 'Forbidden',
                message: 'Cannot send message to this user'
            });
        }
        // Create the message - enforcing E2EE
        const message = await db_1.default.message.create({
            data: {
                senderId: userId,
                receiverId: receiver.id,
                senderDeviceId: deviceId,
                receiverDeviceId: deviceId, // For now, use same device
                content: '[Encrypted Message]', // Never store plaintext
                messageType: body.messageType,
                replyToId: body.replyToId,
                metadata: JSON.stringify({
                    encrypted: true,
                    encryptedData: body.encryptedData
                }),
            },
            include: {
                sender: {
                    select: { handle: true }
                },
                receiver: {
                    select: { handle: true }
                }
            }
        });
        logger_1.logger.info(`Message sent from ${message.sender.handle} to ${message.receiver.handle}`);
        return reply.status(201).send({
            success: true,
            message: 'Message sent successfully',
            data: {
                id: message.id,
                content: message.content,
                messageType: message.messageType,
                timestamp: message.timestamp,
                receiverHandle: message.receiver.handle,
                replyToId: message.replyToId,
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Send message error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return reply.status(400).send({
                error: 'Bad Request',
                message: 'Invalid input data',
                details: error.errors
            });
        }
        return reply.status(500).send({
            error: 'Internal Server Error',
            message: 'Failed to send message'
        });
    }
};
exports.sendMessage = sendMessage;
const getMessages = async (request, reply) => {
    try {
        const query = getMessagesSchema.parse(request.query);
        const userId = request.user.userId;
        // Find the contact
        const contact = await db_1.default.user.findUnique({
            where: { handle: query.contactHandle },
            select: { id: true, handle: true }
        });
        if (!contact) {
            return reply.status(404).send({
                error: 'Not Found',
                message: 'Contact not found'
            });
        }
        // Get messages between users
        const messages = await db_1.default.message.findMany({
            where: {
                OR: [
                    {
                        senderId: userId,
                        receiverId: contact.id
                    },
                    {
                        senderId: contact.id,
                        receiverId: userId
                    }
                ]
            },
            include: {
                sender: {
                    select: { handle: true }
                },
                receiver: {
                    select: { handle: true }
                },
                replyTo: {
                    select: {
                        id: true,
                        content: true,
                        sender: {
                            select: { handle: true }
                        }
                    }
                }
            },
            orderBy: { timestamp: 'desc' },
            take: query.limit,
            skip: query.offset,
        });
        // Mark messages as read
        await db_1.default.message.updateMany({
            where: {
                senderId: contact.id,
                receiverId: userId,
                read: false
            },
            data: {
                read: true,
                readAt: new Date()
            }
        });
        return reply.send({
            success: true,
            messages: messages.map((msg) => {
                const metadata = msg.metadata ? JSON.parse(msg.metadata) : null;
                return {
                    id: msg.id,
                    content: msg.content, // This should always be "[Encrypted Message]"
                    messageType: msg.messageType,
                    timestamp: msg.timestamp,
                    senderHandle: msg.sender.handle,
                    receiverHandle: msg.receiver.handle,
                    delivered: msg.delivered,
                    read: msg.read,
                    replyTo: msg.replyTo ? {
                        id: msg.replyTo.id,
                        content: msg.replyTo.content, // This might also be encrypted
                        senderHandle: msg.replyTo.sender.handle
                    } : null,
                    encrypted: metadata?.encrypted || false,
                    encryptedData: metadata?.encryptedData || undefined
                };
            }).reverse()
        });
    }
    catch (error) {
        logger_1.logger.error('Get messages error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return reply.status(400).send({
                error: 'Bad Request',
                message: 'Invalid query parameters',
                details: error.errors
            });
        }
        return reply.status(500).send({
            error: 'Internal Server Error',
            message: 'Failed to get messages'
        });
    }
};
exports.getMessages = getMessages;
const markMessageDelivered = async (request, reply) => {
    try {
        const { messageId } = request.params;
        const userId = request.user.userId;
        const message = await db_1.default.message.findFirst({
            where: {
                id: messageId,
                receiverId: userId
            }
        });
        if (!message) {
            return reply.status(404).send({
                error: 'Not Found',
                message: 'Message not found'
            });
        }
        await db_1.default.message.update({
            where: { id: messageId },
            data: {
                delivered: true,
                deliveredAt: new Date()
            }
        });
        return reply.send({
            success: true,
            message: 'Message marked as delivered'
        });
    }
    catch (error) {
        logger_1.logger.error('Mark delivered error:', error);
        return reply.status(500).send({
            error: 'Internal Server Error',
            message: 'Failed to mark message as delivered'
        });
    }
};
exports.markMessageDelivered = markMessageDelivered;
//# sourceMappingURL=messages.js.map