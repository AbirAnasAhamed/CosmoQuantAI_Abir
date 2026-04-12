const express = require('express');
const router = express.Router();
const { fetchAnalystRatings } = require('../services/ratingService');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

router.get('/:symbol', async (req, res) => {
    const { symbol } = req.params;
    const upperSymbol = symbol.toUpperCase();

    try {
        // 1. Check database for recent data (e.g., less than 24 hours old)
        const existingRating = await prisma.analystRating.findUnique({
            where: { symbol: upperSymbol }
        });

        if (existingRating) {
            const now = new Date();
            const lastUpdated = new Date(existingRating.updatedAt);
            const diffHours = (now - lastUpdated) / (1000 * 60 * 60);

            if (diffHours < 24) {
                console.log(`Serving cached ratings for ${upperSymbol}`);
                return res.json({ success: true, data: existingRating, source: 'cache' });
            }
        }

        // 2. Fetch fresh data if not found or stale
        const newRating = await fetchAnalystRatings(upperSymbol);

        if (!newRating) {
            // If fetch failed but we have old data, return it with a warning? 
            // Or just 404. Let's return what we have if exists, else 404.
            if (existingRating) {
                return res.json({ success: true, data: existingRating, source: 'stale_cache', warning: "Could not fetch fresh data" });
            }
            return res.status(404).json({ success: false, message: "No ratings found" });
        }

        res.json({ success: true, data: newRating, source: 'api' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

module.exports = router;
