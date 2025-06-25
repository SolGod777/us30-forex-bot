FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy your bot source code
COPY . .

# Expose port 8080 for Cloud Run (technically optional)
EXPOSE 8080

# Start your app
CMD ["npm", "start"]
