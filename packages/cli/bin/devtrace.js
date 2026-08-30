#!/usr/bin/env node
/**
 * DevTrace CLI — interact with your local DevTrace collector.
 * Usage: devtrace <command> [options]
 */

import { program } from 'commander';
import chalk from 'chalk';
import ora from 'ora';

const DEFAULT_COLLECTOR = 'http://localhost:4310';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function collectorUrl(opts) {
    return (opts.collector || DEFAULT_COLLECTOR).replace(/\/$/, '');
}

async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return res.json();
}

function formatEvent(e) {
    const ts = new Date(e.timestamp).toLocaleTimeString('en-US', { hour12: false });
    const typeColors = { error: chalk.red, log: chalk.cyan, trace: chalk.green };
    const typeLabel = (typeColors[e.type] || chalk.gray)(`[${e.type.toUpperCase()}]`);
    const service = e.service ? chalk.dim(` (${e.service})`) : '';
    const payload = e.payload ? chalk.white(` ${e.payload}`) : '';
    const excs = e.exceptions?.length ? chalk.red(` ⚡ ${e.exceptions[0].type}: ${e.exceptions[0].message}`) : '';
    return `${chalk.dim(ts)} ${typeLabel}${service}${payload || excs}`;
}

function printBanner() {
    console.log(chalk.bold.hex('#7367F0')('\n  DevTrace CLI  ') + chalk.dim('— Observability for your local environment\n'));
}

// ─── Commands ─────────────────────────────────────────────────────────────────

program
    .name('devtrace')
    .description('DevTrace CLI — manage your local telemetry collector')
    .version('0.0.1');

// ── devtrace status ──────────────────────────────────────────────────────────
program
    .command('status')
    .description('Check if the collector is running and healthy')
    .option('-c, --collector <url>', 'Collector URL', DEFAULT_COLLECTOR)
    .action(async (opts) => {
        printBanner();
        const spinner = ora('Checking collector...').start();
        try {
            const projects = await fetchJSON(`${collectorUrl(opts)}/api/v1/projects`);
            const events = await fetchJSON(`${collectorUrl(opts)}/api/v1/events`);
            spinner.succeed(chalk.green('Collector is running'));
            console.log(`\n  ${chalk.bold('URL:')}      ${chalk.cyan(collectorUrl(opts))}`);
            console.log(`  ${chalk.bold('Projects:')} ${chalk.yellow(projects.length)}`);
            console.log(`  ${chalk.bold('Events:')}   ${chalk.yellow(events.length)} (latest 100)\n`);
        } catch (err) {
            spinner.fail(chalk.red('Collector is not reachable'));
            console.log(chalk.dim(`\n  Is the collector running? Try:\n  ${chalk.cyan('go run ./cmd/devtrace-collector')}\n`));
            process.exit(1);
        }
    });

// ── devtrace logs ────────────────────────────────────────────────────────────
program
    .command('logs')
    .description('Stream events from the collector in real-time')
    .option('-c, --collector <url>', 'Collector URL', DEFAULT_COLLECTOR)
    .option('-f, --filter <type>', 'Filter by type: error|log|trace')
    .option('-p, --project <id>', 'Filter by project ID')
    .option('-n, --lines <n>', 'Show last N events', '20')
    .action(async (opts) => {
        printBanner();

        const showEvents = async () => {
            try {
                let url = `${collectorUrl(opts)}/api/v1/events`;
                if (opts.project) url += `?project_id=${opts.project}`;
                const events = await fetchJSON(url);
                const filtered = opts.filter ? events.filter(e => e.type === opts.filter) : events;
                const latest = filtered.slice(0, parseInt(opts.lines));
                process.stdout.write('\x1Bc'); // clear screen
                console.log(chalk.bold.hex('#7367F0')('  DevTrace — Live Events  ') + chalk.dim(`(polling every 3s)\n`));
                if (latest.length === 0) {
                    console.log(chalk.dim('  No events yet. Start firing some events to see them here.'));
                } else {
                    latest.forEach(e => console.log('  ' + formatEvent(e)));
                }
                console.log(chalk.dim(`\n  Showing ${latest.length} events. Press Ctrl+C to stop.`));
            } catch (err) {
                console.error(chalk.red(`  ✗ Failed to fetch events: ${err.message}`));
            }
        };

        await showEvents();
        const iv = setInterval(showEvents, 3000);

        process.on('SIGINT', () => {
            clearInterval(iv);
            console.log(chalk.dim('\n  Stopped.\n'));
            process.exit(0);
        });
    });

