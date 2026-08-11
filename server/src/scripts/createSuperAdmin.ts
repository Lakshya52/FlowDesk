import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import User, { UserRole } from "../models/User";
import Tenant from "../models/Tenant";

const parseArgs = () => {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : undefined;
  };
  return {
    email: get("--email") || process.env.SUPER_ADMIN_EMAIL,
    password: get("--password") || process.env.SUPER_ADMIN_PASSWORD,
    name: get("--name") || process.env.SUPER_ADMIN_NAME || "Super Admin",
    tenant: get("--tenant") || process.env.SUPER_ADMIN_TENANT,
  };
};

const main = async () => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("FATAL: MONGODB_URI is not set");
    process.exit(1);
  }

  const { email, password, name, tenant } = parseArgs();
  if (!email || !password) {
    console.error(
      "Usage: npm run create-super-admin -- --email you@example.com --password 'your-password'",
    );
    console.error(
      "Alternatively set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD in server/.env",
    );
    process.exit(1);
  }

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000, family: 4 });
  console.log("✅ Connected to MongoDB");

  // Super admin accounts are platform-level. They are NOT scoped to a tenant and
  // must not create one: that would pollute real tenant counts in the dashboard.
  let tenantId: mongoose.Types.ObjectId | undefined;
  if (tenant) {
    const found = await Tenant.findOne({ name: tenant });
    if (!found) {
      console.error(`❌ Tenant "${tenant}" not found`);
      await mongoose.disconnect();
      process.exit(1);
    }
    tenantId = found._id;
    console.log(`   Tenant: ${found.name} (${found._id})`);
  } else {
    console.log("   No --tenant passed → super admin is platform-level (no tenant attached)");
  }

  let user = await User.findOne({ email });
  if (user) {
    user.role = UserRole.SUPER_ADMIN;
    user.isActive = true;
    user.tenantId = tenantId;
    user.name = user.name || name;
    if (password) user.password = password;
    await user.save();
    console.log(`✅ Promoted existing user ${email} to SUPER_ADMIN`);
  } else {
    user = await User.create({
      name,
      email,
      password,
      role: UserRole.SUPER_ADMIN,
      tenantId,
    });
    console.log(`✅ Created SUPER_ADMIN user: ${email}`);
  }

  console.log(`   Name : ${user.name}`);
  console.log(`   Email: ${email}`);
  console.log(`   Role : ${user.role}`);
  console.log(`   Tenant: ${(await Tenant.findById(tenantId))?.name}`);

  await mongoose.disconnect();
  console.log("Done.");
  process.exit(0);
};

main().catch(async (error) => {
  console.error("❌ Failed:", error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
