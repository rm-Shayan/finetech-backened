import dotenv from "dotenv";
import { app } from "./app.js";
import { PORT } from "./contants.js";
import { connectMongoDB } from "./config/Db.js";
import { connectRedis } from "./config/redis.js";
import { CentralizeCronJobs } from "./services/cronjobs/cronjob.js";

dotenv.config({
    path:"./.env"
});


//DBs CONNECTION
connectMongoDB();
connectRedis();


//CRON JOBS
CentralizeCronJobs();


app.listen(PORT, '0.0.0.0', () =>  console.log(`✅ Serve started at http://localhost:${PORT}`));
