const express = require('express');
const cors = require('cors');
const ratingsRouter = require('./routes/ratings');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Routes
app.use('/ratings', ratingsRouter);

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'cosmoquant-backend-node', db_url: process.env.DATABASE_URL ? "Set" : "Not Set" });
});

// Create server reference
const server = app.listen(PORT, () => {
    console.log(`Node.js Microservice running on port ${PORT}`);
    console.log(`Database URL: ${process.env.DATABASE_URL}`);
});

process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
    // Keep running for now to see logs, or exit
    // process.exit(1); 
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION:', reason);
});
