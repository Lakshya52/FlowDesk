import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Lead from '../modules/crm/leads/lead.model';
import Campaign from '../modules/crm/campaigns/campaign.model';
import Tenant from '../modules/settings/tenant.model';
import User from '../modules/users/user.model';

dotenv.config();

const priorities = ['very high', 'high', 'medium', 'low'] as const;
const statuses = [
    'new', 'attempted', 'connected', 'interested',
    'callback_scheduled', 'meeting_scheduled',
    'not_interested', 'not_reachable', 'do_not_call',
    'closed_won', 'closed_lost',
] as const;
const scheduleTypes = ['follow_up', 'meeting'] as const;
const meetingStatuses = ['scheduled', 'done', 'canceled'] as const;
const industries = [
    'Technology', 'Finance', 'Healthcare', 'Education',
    'Manufacturing', 'Real Estate', 'Retail', 'Logistics',
    'Energy', 'Entertainment', 'Telecommunications', 'Agriculture',
];
const cities = [
    'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Ahmedabad',
    'Chennai', 'Kolkata', 'Pune', 'Jaipur', 'Lucknow',
    'Surat', 'Indore', 'Bhopal', 'Chandigarh', 'Nagpur',
];
const states = [
    'Maharashtra', 'Delhi', 'Karnataka', 'Telangana', 'Gujarat',
    'Tamil Nadu', 'West Bengal', 'Rajasthan', 'Uttar Pradesh',
    'Madhya Pradesh', 'Punjab', 'Haryana',
];
const designations = [
    'CEO', 'CTO', 'CFO', 'Director', 'Manager',
    'Team Lead', 'Executive', 'Consultant', 'Analyst',
    'Engineer', 'Coordinator', 'VP Operations',
];
const firstNames = [
    'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun',
    'Sai', 'Pranav', 'Dhruv', 'Krishna', 'Laksh',
    'Ananya', 'Diya', 'Myra', 'Sara', 'Ishita',
    'Priya', 'Kavya', 'Neha', 'Riya', 'Aisha',
    'Raj', 'Amit', 'Suresh', 'Ravi', 'Vikram',
    'Sunita', 'Meera', 'Pooja', 'Anita', 'Deepa',
];
const lastNames = [
    'Sharma', 'Verma', 'Patel', 'Singh', 'Kumar',
    'Reddy', 'Gupta', 'Joshi', 'Nair', 'Das',
    'Mishra', 'Agarwal', 'Rao', 'Mehta', 'Chopra',
    'Desai', 'Pillai', 'Menon', 'Iyer', 'Saxena',
];
const companies = [
    'TechVista', 'InnovateNow', 'AceOne Corp', 'FlowDesk Inc',
    'DataPulse', 'CloudBase', 'NexGen Solutions', 'PrimeWave Tech',
    'Stellar Systems', 'Orbit Digital', 'Vertex Global', 'Pinnacle Ltd',
    'Quantum IT', 'BlueSky Enterprises', 'RedHorizon Pvt Ltd',
];

function pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPhone(): string {
    const prefixes = ['98', '97', '99', '88', '87', '86', '70', '71', '72', '80'];
    const prefix = pick(prefixes);
    let num = prefix;
    for (let i = 0; i < 8; i++) {
        num += randInt(0, 9);
    }
    return num;
}

function randomEmail(first: string, last: string): string {
    const domains = ['gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com', 'company.com'];
    return `${first.toLowerCase()}.${last.toLowerCase()}${randInt(1, 999)}@${pick(domains)}`;
}

function randomPincode(): string {
    return String(randInt(100000, 999999));
}

function randomPan(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('') as readonly string[];
    let pan = '';
    for (let i = 0; i < 5; i++) pan += pick(chars);
    pan += randInt(1000, 9999);
    pan += pick(chars);
    return pan;
}

function randomGst(): string {
    const stateCodes = ['27', '07', '08', '10', '24', '33', '19', '06'];
    return `${pick(stateCodes)}${randomPan()}${randInt(1, 9)}Z${pick(['A', 'B', 'C'])}`;
}

