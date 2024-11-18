// Manages the logic for handling and broadcasting messages
const messageController = {
    broadcastMessage: (clients, message) => {
        clients.forEach(client => {
            if (client.readyState === client.OPEN) {  // Ensure client is open before sending
                client.send(message);
            }
        });
    }
};

export default messageController;
