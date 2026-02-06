import { createClient } from "redis";

const redisClient = createClient({
  url: process.env.REDIS_URL, // ⚠️ env name uppercase rakho
});

export const connectRedis = async () => {
  try {
    redisClient.on("connect", () => {
      console.log("✅ Redis connected successfully");
    });

    redisClient.on("error", (err) => {
      console.error("❌ Redis Client Error:", err);
    });

    await redisClient.connect();
  } catch (error) {
    console.error("❌ Redis connection failed:", error);
    process.exit(1);
  }
};

export default redisClient;
