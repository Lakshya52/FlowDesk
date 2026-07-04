/**
 * Seed script to create test users for Playwright tests.
 * Run once before tests: npx tsx tests/seed.ts
 * Or the globalSetup will run this automatically.
 */
import axios from 'axios';

const API = 'http://localhost:5000/api';

const users = [
  { name: 'Test Admin', email: 'testadmin@flowdesk.com', password: 'Test@123456', role: 'admin' },
  { name: 'Test Manager', email: 'testmanager@flowdesk.com', password: 'Test@123456', role: 'manager' },
  { name: 'Test Member', email: 'testmember@flowdesk.com', password: 'Test@123456', role: 'member' },
];

async function seed() {
  // First register an admin account to get a tenant
  try {
    const regRes = await axios.post(`${API}/auth/register`, {
      name: 'Test Admin',
      email: 'testadmin@flowdesk.com',
      password: 'Test@123456',
      companyName: 'Test Company',
    });
    console.log('Registration initiated:', regRes.data);
    console.log('NOTE: Check for OTP and call verify-registration-otp to complete registration.');
    return;
  } catch (err: any) {
    if (err.response?.status === 409) {
      console.log('User already exists, trying login...');
    } else if (err.response?.data?.message?.includes('already')) {
      console.log('Email already registered.');
    } else {
      console.log('Registration error (may be expected):', err.response?.data?.message || err.message);
    }
  }

  // Try logging in with admin
  try {
    const loginRes = await axios.post(`${API}/auth/login`, {
      email: 'testadmin@flowdesk.com',
      password: 'Test@123456',
    });
    console.log('Admin login success');

    const token = loginRes.data.token;
    const adminHeaders = { Authorization: `Bearer ${token}` };

    // Create manager user
    try {
      await axios.post(`${API}/auth/users/create`, {
        name: 'Test Manager',
        email: 'testmanager@flowdesk.com',
        password: 'Test@123456',
        role: 'manager',
      }, { headers: adminHeaders });
      console.log('Manager user created');
    } catch (e: any) {
      console.log('Manager user may already exist:', e.response?.data?.message || e.message);
    }

    // Create member user
    try {
      await axios.post(`${API}/auth/users/create`, {
        name: 'Test Member',
        email: 'testmember@flowdesk.com',
        password: 'Test@123456',
        role: 'member',
      }, { headers: adminHeaders });
      console.log('Member user created');
    } catch (e: any) {
      console.log('Member user may already exist:', e.response?.data?.message || e.message);
    }

    console.log('\n--- Seed complete ---');
    console.log('Test users available:');
    console.log('  Admin:  testadmin@flowdesk.com / Test@123456');
    console.log('  Manager: testmanager@flowdesk.com / Test@123456');
    console.log('  Member:  testmember@flowdesk.com / Test@123456');
  } catch (err: any) {
    console.error('Login failed:', err.response?.data?.message || err.message);
    console.log('\nTo set up test users manually:');
    console.log('1. Register at http://localhost:5173/#/register');
    console.log('2. Create additional users via Settings > Users');
  }
}

seed();
