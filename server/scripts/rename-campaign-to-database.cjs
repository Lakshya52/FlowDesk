/**
 * One-time migration: rename the "Campaign" concept to "Database".
 *
 * What it does (idempotent — safe to run more than once):
 *   1. Renames the MongoDB collection  campaigns  ->  databases   (documents untouched)
 *   2. Renames the field on every lead:  campaignId  ->  databaseId  (links preserved)
 *      and swaps the leads index accordingly
 *   3. Updates activity-log entries: entityType "campaign" -> "database"
 *
 * Nothing is deleted. Run it BEFORE starting/deploying the renamed backend code.
 *
 * Usage:
 *   node scripts/rename-campaign-to-database.cjs [mongodb-uri]
 *
 * The connection string is taken from (in order):
 *   1. the first CLI argument
 *   2. the MONGODB_URI environment variable
 *   3. mongodb://localhost:27017/FlowDesk
 */
const mongoose = require('mongoose');

const uri =
    process.argv[2] ||
    process.env.MONGODB_URI ||
    'mongodb://localhost:27017/FlowDesk';

const redact = (u) => u.replace(/\/\/([^@/]+)@/, '//***@');

(async () => {
    console.log('\nFlowDesk — Campaign -> Database migration');
    console.log('Connecting to', redact(uri), '...\n');

    await mongoose.connect(uri);
    const db = mongoose.connection.db;
    const listNames = async () => (await db.listCollections().toArray()).map((c) => c.name);
    let names = await listNames();

    // 1) Collection: campaigns -> databases
    if (names.includes('campaigns') && names.includes('databases')) {
        const campaignsCount = await db.collection('campaigns').countDocuments();
        const databasesCount = await db.collection('databases').countDocuments();
        if (campaignsCount > 0 && databasesCount === 0) {
            // Common case: the renamed app auto-created an empty "databases"
            // collection (indexes only) before the migration ran.
            await db.collection('databases').drop();
            await db.collection('campaigns').rename('databases');
            console.log('[1/3] "databases" existed but was empty — dropped it, renamed "campaigns" -> "databases"');
        } else if (campaignsCount === 0) {
            console.log('[1/3] "campaigns" is empty — nothing to migrate, leaving "databases" as is.');
        } else {
            console.log('[1/3] ! Both "campaigns" and "databases" contain data.');
            console.log('      Skipping rename to avoid overwriting data — review manually.');
        }
    } else if (names.includes('campaigns')) {
        await db.collection('campaigns').rename('databases');
        console.log('[1/3] Renamed collection "campaigns" -> "databases"');
    } else {
        console.log('[1/3] Collection "campaigns" not found — already migrated or fresh DB.');
    }

    // 2) leads.campaignId -> leads.databaseId
    if (names.includes('leads')) {
        const leads = db.collection('leads');
        const r = await leads.updateMany(
            { campaignId: { $exists: true } },
            { $rename: { campaignId: 'databaseId' } }
        );
        console.log(`[2/3] leads: renamed campaignId -> databaseId on ${r.modifiedCount} document(s)`);

        const idxNames = (await leads.indexes().catch(() => [])).map((i) => i.name);
        const staleIndexes = idxNames.filter((n) => n && n.includes('campaignId'));
        for (const name of staleIndexes) {
            await leads.dropIndex(name);
            console.log(`      Dropped old index leads.${name}`);
        }
        if (!idxNames.includes('databaseId_1')) {
            await leads.createIndex({ databaseId: 1 });
            console.log('      Created index leads.databaseId_1');
        }
    } else {
        console.log('[2/3] No "leads" collection — skipping field rename.');
    }

    // 3) Activity logs: entityType "campaign" -> "database"
    if (names.includes('activitylogs')) {
        const a = await db
            .collection('activitylogs')
            .updateMany({ entityType: 'campaign' }, { $set: { entityType: 'database' } });
        console.log(`[3/3] activitylogs: entityType campaign -> database on ${a.modifiedCount} document(s)`);
    } else {
        console.log('[3/3] No "activitylogs" collection — skipping.');
    }

    // Verification summary
    names = await listNames();
    const databaseDocs = names.includes('databases')
        ? await db.collection('databases').countDocuments()
        : 0;
    const leadsWithDatabaseId = names.includes('leads')
        ? await db.collection('leads').countDocuments({ databaseId: { $exists: true } })
        : 0;
    const leftoverLeads = names.includes('leads')
        ? await db.collection('leads').countDocuments({ campaignId: { $exists: true } })
        : 0;
    const leftoverLogs = names.includes('activitylogs')
        ? await db.collection('activitylogs').countDocuments({ entityType: 'campaign' })
        : 0;

    console.log('\nVerification:');
    console.log(`  databases collection: ${databaseDocs} document(s)`);
    console.log(`  leads with databaseId: ${leadsWithDatabaseId} (leftover campaignId: ${leftoverLeads})`);
    console.log(`  activity logs still "campaign": ${leftoverLogs}`);
    console.log(
        `\n${leftoverLeads === 0 && leftoverLogs === 0 ? 'Migration complete.' : 'Review warnings above.'}\n`
    );

    await mongoose.disconnect();
    process.exit(leftoverLeads === 0 && leftoverLogs === 0 ? 0 : 1);
})().catch(async (err) => {
    console.error('\nMIGRATION FAILED:', err.message);
    try {
        await mongoose.disconnect();
    } catch {}
    process.exit(1);
});
