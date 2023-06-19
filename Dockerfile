# Use an official Node runtime as the base image
FROM node:latest

# Set the working directory in the container to /app
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install the application
RUN npm install

# Bundle app source
COPY . .

# Build the app
RUN npm run build

# Expose port 8080 for the app
EXPOSE $PORT

# Run the app
CMD [ "npm", "start" ]
