const { DevTrace } = require('./dist/index.js');

async function main() {
    console.log("Initializing DevTrace...");
    const devtrace = new DevTrace({
        projectId: 'proj-1',
        collectorUrl: 'http://localhost:4310',
        service: 'test-node-script',
        environment: 'development'
    });

    console.log("Sending a log event...");
    await devtrace.log("Hello from the Node SDK!", {
        severity: "info",
        metadata: {
            testRun: true,
            user: "admin"
        }
    });

    console.log("Simulating an error...");
    try {
        function triggerError() {
            throw new Error("This is a simulated error from the Node SDK test script!");
        }
        triggerError();
    } catch (error) {
        await devtrace.captureError(error, {
            severity: "error",
            metadata: {
                context: "error-handling-test"
            }
        });
    }

    console.log("Events sent! Check your DevTrace dashboard.");
}

main().catch(console.error);
