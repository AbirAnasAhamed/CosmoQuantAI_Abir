const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const fetchAnalystRatings = async (symbol) => {
  try {
    const API_KEY = process.env.FINANCIAL_API_KEY;
    if (!API_KEY) {
      throw new Error("FINANCIAL_API_KEY is not set");
    }

    const url = `https://financialmodelingprep.com/api/v3/analyst-stock-recommendations/${symbol}?apikey=${API_KEY}`;
    
    console.log(`Fetching ratings for ${symbol} from FMP...`);
    const response = await axios.get(url);
    
    if (!response.data || response.data.length === 0) {
      console.log(`No ratings found for ${symbol}`);
      return null;
    }

    const data = response.data[0]; // Get latest rating

    // Normalize data
    const ratingData = {
      symbol: symbol.toUpperCase(),
      strongBuy: data.analystRatingsStrongBuy || data.strongBuy || 0,
      buy: data.analystRatingsBuy || data.buy || 0,
      hold: data.analystRatingsHold || data.hold || 0,
      sell: data.analystRatingsSell || data.sell || 0,
      strongSell: data.analystRatingsStrongSell || data.strongSell || 0,
      consensus: data.analystRecommendation || data.consensus || "Neutral", // Fallback
      updatedAt: new Date()
    };

    // Save to database (upsert)
    const savedRating = await prisma.analystRating.upsert({
      where: { symbol: ratingData.symbol },
      update: ratingData,
      create: ratingData,
    });

    return savedRating;
  } catch (error) {
    console.error("Error in fetchAnalystRatings:", error.message);
    throw error;
  }
};

module.exports = { fetchAnalystRatings };
