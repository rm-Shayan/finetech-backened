# 1. Base image
FROM node:22-alpine

# 2. App directory
WORKDIR /app

# 3. Copy dependency files
COPY package*.json ./

# 4. Install dependencies
RUN npm install

# 5. Copy app source
COPY . .

# 6. Expose port
EXPOSE 3200

# 7. Run app (entry point index.js)
CMD ["npm","run", "dev"]
