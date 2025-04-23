# Upgrade to Node.js 16/18 (14.x is deprecated)
FROM node:14-alpine
ENV NODE_VERSION 14.0.0
RUN apk add --no-cache make gcc g++ python3 bash
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

RUN npm install
# Install dependencies in one step (faster build)
RUN npm install prom-client response-time
VOLUME /var/expressCart/data

# Expose only the app port (metrics use same port)
EXPOSE 1111

# Use direct node execution (better than npm start)
ENTRYPOINT ["npm", "start"]