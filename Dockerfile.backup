FROM node:14-alpine

ENV NODE_VERSION 14.0.0

WORKDIR /var/expressCart

# Copy application files to the container
COPY lib/ /var/expressCart/lib/
COPY bin/ /var/expressCart/bin/
COPY config/ /var/expressCart/config/
COPY public/ /var/expressCart/public/
COPY routes/ /var/expressCart/routes/
COPY views/ /var/expressCart/views/

COPY app.js /var/expressCart/
COPY package.json /var/expressCart/
COPY deploy.js /var/expressCart/

# Install dependencies including prom-client for Prometheus metrics
RUN npm install

# Install prom-client package for Prometheus monitoring
RUN npm install prom-client

# Expose the port for your app
EXPOSE 1111
# Expose the port for Prometheus metrics (customizable, default is 3000)
EXPOSE 3000

# Command to start the app
ENTRYPOINT ["npm", "start"]