// ── devtrace projects list ───────────────────────────────────────────────────
program
    .command('projects')
    .description('List all projects')
    .option('-c, --collector <url>', 'Collector URL', DEFAULT_COLLECTOR)
    .action(async (opts) => {
        printBanner();
        const spinner = ora('Fetching projects...').start();
        try {
            const projects = await fetchJSON(`${collectorUrl(opts)}/api/v1/projects`);
            spinner.stop();
            if (projects.length === 0) {
                console.log(chalk.dim('  No projects found. Create one:\n'));
                console.log(chalk.cyan(`  devtrace create-project --name "My App"`));
            } else {
                console.log(chalk.bold('  Projects:\n'));
                projects.forEach((p, i) => {
                    const created = new Date(p.created_at).toLocaleDateString();
                    console.log(`  ${chalk.hex('#7367F0')(String(i + 1).padStart(2))}  ${chalk.bold(p.name)}`);
                    console.log(`     ${chalk.dim('ID:')} ${chalk.cyan(p.id)}  ${chalk.dim('Path:')} ${p.path}  ${chalk.dim('Created:')} ${created}`);
                    console.log();
                });
            }
        } catch (err) {
            spinner.fail(chalk.red(`Failed: ${err.message}`));
            process.exit(1);
        }
    });

// ── devtrace create-project ──────────────────────────────────────────────────
program
    .command('create-project')
    .description('Create a new project')
    .requiredOption('-n, --name <name>', 'Project name')
    .option('-p, --path <path>', 'Project path/scope', '/')
    .option('-c, --collector <url>', 'Collector URL', DEFAULT_COLLECTOR)
    .action(async (opts) => {
        printBanner();
        const id = opts.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const spinner = ora(`Creating project ${chalk.cyan(opts.name)}...`).start();
        try {
            const res = await fetch(`${collectorUrl(opts)}/api/v1/projects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, name: opts.name, path: opts.path }),
            });
            if (!res.ok) throw new Error(await res.text());
            const project = await res.json();
            spinner.succeed(chalk.green(`Project created!`));
            console.log(`\n  ${chalk.bold('Name:')} ${project.name}`);
            console.log(`  ${chalk.bold('ID:')}   ${chalk.cyan(project.id)}`);
            console.log(`  ${chalk.bold('Path:')} ${project.path}`);
            console.log(chalk.dim(`\n  Use this in your SDK:`));
            console.log(chalk.cyan(`  projectId: '${project.id}'\n`));
        } catch (err) {
            spinner.fail(chalk.red(`Failed: ${err.message}`));
            process.exit(1);
        }
    });

// ── devtrace clear ───────────────────────────────────────────────────────────
program
    .command('clear')
    .description('⚠️  Clear all events from the local database')
    .option('-c, --collector <url>', 'Collector URL', DEFAULT_COLLECTOR)
    .action(async (opts) => {
        printBanner();
        console.log(chalk.yellow('  ⚠️  This will delete ALL events from the local database!\n'));
        // Simple confirmation via stdin
        process.stdout.write('  Type "yes" to confirm: ');
        process.stdin.setEncoding('utf8');
        process.stdin.once('data', async (data) => {
            if (data.trim() !== 'yes') {
                console.log(chalk.dim('\n  Aborted.\n'));
                process.exit(0);
            }
            const spinner = ora('Clearing events...').start();
            try {
                const res = await fetch(`${collectorUrl(opts)}/api/v1/events`, { method: 'DELETE' });
                if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
                spinner.succeed(chalk.green('All events cleared.'));
            } catch (err) {
                spinner.fail(chalk.red(`Failed: ${err.message}`));
                process.exit(1);
            }
        });
    });

program.parse();