const seedLeads = async () => {
    try {
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/FlowDesk';
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        let tenant = await Tenant.findOne();
        if (!tenant) {
            const adminUser = await User.findOne();
            if (!adminUser) {
                console.error('No users found. Run seed.ts first.');
                process.exit(1);
            }
            tenant = await Tenant.create({
                name: 'Default Tenant',
                ownerId: adminUser._id,
                plan: 'pro',
                isActive: true,
            });
            console.log(`Created tenant: ${tenant._id}`);
        } else {
            console.log(`Found tenant: ${tenant._id}`);
        }

        let campaign = await Campaign.findOne();
        if (!campaign) {
            const adminUser = await User.findOne();
            if (!adminUser) {
                console.error('No users found. Run seed.ts first.');
                process.exit(1);
            }
            campaign = await Campaign.create({
                name: 'Default Campaign',
                purpose: 'Sample campaign for seed data',
                tenantId: tenant._id,
                createdBy: adminUser._id,
            });
            console.log(`Created campaign: ${campaign._id}`);
        } else {
            console.log(`Found campaign: ${campaign._id}`);
        }

        const users = await User.find();
        if (users.length === 0) {
            console.error('No users found. Run seed.ts first.');
            process.exit(1);
        }

        const sampleUserIds = users.map(u => u._id);

        const leads = [];
        for (let i = 0; i < 1000; i++) {
            const first = pick(firstNames);
            const last = pick(lastNames);
            const priority = pick(priorities);
            const status = pick(statuses);
            const includeSchedule = Math.random() < 0.3;
            const includeMeeting = Math.random() < 0.15;
            const includeNotes = Math.random() < 0.4;
            const hasCall = Math.random() < 0.6;

            const lead: Record<string, unknown> = {
                campaignId: campaign!._id,
                tenantId: tenant!._id,
                name: `${first} ${last}`,
                followUpCount: 0,
                meetingCount: 0,
                followUpLogs: [],
                meetingLogs: [],
                designation: Math.random() < 0.7 ? pick(designations) : undefined,
                phone: randomPhone(),
                alternatePhone: Math.random() < 0.3 ? randomPhone() : undefined,
                companyName: Math.random() < 0.6 ? pick(companies) : undefined,
                addressLine: Math.random() < 0.5 ? `${randInt(1, 999)}, ${pick(['Main St', 'Park Ave', 'MG Road', 'Sector 12', 'Lake View'])}` : undefined,
                city: Math.random() < 0.7 ? pick(cities) : undefined,
                state: Math.random() < 0.6 ? pick(states) : undefined,
                pincode: Math.random() < 0.5 ? randomPincode() : undefined,
                companyPan: Math.random() < 0.3 ? randomPan() : undefined,
                companyGst: Math.random() < 0.2 ? randomGst() : undefined,
                industry: Math.random() < 0.5 ? pick(industries) : undefined,
                email: randomEmail(first, last),
                website: Math.random() < 0.3 ? `https://www.${first.toLowerCase()}${last.toLowerCase()}.com` : undefined,
                priority,
                source: pick(['Udyam Capital', 'Website', 'Referral', 'LinkedIn', 'Cold Call', 'Email Campaign', 'Trade Show', 'Partner']),
                status,
                callCount: hasCall ? randInt(1, 15) : 0,
                lastCallAt: hasCall ? new Date(Date.now() - randInt(0, 90) * 24 * 60 * 60 * 1000) : undefined,
                callDuration: hasCall ? randInt(30, 3600) : 0,
                notes: includeNotes
                    ? [
                          {
                              text: pick([
                                  'Initial contact made.',
                                  'Sent follow-up email.',
                                  'Client requested a demo.',
                                  'Discussion about pricing.',
                                  'Follow up call scheduled.',
                                  'Meeting scheduled for next week.',
                              ]),
                              createdBy: pick(sampleUserIds),
                              createdAt: new Date(Date.now() - randInt(0, 60) * 24 * 60 * 60 * 1000),
                          },
                      ]
                    : [],
            };

            if (includeSchedule) {
                lead.scheduleType = pick(scheduleTypes);
                lead.nextFollowupAt = new Date(Date.now() + randInt(1, 30) * 24 * 60 * 60 * 1000);
            }

            if (includeMeeting) {
                lead.meetingStatus = pick(meetingStatuses);
                lead.meetingAt = new Date(Date.now() + randInt(1, 30) * 24 * 60 * 60 * 1000);
                lead.scheduleType = 'meeting';
            }

            leads.push(lead);
        }

        const result = await Lead.insertMany(leads);
        console.log(`Inserted ${result.length} sample leads`);

        await mongoose.disconnect();
        console.log('Done');
    } catch (error) {
        console.error('Seed failed:', error);
        process.exit(1);
    }
};

seedLeads();
