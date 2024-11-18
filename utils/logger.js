// Simple logger utility for consistent logging
const logger = {
    info: (message) => console.log(`INFO: ${message}`),
    error: (message) => console.error(`ERROR: ${message}`)
};

export default logger;
