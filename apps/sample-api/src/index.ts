import express from 'express';
import { DevTrace, devtraceExpressMiddleware, devtraceExpressErrorHandler } from '@devtrace/node-sdk';

const app = express();
app.use(express.json());

// Initialize DevTrace
const devtrace = new DevTrace({ 
    projectId: 'sample-project', 
    service: 'payment-api',
    collectorUrl: 'http://localhost:4310' // default
});

// Attach DevTrace Request Tracker BEFORE routes
app.use(devtraceExpressMiddleware(devtrace));

app.post('/api/orders', (req, res) => {
    // A mock endpoint that succeeds
    res.json({ success: true, orderId: 101 });
});

app.post('/api/payment', async (req, res, next) => {
    try {
        // Step 1: Auth (Simulated)
        await devtrace.withSpan('Auth middleware', async () => {
            await new Promise(r => setTimeout(r, 50));
        });
        
        // Step 2: Customer lookup (Simulated)
        await devtrace.withSpan('Customer lookup', async () => {
            await new Promise(r => setTimeout(r, 80));
        });

        // Step 3: Database insertion (Simulated)
        await devtrace.withSpan('INSERT INTO payments', async () => {
            await new Promise(r => setTimeout(r, 20));
            // Step 4: Deliberate Failure!
            throw new Error("PostgreSQL constraint violation: payment_customer_id_fkey");
        });
    } catch (error) {
        next(error); // Pass to error handler
    }
});

// Attach DevTrace Error Handler AFTER routes
app.use(devtraceExpressErrorHandler(devtrace));

// Generic error responder
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.status(500).json({ error: "Internal Server Error" });
});

const PORT = 4000;
app.listen(PORT, () => {
    console.log(`🚀 Sample API running on http://localhost:${PORT}`);
    console.log(`   Try throwing the 5-minute bug: curl -X POST http://localhost:${PORT}/api/payment`);
});
