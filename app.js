// ====================== BEGIN ORIGINAL CODE ======================
const express = require('express');
const promClient = require('prom-client'); // Added for metrics
const responseTime = require('response-time'); // Added for request timing
const fs = require('fs');
const yenv = require('yenv');
const path = require('path');
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const moment = require('moment');
const _ = require('lodash');
const MongoStore = require('connect-mongodb-session')(session);
const numeral = require('numeral');
const helmet = require('helmet');
const colors = require('colors');
const cron = require('node-cron');
const crypto = require('crypto');
const { getConfig, getPaymentConfig, updateConfigLocal } = require('./lib/config');
const { runIndexing } = require('./lib/indexing');
const { addSchemas } = require('./lib/schema');
const { initDb, getDbUri } = require('./lib/db');
const { writeGoogleData } = require('./lib/googledata');
let handlebars = require('express-handlebars');
const i18n = require('i18n');

// ========== PROMETHEUS METRICS SETUP (NEW CODE) ==========
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

// HTTP Metrics
const httpRequestDurationMicroseconds = new promClient.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    buckets: [0.1, 0.3, 1.5, 3, 5, 10],
    labelNames: ['method', 'route', 'status_code'],
});

const httpRequestCount = new promClient.Counter({
    name: 'http_request_count',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
});

// Business Metrics
const productViews = new promClient.Counter({
    name: 'app_product_views_total',
    help: 'Total product detail page views',
    labelNames: ['product_id'],
});

const ordersCreated = new promClient.Counter({
    name: 'app_orders_created_total',
    help: 'Total orders placed',
});

const cartOperations = new promClient.Counter({
    name: 'app_cart_operations_total',
    help: 'Cart operations (add/remove)',
    labelNames: ['operation'],
});

const userLogins = new promClient.Counter({
    name: 'app_user_logins_total',
    help: 'User login attempts',
    labelNames: ['status'],
});

const paymentsProcessed = new promClient.Counter({
    name: 'app_payments_processed_total',
    help: 'Payments processed by gateway',
    labelNames: ['gateway', 'status'],
});

// Register metrics
register.registerMetric(httpRequestDurationMicroseconds);
register.registerMetric(httpRequestCount);
register.registerMetric(productViews);
register.registerMetric(ordersCreated);
register.registerMetric(cartOperations);
register.registerMetric(userLogins);
register.registerMetric(paymentsProcessed);

// ====================== CONTINUE ORIGINAL CODE ======================
if(fs.existsSync('./env.yaml')){
    process.env = yenv('env.yaml', { strict: false });
}

// Validate settings schema
const Ajv = require('ajv');
const ajv = new Ajv({ useDefaults: true });
const config = getConfig();

const baseConfig = ajv.validate(require('./config/settingsSchema'), config);
if(baseConfig === false){
    console.log(colors.red(`settings.json incorrect: ${ajv.errorsText()}`));
    process.exit(2);
}

// Validate payment gateway config
_.forEach(config.paymentGateway, (gateway) => {
    if(ajv.validate(
            require(`./config/payment/schema/${gateway}`),
            require(`./config/payment/config/${gateway}`)) === false
        ){
        console.log(colors.red(`${gateway} config is incorrect: ${ajv.errorsText()}`));
        process.exit(2);
    }
});

// Routes
const index = require('./routes/index');
const admin = require('./routes/admin');
const product = require('./routes/product');
const customer = require('./routes/customer');
const order = require('./routes/order');
const user = require('./routes/user');
const transactions = require('./routes/transactions');
const reviews = require('./routes/reviews');

const app = express();

// ========== METRICS MIDDLEWARE (NEW CODE) ==========
app.use(responseTime((req, res, time) => {
    httpRequestDurationMicroseconds
        .labels(req.method, req.path, res.statusCode)
        .observe(time / 1000); // Convert to seconds
}));

app.use((req, res, next) => {
    // Track product views
    if (req.path.startsWith('/product/') && req.method === 'GET') {
        const productId = req.path.split('/')[2];
        if (productId) productViews.labels(productId).inc();
    }

    // Track cart operations
    if (req.path === '/cart/add' && req.method === 'POST') {
        cartOperations.labels('add').inc();
    }
    if (req.path === '/cart/remove' && req.method === 'POST') {
        cartOperations.labels('remove').inc();
    }

    // Track logins
    if (req.path === '/login' && req.method === 'POST') {
        res.on('finish', () => {
            const status = res.statusCode === 200 ? 'success' : 'failure';
            userLogins.labels(status).inc();
        });
    }

    next();
});

// ====================== CONTINUE ORIGINAL CODE ======================
// Language setup
i18n.configure({ /* ... original i18n config ... */ });

// View engine setup
app.set('views', path.join(__dirname, '/views'));
app.engine('hbs', handlebars({ /* ... original handlebars config ... */ }));
app.set('view engine', 'hbs');

// Session store
const store = new MongoStore({ /* ... original session config ... */ });

// Security setup
app.enable('trust proxy');
app.use(helmet());
app.set('port', process.env.PORT || 1111);
app.use(logger('dev'));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser(config.secretCookie));
app.use(session({ /* ... original session config ... */ }));

// Routes setup
app.use(express.json({ /* ... original config ... */ }));
app.use(i18n.init);
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'views', 'themes')));
app.use(express.static(path.join(__dirname, 'node_modules', 'feather-icons')));

app.use((req, res, next) => { req.handlebars = handlebars; next(); });
app.use((req, res, next) => { res.setHeader('Cache-Control', 'no-cache, no-store'); next(); });

// Register routes
app.use('/', index);
app.use('/', customer);
app.use('/', product);
app.use('/', order);
app.use('/', user);
app.use('/', admin);
app.use('/', transactions);
app.use('/', reviews);

// ========== PAYMENT GATEWAY METRICS (NEW CODE) ==========
_.forEach(config.paymentGateway, (gateway) => {
    const router = require(`./lib/payments/${gateway}`);
    
    router.use((req, res, next) => {
        res.on('finish', () => {
            const status = res.statusCode === 200 ? 'success' : 'failed';
            paymentsProcessed.labels(gateway, status).inc();
        });
        next();
    });
    
    app.use(`/${gateway}`, router);
});

// ====================== CONTINUE ORIGINAL CODE ======================
// Error handlers
app.use((req, res, next) => { /* ... original 404 handler ... */ });
app.use((err, req, res, next) => { /* ... original error handler ... */ });

// Server startup
initDb(config.databaseConnectionString, async (err, db) => {
    // ... original DB connection logic ...
});

// ========== METRICS ENDPOINT (NEW CODE) ==========
app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});

module.exports = app;