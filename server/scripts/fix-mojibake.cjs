/**
 * One-time repair: fix UTF-8 text that was stored as Windows-1252 mojibake.
 *
 * Example:
 *   "File marked lost â€” Better offer elsewhere"
 * becomes
 *   "File marked lost — Better offer elsewhere"
 *
 * Only string values in ActivityLog.action / ActivityLog.metadata are touched.
 * The fix is idempotent and only rewrites entries that still contain mojibake.
 *
 * Usage:
 *   node scripts/fix-mojibake.cjs            # dry run (shows what would change)
 *   node scripts/fix-mojibake.cjs --apply    # write the repair
 *
 * Connection string (in order): first CLI argument, MONGODB_URI, local FlowDesk.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const uriArg = args.find((a) => !a.startsWith('--'));
const uri =
    uriArg ||
    process.env.MONGODB_URI ||
    'mongodb://localhost:27017/FlowDesk';

const redact = (u) => u.replace(/\/\/([^@/]+)@/, '//***@');

// Windows-1252 code point -> byte, used to reverse the bad decode.
const CP1252 = {
    0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
    0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
    0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
    0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
    0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
    0x017e: 0x9e, 0x0178: 0x9f,
};

// Fallback for strings that also contain legitimate non-Latin text (which
// makes the full round-trip impossible). Longest sequences must come first.
const SEQUENCES = [
    ['â€”', '—'],
    ['â€“', '–'],
    ['â€¦', '…'],
    ['â€œ', '“'],
    ['â€', '”'],
    ['â†’', '→'],
    ['Â·', '·'],
];

const MOJIBAKE = /[âÃÂð]/;
const utf8 = new TextDecoder('utf-8', { fatal: true });

function repairText(input) {
    if (typeof input !== 'string' || !MOJIBAKE.test(input)) return input;

    // Fast path: decode the cp1252 bytes back as UTF-8.
    const bytes = [];
    let convertible = true;
    for (const ch of input) {
        const cp = ch.codePointAt(0);
        if (cp <= 0xff) bytes.push(cp);
        else if (CP1252[cp] !== undefined) bytes.push(CP1252[cp]);
        else {
            convertible = false;
            break;
        }
    }
    if (convertible) {
        try {
            const fixed = utf8.decode(Uint8Array.from(bytes));
            if (fixed && !MOJIBAKE.test(fixed)) return fixed;
        } catch {
            // Mixed content — fall through to the sequence replacement.
        }
    }

    let out = input;
    for (const [from, to] of SEQUENCES) out = out.split(from).join(to);
    return out;
}

function repairDeep(value) {
    if (typeof value === 'string') return repairText(value);
    if (Array.isArray(value)) return value.map(repairDeep);
    if (value && typeof value === 'object' && value.constructor === Object) {
        const out = {};
        for (const [key, item] of Object.entries(value)) out[key] = repairDeep(item);
        return out;
    }
    return value;
}

(async () => {
    console.log('\nFlowDesk — mojibake repair');
    console.log('Connecting to', redact(uri), '...');
    console.log(apply ? 'Mode: APPLY (changes will be written)\n' : 'Mode: DRY RUN (nothing will be written)\n');

    await mongoose.connect(uri);
    const db = mongoose.connection.db;
    const logs = db.collection('activitylogs');

    const cursor = logs.find(
        { action: MOJIBAKE },
        { projection: { action: 1, metadata: 1 } }
    );

    let scanned = 0;
    let changed = 0;

    while (await cursor.hasNext()) {
        const doc = await cursor.next();
        scanned++;
        const nextAction = repairText(doc.action);
        const nextMetadata = repairDeep(doc.metadata);
        const actionChanged = nextAction !== doc.action;
        const metadataChanged =
            JSON.stringify(nextMetadata) !== JSON.stringify(doc.metadata);

        if (!actionChanged && !metadataChanged) continue;
        changed++;

        if (changed <= 10) {
            console.log(`  ${doc._id}`);
            if (actionChanged) {
                console.log(`    before: ${doc.action}`);
                console.log(`    after : ${nextAction}`);
            }
        }

        if (apply) {
            await logs.updateOne(
                { _id: doc._id },
                {
                    $set: {
                        ...(actionChanged ? { action: nextAction } : {}),
                        ...(metadataChanged ? { metadata: nextMetadata } : {}),
                    },
                }
            );
        }
    }

    console.log(`\nActivity logs with mojibake: ${changed} of ${scanned} matching document(s).`);
    console.log(apply ? 'Repair written.\n' : 'Dry run only — re-run with --apply to write the repair.\n');

    await mongoose.disconnect();
})().catch(async (err) => {
    console.error('\nREPAIR FAILED:', err.message);
    try {
        await mongoose.disconnect();
    } catch {}
    process.exit(1);
});
