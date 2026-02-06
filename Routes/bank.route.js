import express from "express";
import { getBanks} from "../controller/bank.controller.js";

import { createRateLimiter } from "../middlewares/rate-limiter.middleware.js";



const bankRoute = express.Router();

// Public routes

bankRoute.use(createRateLimiter(6,1))

bankRoute.get("/", getBanks);


export default bankRoute;
