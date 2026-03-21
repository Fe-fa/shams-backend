import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // ── Users ───────────────────────────────────────────────────────────────
  const adminPassword   = await bcrypt.hash('admin123', 10);
  const doctorPassword  = await bcrypt.hash('doctor123', 10);
  const patientPassword = await bcrypt.hash('patient123', 10);

  await prisma.user.upsert({
    where: { email: 'admin@shams.com' },
    update: {},
    create: {
      email: 'admin@shams.com', phone: '+1234567890',
      hashedPassword: adminPassword,
      firstName: 'Admin', lastName: 'User',
      role: 'ADMIN', isVerified: true, isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: 'doctor@shams.com' },
    update: {},
    create: {
      email: 'doctor@shams.com', phone: '+1234567891',
      hashedPassword: doctorPassword,
      firstName: 'Dr. John', lastName: 'Smith',
      role: 'DOCTOR', specialization: 'General Medicine',
      department: 'General', licenseNumber: 'DOC123456',
      isVerified: true, isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: 'patient@shams.com' },
    update: {},
    create: {
      email: 'patient@shams.com', phone: '+1234567892',
      hashedPassword: patientPassword,
      firstName: 'Jane', lastName: 'Doe',
      role: 'PATIENT', isVerified: true, isActive: true,
    },
  });

  // ── Default Services (payment configurations) ────────────────────────────
  const services = [
    { name: 'General Consultation', type: 'CONSULTATION',  price: 1000, description: 'Standard doctor consultation' },
    { name: 'Follow-Up Visit',      type: 'FOLLOW_UP',     price: 500,  description: 'Follow-up after initial consultation' },
    { name: 'Laboratory Tests',     type: 'LABORATORY',    price: 1500, description: 'General lab tests and diagnostics' },
    { name: 'Emergency Care',       type: 'EMERGENCY',     price: 3000, description: 'Emergency medical services' },
    { name: 'Vaccination',          type: 'VACCINATION',   price: 800,  description: 'Standard vaccination service' },
    { name: 'General Checkup',      type: 'CHECKUP',       price: 1200, description: 'Comprehensive health checkup' },
  ];

  for (const s of services) {
    await prisma.service.upsert({
      where: { name: s.name },
      update: { price: s.price, description: s.description },
      create: {
        name: s.name,
        type: s.type as any,
        price: s.price,
        description: s.description,
        isActive: true,
      },
    });
  }

  console.log('✅ Seed complete: users + default service prices created');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());