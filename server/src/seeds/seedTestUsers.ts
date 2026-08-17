import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/FlowDesk';

const TENANT_ID = new mongoose.Types.ObjectId('000000000000000000000001');

async function seed() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db!;

  // Create test tenant if not exists
  const tenant = await db.collection('tenants').findOne({ _id: TENANT_ID });
  if (!tenant) {
    await db.collection('tenants').insertOne({
      _id: TENANT_ID,
      name: 'Test Company',
      slug: 'test-company',
      ownerId: null,
      plan: 'free',
      isActive: true,
      maxUsers: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log('Created test tenant');
  }

  const salt = await bcrypt.genSalt(12);
  const hashedPassword = await bcrypt.hash('Test@123456', salt);

  const users = [
    { email: 'testadmin@flowdesk.com', name: 'Test Admin', role: 'admin' },
    { email: 'testmanager@flowdesk.com', name: 'Test Manager', role: 'manager' },
    { email: 'testmember@flowdesk.com', name: 'Test Member', role: 'member' },
  ];

  for (const u of users) {
    const existing = await db.collection('users').findOne({ email: u.email });
    if (!existing) {
      await db.collection('users').insertOne({
        name: u.name,
        email: u.email,
        password: hashedPassword,
        role: u.role,
        tenantId: TENANT_ID,
        employeeId: `ACE${Math.floor(Math.random() * 999).toString().padStart(3, '0')}`,
        isActive: true,
        permissions: {
          allowedTabs: [
            '/dashboard', '/teams', '/assignments', '/tasks',
            '/clients', '/bulk-email', '/canvas', '/calendar',
            '/chat', '/reports', '/settings',
          ],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log(`Created user: ${u.email}`);
    } else {
      console.log(`User already exists: ${u.email}`);
    }
  }

  await mongoose.disconnect();
  console.log('Seed complete');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
