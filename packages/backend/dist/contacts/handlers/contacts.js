"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteContact = exports.updateContact = exports.getContacts = exports.addContact = void 0;
const zod_1 = require("zod");
const logger_1 = require("@/utils/logger");
const db_1 = __importDefault(require("@/db"));
// Validation schemas
const addContactSchema = zod_1.z.object({
    contactHandle: zod_1.z.string().min(3).max(30),
    nickname: zod_1.z.string().optional(),
});
const updateContactSchema = zod_1.z.object({
    contactId: zod_1.z.string(),
    nickname: zod_1.z.string().optional(),
    isBlocked: zod_1.z.boolean().optional(),
});
const deleteContactSchema = zod_1.z.object({
    contactHandle: zod_1.z.string(),
});
const addContact = async (request, reply) => {
    try {
        const body = addContactSchema.parse(request.body);
        const userId = request.user.userId;
        // Find the contact user by handle
        const contactUser = await db_1.default.user.findUnique({
            where: { handle: body.contactHandle },
            select: { id: true, handle: true, publicKey: true }
        });
        if (!contactUser) {
            return reply.status(404).send({
                error: 'Not Found',
                message: 'Benutzer nicht gefunden'
            });
        }
        if (contactUser.id === userId) {
            return reply.status(400).send({
                error: 'Bad Request',
                message: 'Cannot add yourself as a contact'
            });
        }
        // Check if contact already exists
        const existingContact = await db_1.default.contact.findUnique({
            where: {
                userId_contactId: {
                    userId,
                    contactId: contactUser.id
                }
            }
        });
        if (existingContact) {
            return reply.status(409).send({
                error: 'Conflict',
                message: 'Contact already exists'
            });
        }
        // Create the contact
        const contact = await db_1.default.contact.create({
            data: {
                userId,
                contactId: contactUser.id,
                nickname: body.nickname,
            },
            include: {
                contact: {
                    select: {
                        id: true,
                        handle: true,
                        publicKey: true,
                    }
                }
            }
        });
        logger_1.logger.info(`Contact added: ${body.contactHandle} by user ${userId}`);
        return reply.status(201).send({
            success: true,
            message: 'Contact added successfully',
            contact: {
                id: contact.id,
                handle: contact.contact.handle,
                publicKey: contact.contact.publicKey,
                nickname: contact.nickname,
                isVerified: contact.isVerified,
                isBlocked: contact.isBlocked,
                addedAt: contact.addedAt,
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Add contact error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return reply.status(400).send({
                error: 'Bad Request',
                message: 'Invalid input data',
                details: error.errors
            });
        }
        return reply.status(500).send({
            error: 'Internal Server Error',
            message: 'Failed to add contact'
        });
    }
};
exports.addContact = addContact;
const getContacts = async (request, reply) => {
    try {
        const userId = request.user.userId;
        const contacts = await db_1.default.contact.findMany({
            where: { userId },
            include: {
                contact: {
                    select: {
                        id: true,
                        handle: true,
                        publicKey: true,
                    }
                }
            },
            orderBy: { addedAt: 'desc' }
        });
        return reply.send({
            success: true,
            contacts: contacts.map((contact) => ({
                id: contact.id,
                handle: contact.contact.handle,
                publicKey: contact.contact.publicKey,
                nickname: contact.nickname,
                isVerified: contact.isVerified,
                isBlocked: contact.isBlocked,
                addedAt: contact.addedAt,
                verifiedAt: contact.verifiedAt,
            }))
        });
    }
    catch (error) {
        logger_1.logger.error('Get contacts error:', error);
        return reply.status(500).send({
            error: 'Internal Server Error',
            message: 'Failed to get contacts'
        });
    }
};
exports.getContacts = getContacts;
const updateContact = async (request, reply) => {
    try {
        const body = updateContactSchema.parse(request.body);
        const userId = request.user.userId;
        const contact = await db_1.default.contact.findFirst({
            where: {
                id: body.contactId,
                userId
            }
        });
        if (!contact) {
            return reply.status(404).send({
                error: 'Not Found',
                message: 'Contact not found'
            });
        }
        const updatedContact = await db_1.default.contact.update({
            where: { id: body.contactId },
            data: {
                nickname: body.nickname,
                isBlocked: body.isBlocked,
            },
            include: {
                contact: {
                    select: {
                        id: true,
                        handle: true,
                        publicKey: true,
                    }
                }
            }
        });
        return reply.send({
            success: true,
            message: 'Contact updated successfully',
            contact: {
                id: updatedContact.id,
                handle: updatedContact.contact.handle,
                publicKey: updatedContact.contact.publicKey,
                nickname: updatedContact.nickname,
                isVerified: updatedContact.isVerified,
                isBlocked: updatedContact.isBlocked,
                addedAt: updatedContact.addedAt,
                verifiedAt: updatedContact.verifiedAt,
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Update contact error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return reply.status(400).send({
                error: 'Bad Request',
                message: 'Invalid input data',
                details: error.errors
            });
        }
        return reply.status(500).send({
            error: 'Internal Server Error',
            message: 'Failed to update contact'
        });
    }
};
exports.updateContact = updateContact;
const deleteContact = async (request, reply) => {
    try {
        const body = deleteContactSchema.parse(request.body);
        const userId = request.user.userId;
        // Find the contact user by handle
        const contactUser = await db_1.default.user.findUnique({
            where: { handle: body.contactHandle },
            select: { id: true }
        });
        if (!contactUser) {
            return reply.status(404).send({
                error: 'Not Found',
                message: 'Contact Benutzer nicht gefunden'
            });
        }
        // Find and delete the contact relationship
        await db_1.default.contact.delete({
            where: {
                userId_contactId: {
                    userId,
                    contactId: contactUser.id
                }
            }
        });
        logger_1.logger.info(`Contact deleted: ${body.contactHandle} by user ${userId}`);
        return reply.send({
            success: true,
            message: 'Contact deleted successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('Delete contact error:', error);
        return reply.status(500).send({
            error: 'Internal Server Error',
            message: 'Failed to delete contact'
        });
    }
};
exports.deleteContact = deleteContact;
//# sourceMappingURL=contacts.js.map