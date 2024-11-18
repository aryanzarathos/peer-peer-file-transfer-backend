import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid'; // npm install uuid
import logger from '../utils/logger.js'; // Ensure this logger is implemented or replace with console.log
import serverConfig from '../config/serverConfig.js';

class WebSocketService {
    constructor() {
        // Map to store room IDs and their connected clients
        this.rooms = new Map();
        // Map to track clients and their unique IDs
        this.clients = new Map();

        // Initialize WebSocket server
        this.server = new WebSocketServer({ port: serverConfig.port });

        this.server.on('connection', this.onConnection.bind(this));
        this.server.on('error', this.onError.bind(this));

        logger.info(`WebSocket server running on port ${serverConfig.port}`);
    }

    /**
     * Handle new WebSocket connection
     * @param {WebSocket} ws - The WebSocket connection
     * @param {IncomingMessage} req - HTTP request associated with the connection
     */
    onConnection(ws, req) {
        const roomId = this.extractRoomId(req.url);
        if (!roomId) {
            ws.close();
            return logger.error('Room ID not provided or invalid');
        }

        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, new Set());
        }

        const clientId = uuidv4();
        this.rooms.get(roomId).add(ws);
        this.clients.set(clientId, { ws, roomId });

        logger.info(`New client connected: ID=${clientId}, Room=${roomId}`);
        ws.send(JSON.stringify({ type: 'connection', clientId }));

        ws.on('message', (message) => this.onMessage(ws, clientId, message, roomId));
        ws.on('close', () => this.onClose(clientId, roomId));
        ws.on('error', (error) => this.onError(error, clientId));
    }

    /**
     * Extract the room ID from the request URL
     * @param {string} url - The request URL
     * @returns {string|null} - The extracted room ID or null if invalid
     */
    extractRoomId(url) {
        try {
            const roomId = url.split('/')[1];
            return roomId && roomId.trim() ? roomId : null;
        } catch {
            return null;
        }
    }

    /**
     * Handle incoming messages from clients
     * @param {WebSocket} ws - The WebSocket instance
     * @param {string} clientId - ID of the sending client
     * @param {string} message - The message payload
     * @param {string} roomId - Room ID associated with the client
     */
    onMessage(ws, clientId, message, roomId) {
        logger.info(`Message from Client=${clientId} in Room=${roomId}: ${message}`);
        console.log(clientId, message, roomId, "line 73")
        try {
            const data = JSON.parse(message);

            // Example: Handle specific message types
            switch (data.type) {
                case 'create_room':
                    this.createRoom(ws, data.roomId);
                    ws.send(JSON.stringify({ type: 'peer_connected-created', data: true }));
                    break;
                case 'join_room':
                    this.joinRoom(ws, data.roomId);
                    ws.send(JSON.stringify({ type: 'peer_connected-joined', data: false }));
                    break;
                case 'signal':
                    // ws.send(JSON.stringify({ type: 'signal', message: 'Room joined' }));
                    break;
                case 'chat':
                    this.broadcastToRoom(data.roomId, ws, JSON.stringify({ clientId: ws.clientId, message: data.message }));
                    break;
                case 'file_transfer':
                    this.handleFileTransfer(data.roomId, ws.clientId, data);
                    break;
                default:
                    logger.warn(`Unknown message type: ${data.type}`);
            }
        } catch (error) {
            logger.error(`Error parsing message from Client=${clientId}: ${error.message}`);
        }
    }

    /**
     * Handle WebSocket disconnection
     * @param {string} clientId - ID of the disconnecting client
     * @param {string} roomId - Room ID associated with the client
     */
    onClose(clientId, roomId) {
        const clientData = this.clients.get(clientId);

        if (clientData) {
            const room = this.rooms.get(roomId);
            if (room) {
                room.delete(clientData.ws);
                if (room.size === 0) {
                    this.rooms.delete(roomId); // Cleanup empty rooms
                }
            }
            this.clients.delete(clientId);
        }

        logger.info(`Client ${clientId} disconnected from Room=${roomId}`);
    }

    /**
     * Handle WebSocket errors
     * @param {Error} error - The error object
     * @param {string} clientId - ID of the client that caused the error (optional)
     */
    onError(error, clientId = null) {
        if (clientId) {
            logger.error(`Error on Client=${clientId}: ${error.message}`);
        } else {
            logger.error(`WebSocket error: ${error.message}`);
        }
    }

    /**
     * Broadcast a message to all clients in a room except the sender
     * @param {string} roomId - ID of the room
     * @param {WebSocket} senderWs - The sender's WebSocket instance
     * @param {string} message - The message to broadcast
     */
    broadcastToRoom(roomId, senderWs, message) {
        const room = this.rooms.get(roomId);
        if (!room) return;

        room.forEach((clientWs) => {
            if (clientWs !== senderWs && clientWs.readyState === clientWs.OPEN) {
                clientWs.send(message);
            }
        });

        logger.info(`Broadcasted message to Room=${roomId}: ${message}`);
    }

    handleFileTransfer(roomId, clientId, data) {
        // Broadcast the file transfer signaling message to other peers in the room
        const room = this.rooms.get(roomId);
        if (room) {
            room.forEach((clientWs) => {
                if (clientWs !== this.clients.get(clientId).ws && clientWs.readyState === clientWs.OPEN) {
                    // Send the file signal to other clients (peers)
                    clientWs.send(JSON.stringify({ type: 'file_transfer', from: clientId, data }));
                }
            });

            logger.info(`File transfer signaling message sent from Client=${clientId} to Room=${roomId}`);
        }
    }
    createRoom(ws, roomId) {
        if (this.rooms.has(roomId)) {
            ws.send(JSON.stringify({ type: 'error', message: 'Room already exists' }));
            return;
        }

        this.rooms.set(roomId, new Set());
        this.addClientToRoom(ws, roomId);

        logger.info(`Room created: ${roomId}`);
        ws.send(JSON.stringify({ type: 'room_created', message: ` Room ${roomId} created successfully` }));
    }

    addClientToRoom(ws, roomId) {
        const clientId = uuidv4();
        ws.clientId = clientId;  // Assign a unique client ID
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, new Set());
        }
        this.rooms.get(roomId).add(ws);
        this.clients.set(clientId, { ws, roomId });

        // Notify other clients in the room about the new joiner
        this.broadcastToRoom(roomId, ws, JSON.stringify({ type: 'room_joined', clientId, message: `${clientId} has joined the room ` }));

        logger.info(`Client ${clientId} added to Room ${roomId}`);
    }
}

export default WebSocketService;