export const PORT=process.env.PORT||3200

//cors constants
const whitelist = process.env.CORS_ORIGINS.split(",");

export const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    if (whitelist.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
};



//  jwt token variables
export const  JwtAccessSecret=process.env.JWT_ACCESS_SECRET;
export const  JwtRefreshSecret=process.env.JWT_REFRESH_SECRET;


//cloudinary


export const  CLOUDINARY_CLOUDNAME=process.env.CLOUD_NAME;
export const  CLOUDINARY_API_KEY=process.env.CLOUDINARY_API_KEY;
export const  CLOUDINARY_API_SECRET=process.env.CLOUDINARY_API_SECRET;
export const  CLOUDINARY_PRESET=process.env.CLOUDINARY_PRESET;

