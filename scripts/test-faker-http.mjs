#!/usr/bin/env node
/**
 * Integration test for tests/faker.http
 * Resolves {{$faker ...}} variables and sends requests to webhook.site
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { faker } from '@faker-js/faker';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEBHOOK_TOKEN = '54aad5c3-bac1-421a-bb1b-54d6fa610b97';
const WEBHOOK_URL = `https://webhook.site/${WEBHOOK_TOKEN}`;
const API_URL = `https://webhook.site/token/${WEBHOOK_TOKEN}/requests?sorting=newest`;

const FAKER_GENERATORS = {
    fullName: () => faker.person.fullName(),
    firstName: () => faker.person.firstName(),
    lastName: () => faker.person.lastName(),
    email: () => faker.internet.email(),
    phone: () => faker.phone.number(),
    uuid: () => faker.string.uuid(),
    datetime: () => faker.date.recent().toISOString(),
    date: () => faker.date.recent().toISOString().slice(0, 10),
    city: () => faker.location.city(),
    country: () => faker.location.country(),
    company: () => faker.company.name(),
    word: () => faker.lorem.word(),
    url: () => faker.internet.url(),
    ipv4: () => faker.internet.ipv4(),
    password: () => faker.internet.password(),
    boolean: () => String(faker.datatype.boolean()),
};

function resolveFaker(text) {
    return text.replace(/\{\{\$faker\s+(\w+)(?:\s+(-?\d+)\s+(-?\d+))?\}\}/g, (_, type, min, max) => {
        if (type === 'int' || type === 'number') {
            const minNum = min !== undefined ? Number(min) : 0;
            const maxNum = max !== undefined ? Number(max) : 10_000;
            return String(faker.number.int({ min: minNum, max: maxNum }));
        }
        const gen = FAKER_GENERATORS[type];
        if (!gen) throw new Error(`Unknown faker type: ${type}`);
        return gen();
    });
}

function parseRequests(content) {
    const resolved = resolveFaker(content.replace(/\{\{webhook\}\}/g, WEBHOOK_URL));
    const blocks = resolved.split(/^###\s+/m).slice(1);

    return blocks.map(block => {
        const lines = block.trim().split('\n');
        const reqIdx = lines.findIndex(l => /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+/i.test(l.trim()));
        if (reqIdx < 0) return null;

        const requestLine = lines[reqIdx].trim();
        const match = requestLine.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(.+?)(?:\s+HTTP\/[\d.]+)?$/i);
        if (!match) return null;

        const [, method, url] = match;
        let bodyStart = -1;
        for (let i = reqIdx + 1; i < lines.length; i++) {
            if (lines[i].trim() === '') {
                bodyStart = i + 1;
                break;
            }
        }

        const headers = {};
        for (let i = reqIdx + 1; i < (bodyStart > 0 ? bodyStart - 1 : lines.length); i++) {
            const line = lines[i].trim();
            if (!line || line.startsWith('#')) continue;
            const colon = line.indexOf(':');
            if (colon > 0) headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
        }

        const body = bodyStart > 0 ? lines.slice(bodyStart).join('\n').trim() : undefined;
        const name = block.match(/# @name\s+(\S+)/)?.[1];
        return { name: name || `${method}-${reqIdx}`, method: method.toUpperCase(), url, headers, body };
    }).filter(Boolean);
}

async function sendRequest(req) {
    const url = resolveFaker(req.url);
    const body = req.body ? resolveFaker(req.body) : undefined;
    const headers = { 'User-Agent': 'cursor-rest-client-plus-test', ...req.headers };

    const options = { method: req.method, headers };
    if (body && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
        options.body = body;
    }

    const res = await fetch(url, options);
    const text = await res.text();
    return { status: res.status, body: text.slice(0, 200) };
}

async function getRecentWebhookRequests(beforeCount) {
    const res = await fetch(`${API_URL}&per_page=10`);
    const json = await res.json();
    return (json.data || []).slice(0, 10 - beforeCount + 4);
}

async function main() {
    const httpFile = join(__dirname, '../tests/faker.http');
    const content = readFileSync(httpFile, 'utf8');

    if (!content.includes('@save = true')) {
        throw new Error('@save = true not found in faker.http');
    }

    const before = await fetch(`${API_URL}&per_page=1`).then(r => r.json());
    const beforeCount = before.data?.length ?? 0;

    const requests = parseRequests(content);
    console.log(`\n📋 Found ${requests.length} requests in faker.http\n`);

    const results = [];
    for (const req of requests) {
        process.stdout.write(`→ ${req.name} (${req.method}) ... `);
        try {
            const result = await sendRequest(req);
            const ok = result.status >= 200 && result.status < 300;
            console.log(ok ? `✅ ${result.status}` : `❌ ${result.status}`);
            results.push({ name: req.name, ok, status: result.status });
        } catch (err) {
            console.log(`❌ ${err.message}`);
            results.push({ name: req.name, ok: false, error: err.message });
        }
    }

    // Verify webhook received requests
    await new Promise(r => setTimeout(r, 2000));
    const after = await fetch(`${API_URL}&per_page=10`).then(r => r.json());
    const newRequests = (after.data || []).filter(r => r.user_agent?.includes('cursor-rest-client-plus-test'));

    console.log(`\n📡 Webhook.site received ${newRequests.length} test request(s)`);

    const failed = results.filter(r => !r.ok);
    if (failed.length > 0) {
        console.error('\n❌ FAILED:', failed);
        process.exit(1);
    }

    const webhookRequests = requests.filter(req => req.url.includes(WEBHOOK_TOKEN));
    if (newRequests.length < webhookRequests.length) {
        console.error(`\n❌ Expected ${webhookRequests.length} webhook entries, got ${newRequests.length}`);
        process.exit(1);
    }

    // Sample: verify faker-all-types payload has person.fullName
    const postWithPerson = newRequests.find(r => r.method === 'POST' && r.content?.includes('"person"'));
    if (postWithPerson) {
        const parsed = JSON.parse(postWithPerson.content);
        const checks = [
            ['person.fullName', parsed.person?.fullName],
            ['person.email', parsed.person?.email],
            ['ids.uuid', parsed.ids?.uuid],
            ['misc.boolean', parsed.misc?.boolean],
        ];
        for (const [field, val] of checks) {
            const present = val !== undefined && val !== null && val !== '';
            console.log(`  ✓ ${field}: ${present ? String(val).slice(0, 40) : 'MISSING'}`);
            if (!present && val !== false && val !== 0) {
                console.error(`❌ Missing ${field}`);
                process.exit(1);
            }
        }
        // unique names in duplicate test
        const dupTest = newRequests.find(r => r.content?.includes('user_a'));
        if (dupTest) {
            const dup = JSON.parse(dupTest.content);
            if (dup.user_a === dup.user_b || dup.user_a === dup.user_c) {
                console.error('❌ Faker values should be unique within same request');
                process.exit(1);
            }
            console.log('  ✓ unique faker values per request');
        }
    }

    console.log('\n✅ All faker.http integration tests passed!\n');
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
