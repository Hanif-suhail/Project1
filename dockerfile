# Upgrade to Node.js 16/18 (14.x is deprecated)
FROM node:18-alpine

WORKDIR /var/expressCart

# Copy ALL files (simpler than individual folders)
COPY lib/ /var/expressCart/lib/
COPY bin/ /var/expressCart/bin/
COPY config/ /var/expressCart/config/
COPY public/ /var/expressCart/public/
COPY routes/ /var/expressCart/routes/
COPY views/ /var/expressCart/views/

COPY app.js /var/expressCart/
COPY package.json /var/expressCart/
COPY deploy.js /var/expressCart/ 

# Install dependencies in one step (faster build)
RUN npm install prom-client response-time

# Expose only the app port (metrics use same port)
EXPOSE 1111

# Use direct node execution (better than npm start)
ENTRYPOINT ["npm", "start"]